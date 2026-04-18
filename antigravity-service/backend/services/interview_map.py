"""
Resume-grounded interview map / trajectory bank.

This module builds a structured, resume-specific fallback spine for the interview.
It is additive to the live weakness/discrepancy/speculative pipeline:

- live pipeline wins when it has a strong next move
- trajectory map wins when runtime generation is weak, generic, or not ready

The emphasis here is robustness:
- deterministic focus extraction from parsed resume
- per-focus generation so we do not collapse into one giant brittle JSON blob
- structured branches by sprint + answer state
- deterministic fallback templates when the LLM underperforms
"""

from __future__ import annotations

import asyncio
import json
import re
import time

from backend.models.llm_router import LLMRouter


_VALID_BRANCHES = {
    "if_strong",
    "if_vague",
    "if_honest_gap",
    "if_claim_conflict",
    "if_short_answer",
    "bridge_to_next_focus",
}

_SPRINT_KEYS = ("sprint_1", "sprint_2", "sprint_3")
_SPRINT_KEY = {1: "sprint_1", 2: "sprint_2", 3: "sprint_3"}

_BRANCH_PRIORITY_DEFAULT = [
    "if_vague",
    "if_strong",
    "bridge_to_next_focus",
]
_BRANCH_PRIORITY_SHORT = [
    "if_short_answer",
    "if_vague",
    "if_strong",
    "bridge_to_next_focus",
]
_BRANCH_PRIORITY_ADMISSION = [
    "if_honest_gap",
    "if_vague",
    "if_strong",
    "bridge_to_next_focus",
]
_BRANCH_PRIORITY_DISCREPANCY = [
    "if_claim_conflict",
    "if_vague",
    "if_strong",
    "bridge_to_next_focus",
]

ROUTE_SHORT_ANSWER_RESCUE = "trajectory_map_short_answer_rescue"
ROUTE_HONESTY_PROBE = "trajectory_map_honesty_probe"
ROUTE_FOLLOWUP = "trajectory_map_followup"
ROUTE_BRIDGE = "trajectory_map_bridge"
ROUTE_CHALLENGE = "trajectory_map_challenge"
ROUTE_STRONG = "trajectory_map_strong_followup"

_BRANCH_TO_ROUTE = {
    "if_short_answer": ROUTE_SHORT_ANSWER_RESCUE,
    "if_honest_gap": ROUTE_HONESTY_PROBE,
    "if_claim_conflict": ROUTE_CHALLENGE,
    "bridge_to_next_focus": ROUTE_BRIDGE,
    "if_strong": ROUTE_STRONG,
    "if_vague": ROUTE_FOLLOWUP,
}


_TRACK_SYSTEM = """You are designing an elite interviewer's fallback spine for one specific resume focus area.

Your job is not to brainstorm generic prompts. Your job is to write surgical, interviewer-quality moves that:
- stay on the exact focus area named
- test ownership, implementation detail, mechanism understanding, honesty, and design judgment
- sound like a strong human interviewer who remembers the candidate's background
- treat the provided exact resume snippets as the source of truth for what the candidate claimed

You must avoid all lazy or generic interview language.
Every branch should feel usable in a real adversarial technical interview without further editing.
Do not invent technologies, scale requirements, ownership, or artifacts that are not grounded in the provided resume context."""

_TRACK_USER_TEMPLATE = """Candidate background:
{resume_context}

Current focus area:
- Label: {label}
- Focus key: {focus_key}
- Supporting resume details: {anchor_context}
- Exact resume snippets:
{resume_snippets}
- Example next focus for a natural bridge: {next_focus_label}

Return ONLY a JSON object with this exact structure:
{{
  "sprint_1": {{
    "if_strong": "implementation/depth follow-up if they show real ownership",
    "if_vague": "ownership/mechanism probe if they answer vaguely",
    "if_honest_gap": "honesty-aware question that rewards admission and pivots to what they do know",
    "if_claim_conflict": "specific contradiction probe if answer conflicts with resume claim",
    "if_short_answer": "rescue question for a 1-5 word answer",
    "bridge_to_next_focus": "natural pivot from this focus area toward {next_focus_label}"
  }},
  "sprint_2": {{
    "if_strong": "...",
    "if_vague": "...",
    "if_honest_gap": "...",
    "if_claim_conflict": "...",
    "if_short_answer": "...",
    "bridge_to_next_focus": "..."
  }},
  "sprint_3": {{
    "if_strong": "...",
    "if_vague": "...",
    "if_honest_gap": "...",
    "if_claim_conflict": "...",
    "if_short_answer": "...",
    "bridge_to_next_focus": "..."
  }}
}}

Branch intent:
- sprint_1 / if_strong: deepen ownership, implementation decision, concrete build choices
- sprint_1 / if_vague: force specificity about what they personally built or configured
- sprint_1 / if_honest_gap: reward honesty, then pivot to the part they do understand
- sprint_1 / if_claim_conflict: confront mismatch between claim and answer with a concrete ownership probe
- sprint_1 / if_short_answer: rescue a 1-5 word answer without sounding generic
- sprint_1 / bridge_to_next_focus: natural pivot sentence that names the next focus

- sprint_2 branches: mechanism, concepts, tradeoffs, measurement, debugging, instrumentation
- sprint_3 branches: scale, failure modes, reliability, production design consequences

Hard rules:
- every question must explicitly reference this focus area, its artifact, or its technologies/claims
- every question must stay grounded in the exact resume snippets / anchor context above
- do not drift to another project unless the branch is bridge_to_next_focus
- do not ask broad generic questions like "what would you do differently?" unless tied to a named artifact, mechanism, or constraint
- do not produce filler phrases like "interesting" or "got it"
- avoid repeating the exact same angle across branches
- keep each question <= 24 words
- bridge_to_next_focus and sprint pivots must explicitly signal the transition in the question itself, e.g. "Switching to your..." or "On the systems side of..."
- do not invent technologies, scale, latency targets, or ownership claims missing from the snippets above
- no markdown fences, no commentary, JSON only
"""

_GENERIC_PHRASES = (
    "what would you do differently",
    "walk me through your thinking",
    "say more about",
    "tell me more",
    "can you elaborate",
    "where does your mental model",
)

_SNIPPET_TOKEN_STOPWORDS = {
    "with", "from", "that", "this", "these", "those", "their", "there", "into",
    "using", "used", "built", "build", "engineered", "worked", "project", "projects",
    "present", "current", "technical", "skills", "experience", "assistant", "intern",
    "research", "school", "university", "admission", "scholarship", "leading", "peer",
    "advisor", "china", "shenzhen", "hong", "kong", "district", "boulevard",
}


def _normalize_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def _compact_focus_key(label: str, proposed: str = "", max_tokens: int = 6) -> str:
    ignored = {
        "ai", "ml", "engineering", "engineer", "intern", "internship",
        "project", "projects", "system", "systems", "work", "experience",
        "built", "using", "with", "custom", "full", "stack",
    }
    tokens: list[str] = []
    seen: set[str] = set()
    for source in (proposed, label):
        for token in re.findall(r"[a-z0-9]+", (source or "").lower()):
            if len(token) <= 2 or token in ignored or token in seen:
                continue
            tokens.append(token)
            seen.add(token)
            if len(tokens) >= max_tokens:
                return "_".join(tokens)
    return _normalize_key(proposed or label)


def _tokenize(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", (text or "").lower())
        if len(token) > 2 and token not in _SNIPPET_TOKEN_STOPWORDS
    }


def _anchor_context_for_focus(seed: dict) -> str:
    return str(seed.get("anchor_context", "") or "").strip()


def _resume_units(resume: str) -> list[str]:
    units: list[str] = []
    for raw_line in resume.splitlines():
        line = re.sub(r"\s+", " ", raw_line.replace("•", " ").strip())
        if len(line) < 12:
            continue
        if re.fullmatch(r"[-–—:| ]+", line):
            continue
        units.append(line)
    return units


def _is_noise_snippet(unit: str) -> bool:
    lowered = unit.lower()
    if "@" in unit and "." in unit and len(unit.split()) <= 8:
        return True
    if re.fullmatch(r"[0-9+| :/().-]+", unit):
        return True
    if lowered.startswith("technical skills") or lowered == "experience:":
        return True
    return False


def _extract_resume_snippets(resume: str, seed: dict, limit: int = 3) -> list[str]:
    units = _resume_units(resume)
    if not units:
        return []

    query_tokens = _tokenize(f"{seed.get('label', '')} {_anchor_context_for_focus(seed)}")
    if not query_tokens:
        return []

    scored: list[tuple[int, int, str]] = []
    for unit in units:
        if _is_noise_snippet(unit):
            continue
        unit_tokens = _tokenize(unit)
        if not unit_tokens:
            continue
        overlap = query_tokens & unit_tokens
        if not overlap:
            continue
        exact_phrase_bonus = 2 if seed.get("label", "").lower() in unit.lower() else 0
        scored.append((len(overlap) + exact_phrase_bonus, len(unit_tokens), unit))

    scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
    snippets: list[str] = []
    for _, _, unit in scored:
        if unit not in snippets:
            snippets.append(unit)
        if len(snippets) >= limit:
            break
    return snippets


def _fallback_focus_seeds_from_resume(resume: str, limit: int = 5) -> list[dict]:
    seeds: list[dict] = []
    seen: set[str] = set()
    units = _resume_units(resume)
    for unit in units:
        lowered = unit.lower()
        if _is_noise_snippet(unit):
            continue
        if not any(marker in lowered for marker in ("intern", "engineer", "assistant", "@", "pipeline", "project")):
            continue
        label = unit.split(":", 1)[0].strip(" -")
        if "@" in label:
            label = label.split("@", 1)[0].strip(" -")
        if len(label) > 80:
            label = label[:80].rsplit(" ", 1)[0]
        focus_key = _compact_focus_key(label)
        if not focus_key or focus_key in seen:
            continue
        seeds.append({
            "label": label,
            "focus_key": focus_key,
            "anchor_context": unit[:220],
        })
        seen.add(focus_key)
        if len(seeds) >= limit:
            break
    return seeds


_SEED_SYSTEM = """You are reading a candidate's resume to identify the most interview-worthy focus areas.
Return only real projects, internships, research efforts, or technical work from the resume text itself.
Never return locations, universities, URLs, section headers, scholarships, or generic skill buckets.
Do not invent focus areas that are not explicitly supported by the resume."""

_SEED_USER_TEMPLATE = """Resume:
{resume}

Return a JSON array of 3-5 focus areas worth interviewing on. Each must be a specific project, role, or technical claim from this resume.

Return ONLY a JSON array, no commentary:
[
  {{
    "label": "short human-readable name (e.g. 'TinyML Audio Pipeline' or 'Filmora AIGC Internship')",
    "focus_key": "snake_case_identifier",
    "anchor_context": "1-2 sentence summary of what they claimed to build or do here"
  }}
]

Rules:
- Only include real technical work: projects, internships, research, deployed systems
- Never include: universities, cities, countries, URLs, skill lists, GPA, scholarship names
- focus_key must be lowercase with underscores, max 6 words"""


async def _extract_focus_seeds_llm(resume: str, session_id: str = "") -> list[dict]:
    """
    Ask Haiku to read the raw resume and return structured focus area seeds.
    This replaces all brittle manual parsing.
    """
    llm = LLMRouter(tier="small")
    user = _SEED_USER_TEMPLATE.format(resume=resume[:3000])
    try:
        raw = await llm.call(system=_SEED_SYSTEM, user=user, max_tokens=600)
        if isinstance(raw, list):
            result = raw
        elif isinstance(raw, str):
            cleaned = raw.strip()
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
            result = json.loads(cleaned)
        elif isinstance(raw, dict) and "focus_areas" in raw:
            result = raw["focus_areas"]
        else:
            result = []

        seeds = []
        for item in result:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label", "") or "").strip()
            focus_key = str(item.get("focus_key", "") or "").strip()
            anchor = str(item.get("anchor_context", "") or "").strip()
            if not label or not focus_key:
                continue
            seeds.append({
                "label": label,
                "focus_key": _compact_focus_key(label, focus_key),
                "anchor_context": anchor,
            })
        return seeds[:5]
    except Exception as e:
        print(f"[TrajectoryMap] Seed extraction failed" + (f" for {session_id[:8]}" if session_id else "") + f": {e}")
        return []


def _fallback_track(seed: dict, next_focus_label: str) -> dict:
    label = str(seed.get("label", "") or "this work").strip()
    anchor = _anchor_context_for_focus(seed)
    anchor_bits = [bit.strip() for bit in re.split(r"[|;]", anchor) if bit.strip()]
    tech_hint = ""
    if anchor_bits:
        tech_hint = anchor_bits[0]

    def _focus_phrase() -> str:
        return label if len(label.split()) <= 6 else tech_hint or label

    focus = _focus_phrase()
    return {
        "sprint_1": {
            "if_strong": f"In {focus}, which implementation choice most affected the result?",
            "if_vague": f"In {focus}, what exact piece did you personally design or implement?",
            "if_honest_gap": f"That's helpful. In {focus}, which part did you understand most deeply yourself?",
            "if_claim_conflict": f"Your resume suggests strong ownership in {focus}. Which concrete piece did you actually build?",
            "if_short_answer": f"Staying with {focus}, what specific detail should I understand from that answer?",
            "bridge_to_next_focus": f"Before we move on, how does {focus} connect to {next_focus_label}?",
        },
        "sprint_2": {
            "if_strong": f"In {focus}, which core technical idea mattered most and why?",
            "if_vague": f"For {focus}, what mechanism actually made it work under the hood?",
            "if_honest_gap": f"Even if you did not build all of {focus}, what concept there do you understand best?",
            "if_claim_conflict": f"You mention {focus} confidently on the resume. Which underlying concept did you personally reason about?",
            "if_short_answer": f"When you answer briefly about {focus}, what concrete mechanism are you pointing to?",
            "bridge_to_next_focus": f"Keeping {focus} in mind, what related area from your background should we examine next?",
        },
        "sprint_3": {
            "if_strong": f"If {focus} had to scale sharply, what part would you redesign first?",
            "if_vague": f"What would be the first real reliability risk if {focus} faced heavier production load?",
            "if_honest_gap": f"If you did not own all of {focus}, which design tradeoff there can you still reason about confidently?",
            "if_claim_conflict": f"If {focus} were pushed harder in production, where would your current design story start to break?",
            "if_short_answer": f"For {focus}, what specific bottleneck or failure mode are you referring to?",
            "bridge_to_next_focus": f"Using {focus} as a bridge, how would you contrast it with {next_focus_label}?",
        },
    }


def _clean_track_value(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _question_is_generic_or_off_focus(question: str, seed: dict) -> bool:
    cleaned = _clean_track_value(question).lower()
    if not cleaned:
        return True
    if any(phrase in cleaned for phrase in _GENERIC_PHRASES):
        anchor = _anchor_context_for_focus(seed).lower()
        if not anchor or not any(token in cleaned for token in re.findall(r"[a-z0-9]+", anchor) if len(token) > 3):
            return True

    anchor_tokens = {
        token
        for token in re.findall(r"[a-z0-9]+", f"{seed.get('label', '')} {_anchor_context_for_focus(seed)}".lower())
        if len(token) > 3
    }
    if anchor_tokens and not (anchor_tokens & set(re.findall(r"[a-z0-9]+", cleaned))):
        return True
    return False


def _parse_track_output(raw: dict | str, seed: dict, fallback_track: dict) -> dict:
    if isinstance(raw, dict):
        result = raw
    elif isinstance(raw, str):
        cleaned = raw.strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        result = json.loads(cleaned)
    else:
        raise ValueError(f"Unexpected track output type: {type(raw)}")

    cleaned_result: dict[str, dict[str, str]] = {}
    for sprint_key in _SPRINT_KEYS:
        track = result.get(sprint_key, {})
        fallback_branch_track = fallback_track.get(sprint_key, {})
        if not isinstance(track, dict):
            track = {}
        cleaned_track: dict[str, str] = {}
        for branch in _VALID_BRANCHES:
            value = _clean_track_value(track.get(branch, ""))
            if value and not _question_is_generic_or_off_focus(value, seed):
                cleaned_track[branch] = value
            elif fallback_branch_track.get(branch):
                cleaned_track[branch] = _clean_track_value(fallback_branch_track.get(branch, ""))
        if _VALID_BRANCHES - set(cleaned_track):
            raise ValueError(f"{sprint_key} missing branches after fallback fill")
        cleaned_result[sprint_key] = cleaned_track
    return cleaned_result


async def _generate_focus_track(
    *,
    resume_context: str,
    seed: dict,
    next_focus_label: str,
    session_id: str,
) -> dict:
    llm = LLMRouter(tier="large")
    fallback_track = _fallback_track(seed, next_focus_label)
    user = _TRACK_USER_TEMPLATE.format(
        resume_context=resume_context[:2600],
        label=seed["label"],
        focus_key=seed["focus_key"],
        anchor_context=_anchor_context_for_focus(seed)[:500] or seed["label"],
        resume_snippets="\n".join(f"- {snippet}" for snippet in seed.get("resume_snippets", [])[:3]) or "- None available",
        next_focus_label=next_focus_label or "another area from the candidate's background",
    )
    last_error: Exception | None = None
    for attempt in range(1, 3):
        try:
            raw = await llm.call(system=_TRACK_SYSTEM, user=user, max_tokens=2048)
            parsed = _parse_track_output(raw, seed, fallback_track)
            if attempt > 1:
                print(f"[TrajectoryMap] Focus {seed['focus_key']} succeeded on attempt {attempt}"
                      + (f" for {session_id[:8]}" if session_id else ""))
            return parsed
        except Exception as exc:
            last_error = exc
    print(
        f"[TrajectoryMap] Focus {seed['focus_key']} fell back to deterministic templates"
        + (f" for {session_id[:8]}" if session_id else "")
        + f": {last_error}"
    )
    return fallback_track


async def generate_interview_map(
    *,
    resume: str,
    session_id: str = "",
) -> dict:
    """
    Build a structured fallback spine with 3-5 focus areas and full multi-sprint branches.
    Step 1: Haiku reads the raw resume and extracts real focus area seeds (no manual parsing).
    Step 2: DeepSeek R1 generates full question tracks per focus area in parallel.
    """
    started = time.perf_counter()
    seeds = await _extract_focus_seeds_llm(resume, session_id)
    if not seeds:
        seeds = _fallback_focus_seeds_from_resume(resume)
    enriched_seeds: list[dict] = []
    seen_focus_keys: set[str] = set()
    for seed in seeds:
        focus_key = _compact_focus_key(
            str(seed.get("label", "") or ""),
            str(seed.get("focus_key", "") or ""),
        )
        if not focus_key or focus_key in seen_focus_keys:
            continue
        snippets = _extract_resume_snippets(resume, seed, limit=3)
        if not snippets:
            continue
        enriched_seed = {
            **seed,
            "focus_key": focus_key,
            "resume_snippets": snippets,
        }
        enriched_seeds.append(enriched_seed)
        seen_focus_keys.add(focus_key)
    seeds = enriched_seeds
    if not seeds:
        print(f"[TrajectoryMap] No focus seeds extracted" + (f" for {session_id[:8]}" if session_id else ""))
        return {}

    tasks = []
    for index, seed in enumerate(seeds[:5]):
        next_focus_label = seeds[(index + 1) % len(seeds)]["label"] if len(seeds) > 1 else "another area from the candidate's background"
        tasks.append(
            _generate_focus_track(
                resume_context=resume,
                seed=seed,
                next_focus_label=next_focus_label,
                session_id=session_id,
            )
        )

    generated_tracks = await asyncio.gather(*tasks, return_exceptions=True)
    focus_areas: list[dict] = []
    for seed, track in zip(seeds, generated_tracks):
        if isinstance(track, Exception):
            track = _fallback_track(seed, seeds[0]["label"] if seeds else "another area")
        focus_areas.append({
            "label": seed["label"],
            "focus_key": seed["focus_key"],
            "anchor_context": _anchor_context_for_focus(seed),
            "resume_snippets": list(seed.get("resume_snippets", [])[:3]),
            **track,
        })

    elapsed_ms = round((time.perf_counter() - started) * 1000)
    print(
        f"[TrajectoryMap] Built {len(focus_areas)} focus areas in {elapsed_ms}ms"
        + (f" for {session_id[:8]}" if session_id else "")
    )
    return {
        "focus_areas": focus_areas,
        "generated_at": time.time(),
    }


def get_focus_area_context(
    interview_map: dict,
    *,
    focus_key: str,
    query_text: str = "",
    history: list[dict] | None = None,
    limit: int = 3,
) -> dict | None:
    if not isinstance(interview_map, dict):
        return None
    focus_areas = interview_map.get("focus_areas", [])
    if not isinstance(focus_areas, list) or not focus_areas:
        return None

    history = history or []
    current_matches = [area for area in focus_areas if _focus_area_matches(area, focus_key)]
    if current_matches:
        area = current_matches[0]
    else:
        last_focus_key = _last_substantive_focus(history)
        last_matches = [area for area in focus_areas if _focus_area_matches(area, last_focus_key)]
        if last_matches:
            area = last_matches[0]
        else:
            query_tokens = _tokenize(query_text)
            if not query_tokens:
                return None
            scored: list[tuple[int, dict]] = []
            for candidate in focus_areas:
                candidate_tokens = _tokenize(
                    " ".join(
                        [
                            str(candidate.get("label", "") or ""),
                            str(candidate.get("anchor_context", "") or ""),
                            " ".join(candidate.get("resume_snippets", []) or []),
                        ]
                    )
                )
                score = len(query_tokens & candidate_tokens)
                if score:
                    scored.append((score, candidate))
            scored.sort(key=lambda item: item[0], reverse=True)
            if not scored:
                return None
            area = scored[0][1]

    snippets = [str(snippet).strip() for snippet in area.get("resume_snippets", []) if str(snippet).strip()][:limit]
    label = str(area.get("label", "") or "")
    anchor_context = str(area.get("anchor_context", "") or "")
    prompt_context_lines = []
    if label:
        prompt_context_lines.append(f"Focus area: {label}")
    if anchor_context:
        prompt_context_lines.append(f"Resume anchor: {anchor_context}")
    if snippets:
        prompt_context_lines.append("Exact resume snippets:")
        prompt_context_lines.extend(f"- {snippet}" for snippet in snippets)

    return {
        "focus_key": str(area.get("focus_key", "") or ""),
        "focus_label": label,
        "anchor_context": anchor_context,
        "resume_snippets": snippets,
        "prompt_context": "\n".join(prompt_context_lines),
    }


def _branch_priority(
    *,
    is_short: bool,
    admission: bool,
    has_discrepancy: bool,
    branch_hint: str = "",
) -> list[str]:
    if branch_hint and branch_hint in _VALID_BRANCHES:
        remainder = [b for b in _BRANCH_PRIORITY_DEFAULT if b != branch_hint]
        return [branch_hint] + remainder
    if has_discrepancy:
        return _BRANCH_PRIORITY_DISCREPANCY
    if admission:
        return _BRANCH_PRIORITY_ADMISSION
    if is_short:
        return _BRANCH_PRIORITY_SHORT
    return _BRANCH_PRIORITY_DEFAULT


def _already_asked(question: str, history: list[dict], window: int = 15) -> bool:
    if not question:
        return False
    normalized = re.sub(r"[^a-z0-9\s]", " ", question.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    for turn in history[-window:]:
        asked = re.sub(r"[^a-z0-9\s]", " ", str(turn.get("question", "") or "").lower())
        asked = re.sub(r"\s+", " ", asked).strip()
        if asked and asked == normalized:
            return True
    return False


def _focus_area_matches(area: dict, focus_key: str) -> bool:
    map_key = _normalize_key(str(area.get("focus_key", "") or ""))
    target = _normalize_key(focus_key)
    if not map_key or not target:
        return False
    if map_key == target or map_key in target or target in map_key:
        return True

    ignored = {"ai", "engineering", "engineer", "intern", "internship", "at"}
    map_tokens = {token for token in map_key.split("_") if token and token not in ignored}
    target_tokens = {token for token in target.split("_") if token and token not in ignored}
    overlap = map_tokens & target_tokens
    if len(overlap) >= 2:
        return True
    if map_tokens and target_tokens:
        return len(overlap) / min(len(map_tokens), len(target_tokens)) >= 0.6
    return False


def _last_substantive_focus(history: list[dict]) -> str:
    for turn in reversed(history):
        answer = str(turn.get("answer", "") or "").strip()
        if len(answer.split()) < 8:
            continue
        focus_key = str(turn.get("focus_key", "") or "").strip()
        if focus_key:
            return focus_key
    return ""


def select_from_trajectory_map(
    interview_map: dict,
    *,
    sprint: int,
    focus_key: str,
    answer: str,
    entities: list[str],
    history: list[dict],
    admission: bool = False,
    has_discrepancy: bool = False,
    branch_hint: str = "",
) -> tuple[str, str] | None:
    result = select_from_trajectory_map_detailed(
        interview_map,
        sprint=sprint,
        focus_key=focus_key,
        answer=answer,
        entities=entities,
        history=history,
        admission=admission,
        has_discrepancy=has_discrepancy,
        branch_hint=branch_hint,
    )
    if not result:
        return None
    return result["question"], result["route_kind"]


def select_from_trajectory_map_detailed(
    interview_map: dict,
    *,
    sprint: int,
    focus_key: str,
    answer: str,
    entities: list[str],
    history: list[dict],
    admission: bool = False,
    has_discrepancy: bool = False,
    branch_hint: str = "",
) -> dict | None:
    if not isinstance(interview_map, dict):
        return None

    focus_areas = interview_map.get("focus_areas", [])
    if not isinstance(focus_areas, list) or not focus_areas:
        return None

    sprint_key = _SPRINT_KEY.get(sprint, "sprint_1")
    word_count = len([word for word in answer.split() if word])
    is_short = 1 <= word_count <= 18
    priority = _branch_priority(
        is_short=is_short,
        admission=admission,
        has_discrepancy=has_discrepancy,
        branch_hint=branch_hint,
    )

    current_matches = [area for area in focus_areas if _focus_area_matches(area, focus_key)]
    last_focus_key = _last_substantive_focus(history)
    last_focus_matches = [
        area for area in focus_areas
        if area not in current_matches and _focus_area_matches(area, last_focus_key)
    ]
    query_tokens = _tokenize(
        " ".join(
            [
                focus_key or "",
                answer or "",
                " ".join(entities or []),
                str(history[-1].get("question", "") or "") if history else "",
            ]
        )
    )
    remaining_scored: list[tuple[int, dict]] = []
    for area in focus_areas:
        if area in current_matches or area in last_focus_matches:
            continue
        area_tokens = _tokenize(
            " ".join(
                [
                    str(area.get("label", "") or ""),
                    str(area.get("anchor_context", "") or ""),
                    " ".join(area.get("resume_snippets", []) or []),
                ]
            )
        )
        score = len(query_tokens & area_tokens)
        if score:
            remaining_scored.append((score, area))
    remaining_scored.sort(key=lambda item: item[0], reverse=True)
    remaining = [area for _, area in remaining_scored]

    search_groups = [current_matches, last_focus_matches, remaining]

    for group_index, group in enumerate(search_groups):
        if not group:
            continue
        for area in group:
            track = area.get(sprint_key, {})
            if not isinstance(track, dict):
                continue

            branch_order = list(priority)
            if group_index == 0 and "bridge_to_next_focus" in branch_order and branch_hint != "bridge_to_next_focus":
                branch_order = [b for b in branch_order if b != "bridge_to_next_focus"]

            for branch in branch_order:
                question = str(track.get(branch, "") or "").strip()
                if not question or _already_asked(question, history):
                    continue
                route_kind = _BRANCH_TO_ROUTE.get(branch, ROUTE_FOLLOWUP)
                return {
                    "question": question,
                    "route_kind": route_kind,
                    "focus_key": str(area.get("focus_key", "") or ""),
                    "focus_label": str(area.get("label", "") or ""),
                    "branch": branch,
                }

        if group_index == 0:
            for area in group:
                track = area.get(sprint_key, {})
                if not isinstance(track, dict):
                    continue
                bridge_question = str(track.get("bridge_to_next_focus", "") or "").strip()
                if bridge_question and not _already_asked(bridge_question, history):
                    return {
                        "question": bridge_question,
                        "route_kind": ROUTE_BRIDGE,
                        "focus_key": str(area.get("focus_key", "") or ""),
                        "focus_label": str(area.get("label", "") or ""),
                        "branch": "bridge_to_next_focus",
                    }

    return None
