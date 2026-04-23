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

_TECH_PHRASE_PATTERNS = (
    r"\bGoogle ADK\b",
    r"\bGoogle Veo ?3\b",
    r"\bTensorFlow Lite-?Micro INT8\b",
    r"\bTensorFlow Lite-?Micro\b",
    r"\bEdge Impulse\b",
    r"\bMediaPipe Audio\b",
    r"\bMFCCs?\b",
    r"\blog-?Mel spectrograms?\b",
    r"\bDSP\b",
    r"\bNPU\b",
    r"\bOCR\b",
    r"\bSQL\b",
    r"\bRAG\b",
    r"\bALLaVA\b",
    r"\bBIRD-SQL\b",
    r"\bseed (?:diffusion|regeneration)\b",
    r"\blatent-space steering\b",
    r"\bdiffusion conditioning vectors?\b",
    r"\bfeature-map control system\b",
    r"\bsemantic UI-to-latent translation interface\b",
)


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


_FOCUS_SECTION_HEADERS = (
    "experience",
    "projects",
    "research",
    "work experience",
    "professional experience",
)

_IGNORE_SECTION_HEADERS = (
    "education",
    "awards",
    "honors",
    "scholarships",
    "technical skills",
    "skills",
    "top skills",
    "contact",
)


def _canonicalize_line(line: str) -> str:
    return re.sub(r"\s+", " ", line.replace("•", " ").strip())


def _resume_focus_source(resume: str) -> str:
    """
    Return a compact, experience-heavy resume view for trajectory extraction.

    The map builder should prioritize projects, internships, and research work.
    Raw top-of-resume metadata (contact, education, scholarships, skill buckets)
    is useful elsewhere, but it is usually noise for adversarial interview focus
    selection and makes the small-model seed pass slower and less reliable.
    """
    lines = [_canonicalize_line(line) for line in resume.splitlines() if _canonicalize_line(line)]
    if not lines:
        return ""

    selected: list[str] = []
    capture_mode = False
    for line in lines:
        lowered = line.lower().rstrip(":")
        if lowered in _FOCUS_SECTION_HEADERS:
            capture_mode = True
            continue
        if lowered in _IGNORE_SECTION_HEADERS:
            capture_mode = False
            continue
        if lowered.startswith("top skills") or lowered.startswith("skills:"):
            capture_mode = False
            continue

        if capture_mode:
            if "skills" in lowered and len(line.split()) > 3:
                continue
            selected.append(line)
            continue

        # Resume variants often omit clear sectioning. Keep obviously interviewable
        # work lines even outside a formal EXPERIENCE header.
        if any(
            marker in lowered
            for marker in (
                " intern",
                " internship",
                "research assistant",
                "engineer",
                "architected",
                "engineered",
                "built ",
                "implemented",
                "designed",
                "developed",
                "optimized",
                "benchmark",
                "pipeline",
                "system",
                "classifier",
                "rag",
                "tinyml",
                "filmora",
                "optek",
                "bird",
            )
        ):
            selected.append(line)

    if selected:
        deduped: list[str] = []
        seen: set[str] = set()
        for line in selected:
            key = line.lower()
            if key in seen:
                continue
            seen.add(key)
            deduped.append(line)
        return "\n".join(deduped)

    # Last resort: drop obvious metadata lines from the raw resume rather than
    # returning the full blob.
    filtered = []
    for line in lines:
        lowered = line.lower()
        if any(token in lowered for token in ("@", "scholarship", "award", "advisor")):
            continue
        if "skills" in lowered and len(line.split()) > 3:
            continue
        filtered.append(line)
    return "\n".join(filtered)


def _looks_like_work_header(line: str) -> bool:
    lowered = line.lower()
    if any(token in lowered for token in ("university", "b.eng", "scholarship", "advisor", "top skills", "skills:")):
        return False
    if re.match(
        r"^(architected|engineered|built|implemented|designed|developed|optimized|reconstructed|assisted|worked on|led)\b",
        lowered,
    ):
        return False
    if any(token in lowered for token in ("intern", "engineer", "research assistant", "developer")):
        return True
    if "@" in line and any(token in lowered for token in ("filmora", "optek", "bird", "cuhksz", "group")):
        return True
    if re.search(r"\b(20\d{2})\b", line) and any(token in lowered for token in (" - ", "–", "present", "sept", "jan", "july", "june")):
        return True
    return False


def _resume_work_entries(resume: str) -> list[dict]:
    lines = [_canonicalize_line(line) for line in (_resume_focus_source(resume) or resume).splitlines() if _canonicalize_line(line)]
    entries: list[dict] = []
    current: dict | None = None
    for line in lines:
        lowered = line.lower()
        if "skills" in lowered and len(line.split()) > 3:
            continue
        if _looks_like_work_header(line):
            if current:
                entries.append(current)
            current = {"header": line, "details": []}
            continue
        if current:
            current["details"].append(line)
    if current:
        entries.append(current)
    return entries


def _derive_entry_label(header: str, details: list[str]) -> str:
    header = re.sub(r"\s+", " ", header).strip(" -,:")
    for separator in (":", "@"):
        if separator in header:
            header = header.split(separator, 1)[0 if separator == "@" else 1].strip(" -,:")
            break
    header = re.sub(r"\b(20\d{2}.*|present)\b", "", header, flags=re.IGNORECASE).strip(" -,:")
    header = re.sub(r"\[(.*?)\]", "", header).strip()
    if "," in header and len(header.split()) > 6:
        header = header.split(",", 1)[0].strip()

    if details:
        detail_blob = " ".join(details[:3])
        match = re.search(
            r"\b(agent[- ]based .*? pipeline|tinyml audio classification pipeline|audio classification pipeline|bird[- ]sql .*? benchmark framework|benchmark framework|semantic .*? interface|feature-map control system|rag optimization .*? framework|script framework|classifier)\b",
            detail_blob,
            flags=re.IGNORECASE,
        )
        if match:
            return match.group(1).strip(" -,.").title()

    cleaned = re.sub(r"^(ai|research)\s+", "", header, flags=re.IGNORECASE).strip()
    return cleaned.title() if cleaned else "Recent Technical Work"


def _prettify_focus_label(label: str) -> str:
    cleaned = re.sub(r"\s+", " ", label).strip(" -,.")
    if not cleaned:
        return "Recent Technical Work"
    replacements = {
        "Aigc": "AIGC",
        "Tinyml": "TinyML",
        "Ui": "UI",
        "Sql": "SQL",
        "Ocr": "OCR",
        "Adk": "ADK",
        "Mfcc": "MFCC",
        "Npu": "NPU",
        "Dsp": "DSP",
    }
    words = []
    for word in cleaned.title().split():
        words.append(replacements.get(word, word))
    return " ".join(words)


def _detail_focus_labels(details: list[str], max_labels: int = 2) -> list[str]:
    labels: list[str] = []
    seen: set[str] = set()
    patterns = (
        r"\b(agent[- ]based .*? pipeline)\b",
        r"\b(feature-map control system)\b",
        r"\b(semantic ui-to-latent translation interface)\b",
        r"\b(tinyml audio classification pipeline)\b",
        r"\b(audio classification pipeline)\b",
        r"\b(multi-modal benchmark framework)\b",
        r"\b(benchmark framework)\b",
        r"\b(complex hybrid sql queries)\b",
        r"\b(relational db schemas)\b",
        r"\b(custom classifier)\b",
    )
    for detail in details:
        for pattern in patterns:
            match = re.search(pattern, detail, flags=re.IGNORECASE)
            if not match:
                continue
            label = _prettify_focus_label(match.group(1))
            key = _compact_focus_key(label)
            if key in seen:
                continue
            seen.add(key)
            labels.append(label)
            if len(labels) >= max_labels:
                return labels
    return labels


def _focus_candidate_units(resume: str) -> list[str]:
    candidates: list[str] = []
    for entry in _resume_work_entries(resume):
        header = str(entry.get("header", "") or "").strip()
        details = [str(detail).strip() for detail in entry.get("details", []) if str(detail).strip()]
        if header:
            candidates.append(header)
        for detail in details[:3]:
            if len(detail) >= 24:
                candidates.append(detail)
    for unit in _resume_units(_resume_focus_source(resume) or resume):
        fragments = re.split(r"(?<=[.!?])\s+|[;•]", unit)
        for fragment in fragments:
            cleaned = re.sub(r"\s+", " ", fragment.strip(" -,."))
            if (
                len(cleaned) >= 12
                and not cleaned.lower().startswith("top skills")
                and "scholarship" not in cleaned.lower()
                and "advisor" not in cleaned.lower()
            ):
                candidates.append(cleaned)
    return candidates or _resume_units(resume)


def _is_noise_snippet(unit: str) -> bool:
    lowered = unit.lower()
    if "@" in unit and "." in unit and len(unit.split()) <= 8:
        return True
    if re.fullmatch(r"[0-9+| :/().-]+", unit):
        return True
    if lowered.startswith("technical skills") or lowered == "experience:":
        return True
    if any(
        token in lowered
        for token in (
            "scholarship",
            "award",
            "advisor",
            "b.eng",
            "university",
            "school of data science",
            "longxiang boulevard",
            "district",
            "shenzhen :",
        )
    ):
        return True
    return False


def _extract_resume_snippets(resume: str, seed: dict, limit: int = 3) -> list[str]:
    query_tokens = _tokenize(f"{seed.get('label', '')} {_anchor_context_for_focus(seed)}")
    if not query_tokens:
        return []

    snippets: list[str] = []
    label_lower = str(seed.get("label", "") or "").lower()

    entries = _resume_work_entries(resume)
    best_entry: dict | None = None
    best_entry_score = 0.0
    for entry in entries:
        header = str(entry.get("header", "") or "").strip()
        details = [str(detail).strip() for detail in entry.get("details", []) if str(detail).strip()]
        combined = " ".join([header, *details])
        combined_tokens = _tokenize(combined)
        overlap = query_tokens & combined_tokens
        if not overlap:
            continue
        exact_phrase_bonus = 2.5 if label_lower and label_lower in combined.lower() else 0.0
        detail_bonus = min(len(details), 3) * 0.15
        score = len(overlap) + exact_phrase_bonus + detail_bonus
        if score > best_entry_score:
            best_entry_score = score
            best_entry = {"header": header, "details": details}

    if best_entry:
        scored_details: list[tuple[float, str]] = []
        for detail in best_entry.get("details", []):
            if _is_noise_snippet(detail):
                continue
            detail_tokens = _tokenize(detail)
            overlap = query_tokens & detail_tokens
            if not overlap:
                continue
            exact_phrase_bonus = 2.0 if label_lower and label_lower in detail.lower() else 0.0
            density_bonus = len(overlap) / max(len(query_tokens), 1)
            scored_details.append((len(overlap) + exact_phrase_bonus + density_bonus, detail))
        scored_details.sort(key=lambda item: item[0], reverse=True)
        for _, detail in scored_details:
            if detail not in snippets:
                snippets.append(detail)
            if len(snippets) >= limit:
                return snippets[:limit]

        header = str(best_entry.get("header", "") or "").strip()
        if header and not _is_noise_snippet(header):
            snippets.append(header)
        if len(snippets) >= limit:
            return snippets[:limit]

    units = _resume_units(_resume_focus_source(resume) or resume)
    if not units:
        return snippets[:limit]

    scored_units: list[tuple[float, int, str]] = []
    for unit in units:
        if _is_noise_snippet(unit):
            continue
        unit_tokens = _tokenize(unit)
        if not unit_tokens:
            continue
        overlap = query_tokens & unit_tokens
        if not overlap:
            continue
        exact_phrase_bonus = 2.0 if label_lower and label_lower in unit.lower() else 0.0
        overlap_ratio = len(overlap) / max(len(query_tokens), 1)
        scored_units.append((len(overlap) + exact_phrase_bonus + overlap_ratio, len(unit_tokens), unit))

    scored_units.sort(key=lambda item: (item[0], item[1]), reverse=True)
    for _, _, unit in scored_units:
        if unit not in snippets:
            snippets.append(unit)
        if len(snippets) >= limit:
            break
    return snippets[:limit]


def _fallback_focus_seeds_from_resume(resume: str, limit: int = 5) -> list[dict]:
    def _derive_focus_label(unit: str) -> str:
        cleaned = re.sub(r"\s+", " ", unit.strip(" -,."))
        cleaned = re.sub(
            r"^(built|designed|developed|created|implemented|engineered|led|owned|launched|shipped|optimized|debugged)\s+",
            "",
            cleaned,
            flags=re.IGNORECASE,
        )
        cleaned = re.sub(r"\b(using|with|for|through|via)\b.*$", "", cleaned, flags=re.IGNORECASE).strip(" -,.:")
        cleaned = re.sub(r"^(a|an|the)\s+", "", cleaned, flags=re.IGNORECASE)
        tokens = cleaned.split()
        if not tokens:
            return "Recent Technical Work"
        short = " ".join(tokens[:6]).strip(" -,.:")
        return short.title()

    seeds: list[dict] = []
    seen: set[str] = set()
    for entry in _resume_work_entries(resume):
        header = str(entry.get("header", "") or "").strip()
        details = [str(detail).strip() for detail in entry.get("details", []) if str(detail).strip()]
        if not header:
            continue
        for detail_label in _detail_focus_labels(details, max_labels=2):
            focus_key = _compact_focus_key(detail_label)
            if not focus_key or focus_key in seen or _is_redundant_label(detail_label, [seed["label"] for seed in seeds]):
                continue
            anchor_context = next(
                (detail[:220] for detail in details if detail_label.lower().split()[0] in detail.lower()),
                details[0][:220] if details else header[:220],
            )
            seeds.append({
                "label": detail_label,
                "focus_key": focus_key,
                "anchor_context": anchor_context,
            })
            seen.add(focus_key)
            if len(seeds) >= limit:
                return seeds[:limit]

        label = _prettify_focus_label(_derive_entry_label(header, details))
        if label != "Recent Technical Work":
            focus_key = _compact_focus_key(label)
            if focus_key and focus_key not in seen and not _is_redundant_label(label, [seed["label"] for seed in seeds]):
                anchor_context = details[0][:220] if details else header[:220]
                seeds.append({
                    "label": label,
                    "focus_key": focus_key,
                    "anchor_context": anchor_context,
                })
                seen.add(focus_key)
                if len(seeds) >= limit:
                    return seeds[:limit]

    if len(seeds) >= min(limit, 3):
        return seeds[:limit]

    units = _focus_candidate_units(resume)
    for unit in units:
        lowered = unit.lower()
        if _is_noise_snippet(unit):
            continue
        if (
            len(unit.split()) <= 4
            and any(marker in lowered for marker in ("intern", "engineer", "assistant"))
            and not any(marker in lowered for marker in ("built", "designed", "developed", "implemented", "led", "owned"))
        ):
            continue
        if not any(
            marker in lowered
            for marker in (
                "intern", "engineer", "assistant", "@", "pipeline", "project",
                "built", "designed", "developed", "implemented", "led", "owned",
                "service", "dashboard", "system", "debug", "latency", "postgres",
                "redis", "retrieval", "ranking", "benchmark", "classifier", "interface",
            )
        ):
            continue
        label = unit.split(":", 1)[0].strip(" -")
        if "@" in label:
            label = label.split("@", 1)[0].strip(" -")
        if "." in label and len(label.split()) > 8:
            label = label.split(".", 1)[-1].strip(" -")
        label = _prettify_focus_label(_derive_focus_label(label or unit))
        if len(label) > 80:
            label = label[:80].rsplit(" ", 1)[0]
        focus_key = _compact_focus_key(label)
        if not focus_key or focus_key in seen or _is_redundant_label(label, [seed["label"] for seed in seeds]):
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

_ARTIFACT_SYSTEM = """You extract only the most interview-worthy technical artifacts from a resume.
Return concrete build surfaces like pipelines, systems, interfaces, benchmarks, classifiers, schema work, or control systems.
Never return education, awards, locations, contact details, or role titles by themselves."""

_ARTIFACT_USER_TEMPLATE = """Resume:
{resume}

Return ONLY a JSON array:
[
  {{
    "label": "artifact label like 'TinyML Audio Classification Pipeline' or 'Feature-Map Control System'",
    "anchor_context": "the exact claim or short paraphrase of what they built"
  }}
]

Rules:
- prefer artifact labels over role labels
- if a role contains multiple real artifacts, split them
- never return schools, scholarships, cities, countries, or skill buckets
- keep labels short and human-readable
- JSON only"""

_FOCUS_SEED_TIMEOUT_SECONDS = 8.0
_FOCUS_TRACK_TIMEOUT_SECONDS = 6.5
_FOCUS_TRACK_BACKGROUND_TIMEOUT_SECONDS = 20.0
_FOCUS_TRACK_BUILD_DEADLINE_SECONDS = 15.0
_FOCUS_TRACK_MAX_AREAS = 4
_RICH_MAP_BANNED_LABEL_TOKENS = (
    "scholarship",
    "advisor",
    "university",
    "skills",
    "contact",
    "district",
    "boulevard",
    "phone",
    "email",
)
_RICH_MAP_CORE_BRANCHES = {
    "sprint_1.if_strong",
    "sprint_1.if_vague",
    "sprint_1.if_short_answer",
    "sprint_2.if_strong",
    "sprint_3.if_strong",
}


def _label_token_set(label: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", (label or "").lower())
        if len(token) > 2 and token not in {"system", "project", "work", "technical"}
    }


def _is_redundant_label(label: str, existing_labels: list[str]) -> bool:
    candidate_tokens = _label_token_set(label)
    if not candidate_tokens:
        return False
    for existing in existing_labels:
        existing_tokens = _label_token_set(existing)
        if not existing_tokens:
            continue
        overlap = candidate_tokens & existing_tokens
        if candidate_tokens <= existing_tokens or existing_tokens <= candidate_tokens:
            return True
        if overlap and len(overlap) / min(len(candidate_tokens), len(existing_tokens)) >= 0.75:
            return True
    return False


def _normalize_seed_candidates(items: list[dict], limit: int = 5) -> list[dict]:
    normalized: list[dict] = []
    labels: list[str] = []
    seen_keys: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        label = _prettify_focus_label(str(item.get("label", "") or ""))
        anchor = str(item.get("anchor_context", "") or "").strip()
        if not label or not anchor:
            continue
        lowered = f"{label} {anchor}".lower()
        if any(token in lowered for token in ("scholarship", "award", "advisor", "university", "contact", "phone", "email")):
            continue
        if _is_redundant_label(label, labels):
            continue
        focus_key = _compact_focus_key(label, str(item.get("focus_key", "") or ""))
        if not focus_key or focus_key in seen_keys:
            continue
        normalized.append({
            "label": label,
            "focus_key": focus_key,
            "anchor_context": anchor[:220],
        })
        labels.append(label)
        seen_keys.add(focus_key)
        if len(normalized) >= limit:
            break
    return normalized


async def _extract_focus_seeds_llm(resume: str, session_id: str = "") -> list[dict]:
    """
    Ask Haiku to read the raw resume and return structured focus area seeds.
    This replaces all brittle manual parsing.
    """
    llm = LLMRouter(tier="small")
    resume_focus = _resume_focus_source(resume) or resume
    user = _SEED_USER_TEMPLATE.format(resume=resume_focus[:1800])
    try:
        raw = await asyncio.wait_for(
            llm.call(system=_SEED_SYSTEM, user=user, max_tokens=360),
            timeout=_FOCUS_SEED_TIMEOUT_SECONDS,
        )
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

        return _normalize_seed_candidates(result, limit=5)
    except Exception as e:
        print(
            f"[TrajectoryMap] Seed extraction failed"
            + (f" for {session_id[:8]}" if session_id else "")
            + f": {type(e).__name__}: {e}"
        )
        return []


async def _extract_focus_artifacts_llm(resume: str, session_id: str = "") -> list[dict]:
    llm = LLMRouter(tier="small")
    resume_focus = _resume_focus_source(resume) or resume
    user = _ARTIFACT_USER_TEMPLATE.format(resume=resume_focus[:1500])
    try:
        raw = await asyncio.wait_for(
            llm.call(system=_ARTIFACT_SYSTEM, user=user, max_tokens=260),
            timeout=4.5,
        )
        if isinstance(raw, list):
            result = raw
        elif isinstance(raw, str):
            cleaned = raw.strip()
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
            result = json.loads(cleaned)
        else:
            result = []
        return _normalize_seed_candidates(result, limit=5)
    except Exception as e:
        print(
            f"[TrajectoryMap] Artifact extraction failed"
            + (f" for {session_id[:8]}" if session_id else "")
            + f": {type(e).__name__}: {e}"
        )
        return []


def _extract_focus_signals(seed: dict) -> dict[str, str]:
    label = str(seed.get("label", "") or "this work").strip()
    anchor = _anchor_context_for_focus(seed)
    snippets = [str(snippet).strip() for snippet in seed.get("resume_snippets", []) if str(snippet).strip()]
    source_parts = [label, anchor]
    source_parts.extend(snippets[:2])
    source_text = " ".join(part for part in source_parts if part)

    artifact = label
    if len(artifact.split()) > 8:
        artifact = " ".join(artifact.split()[:8]).strip(" -,.")

    ranked_matches: list[tuple[int, int, str]] = []
    seen_tech: set[str] = set()
    for pattern in _TECH_PHRASE_PATTERNS:
        match = re.search(pattern, source_text, flags=re.IGNORECASE)
        if not match:
            continue
        phrase = re.sub(r"\s+", " ", match.group(0).strip())
        normalized = phrase.lower()
        if normalized in seen_tech:
            continue
        seen_tech.add(normalized)
        ranked_matches.append((match.start(), len(phrase), phrase))

    metric_match = re.search(
        r"(\b\d+%[+~]?\b|\b<\s*\d+\s*ms\b|\b\d+\s*KB\b|\b\d+(?:\.\d+)?\s*[x×]\b|\b\d+(?:,\d{3})+\+?\b)",
        source_text,
        flags=re.IGNORECASE,
    )
    metric = re.sub(r"\s+", " ", metric_match.group(0)).strip() if metric_match else ""

    domain = ""
    lowered = source_text.lower()
    for needle, phrase in (
        ("video", "the video-generation workflow"),
        ("audio", "the audio pipeline"),
        ("benchmark", "the benchmark design"),
        ("sql", "the SQL and schema design"),
        ("classifier", "the classifier pipeline"),
        ("latency", "the latency profile"),
        ("retrieval", "the retrieval setup"),
        ("ui-to-latent", "the UI-to-latent translation path"),
    ):
        if needle in lowered:
            domain = phrase
            break

    ranked_matches.sort(key=lambda item: (item[0], item[1]))
    tech_matches = [phrase for _, _, phrase in ranked_matches]
    family_probe = _artifact_family({
        "artifact": artifact or label or "this work",
        "primary_tech": tech_matches[0] if tech_matches else "",
        "secondary_tech": tech_matches[1] if len(tech_matches) > 1 else "",
        "metric": metric,
        "domain": domain or artifact or label or "the system",
    })
    priority_map = {
        "classifier": [
            "tensorflow lite-micro int8",
            "tensorflow lite-micro",
            "edge impulse",
            "dsp",
            "npu",
            "mediapipe audio",
        ],
        "interface": [
            "google veo 3",
            "diffusion conditioning vectors",
            "latent-space steering",
            "google adk",
        ],
        "pipeline": [
            "google veo 3",
            "google adk",
            "seed regeneration",
            "seed diffusion",
        ],
        "benchmark": [
            "bird-sql",
            "ocr",
            "sql",
        ],
        "data_modeling": [
            "sql",
            "ocr",
        ],
    }
    artifact_norm = re.sub(r"[^a-z0-9]+", " ", artifact.lower()).strip()
    priorities = priority_map.get(family_probe, [])

    ordered_matches: list[tuple[tuple[int, int, int, int], str]] = []
    for position, _, phrase in ranked_matches:
        normalized = re.sub(r"[^a-z0-9]+", " ", phrase.lower()).strip()
        priority_index = next(
            (index for index, needle in enumerate(priorities) if needle in phrase.lower()),
            len(priorities),
        )
        is_artifact_echo = 1 if normalized == artifact_norm else 0
        ordered_matches.append(((is_artifact_echo, priority_index, position, len(phrase)), phrase))

    ordered_matches.sort(key=lambda item: item[0])
    tech_matches = [phrase for _, phrase in ordered_matches[:3]]

    primary_tech = tech_matches[0] if tech_matches else domain or artifact
    secondary_tech = tech_matches[1] if len(tech_matches) > 1 else primary_tech
    return {
        "artifact": artifact or label or "this work",
        "primary_tech": primary_tech,
        "secondary_tech": secondary_tech,
        "metric": metric,
        "domain": domain or artifact or label or "the system",
    }


def _artifact_family(signals: dict[str, str]) -> str:
    artifact = signals.get("artifact", "").lower()
    domain = signals.get("domain", "").lower()
    primary_tech = signals.get("primary_tech", "").lower()
    combined = " ".join([artifact, domain, primary_tech])
    if "benchmark" in combined or "dataset" in combined:
        return "benchmark"
    if "interface" in combined or "ui" in combined:
        return "interface"
    if any(token in combined for token in ("classifier", "classification", "tinyml")):
        return "classifier"
    if "schema" in combined or "sql" in combined:
        return "data_modeling"
    if "pipeline" in combined:
        return "pipeline"
    return "system"


def _fallback_track(seed: dict, next_focus_label: str) -> dict:
    signals = _extract_focus_signals(seed)
    artifact = signals["artifact"]
    primary_tech = signals["primary_tech"]
    secondary_tech = signals["secondary_tech"]
    metric = signals["metric"]
    domain = signals["domain"]
    family = _artifact_family(signals)

    metric_clause = f" around {metric}" if metric else ""
    sprint_1_strong = f"Staying with {artifact}, why did you choose {primary_tech} for the critical path?"
    sprint_1_vague = f"In {artifact}, which exact component did you personally implement rather than just tune or review?"
    sprint_2_strong = f"In {artifact}, what mechanism inside {primary_tech} mattered most to making {domain} work well?"
    sprint_2_vague = f"For {artifact}, what was the actual mechanism behind {primary_tech}, not just the high-level goal?"
    sprint_3_strong = f"If {artifact} had to operate at much larger scale{metric_clause}, what would you redesign first around {primary_tech}?"
    sprint_3_vague = f"What reliability risk would you watch first if {artifact} had to handle real production pressure?"

    if family == "classifier":
        sprint_1_strong = f"Staying with {artifact}, why did you choose {primary_tech} over a simpler inference path?"
        sprint_2_strong = f"In {artifact}, what part of the inference or feature-extraction path mattered most to accuracy?"
        sprint_3_strong = f"If {artifact} had to preserve accuracy{metric_clause} on weaker hardware, what would you redesign first?"
    elif family == "interface":
        sprint_1_strong = f"Staying with {artifact}, how did you translate user intent into {primary_tech} without losing control?"
        sprint_2_strong = f"In {artifact}, what mechanism kept the UI controls aligned with the underlying generation behavior?"
        sprint_3_strong = f"If {artifact} had to support many more controls and users, what would you redesign first?"
    elif family == "benchmark":
        sprint_1_strong = f"Staying with {artifact}, why did you structure it around {primary_tech} instead of a simpler benchmark design?"
        sprint_2_strong = f"In {artifact}, what mechanism made the evaluation challenge genuinely hard rather than superficial?"
        sprint_3_strong = f"If {artifact} had to expand much further, what data-quality or evaluation risk would you tackle first?"
    elif family == "data_modeling":
        sprint_1_strong = f"Staying with {artifact}, why did you choose {primary_tech} as the core modeling surface?"
        sprint_2_strong = f"In {artifact}, what schema or query mechanism mattered most to making the workload realistic?"
        sprint_3_strong = f"If {artifact} had to support much larger query volume, what would you redesign first?"

    return {
        "sprint_1": {
            "if_strong": sprint_1_strong,
            "if_vague": sprint_1_vague,
            "if_honest_gap": f"That's useful. Within {artifact}, which part of {primary_tech} do you feel you can explain confidently?",
            "if_claim_conflict": f"Your resume frames {artifact} as hands-on work. Which concrete module did you actually own end to end?",
            "if_short_answer": f"On {artifact}, what specific part of {primary_tech} are you referring to?",
            "bridge_to_next_focus": f"Before we move on, how does {artifact} connect to {next_focus_label} in your background?",
        },
        "sprint_2": {
            "if_strong": sprint_2_strong,
            "if_vague": sprint_2_vague,
            "if_honest_gap": f"Even if you did not own all of {artifact}, what concept behind {primary_tech} do you understand best?",
            "if_claim_conflict": f"You mention {artifact} confidently. What did you have to reason through inside {secondary_tech} yourself?",
            "if_short_answer": f"When you answer briefly about {artifact}, what concrete mechanism inside {primary_tech} are you pointing to?",
            "bridge_to_next_focus": f"Keeping {artifact} in mind, what nearby part of your background should we examine next?",
        },
        "sprint_3": {
            "if_strong": sprint_3_strong,
            "if_vague": sprint_3_vague,
            "if_honest_gap": f"If you did not own all of {artifact}, which design tradeoff there can you still reason about confidently?",
            "if_claim_conflict": f"If {artifact} were stressed harder in production, where would your current story about {primary_tech} start to break?",
            "if_short_answer": f"For {artifact}, what specific bottleneck or failure mode around {primary_tech} are you referring to?",
            "bridge_to_next_focus": f"Using {artifact} as a bridge, how would you contrast it with {next_focus_label}?",
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
    llm_branches: list[str] = []
    fallback_branches: list[str] = []
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
                llm_branches.append(f"{sprint_key}.{branch}")
            elif fallback_branch_track.get(branch):
                cleaned_track[branch] = _clean_track_value(fallback_branch_track.get(branch, ""))
                fallback_branches.append(f"{sprint_key}.{branch}")
        if _VALID_BRANCHES - set(cleaned_track):
            raise ValueError(f"{sprint_key} missing branches after fallback fill")
        cleaned_result[sprint_key] = cleaned_track
    return {
        "track": cleaned_result,
        "llm_branches": llm_branches,
        "fallback_branches": fallback_branches,
        "llm_branch_count": len(llm_branches),
        "fallback_branch_count": len(fallback_branches),
    }


async def _generate_focus_track(
    *,
    resume_context: str,
    seed: dict,
    next_focus_label: str,
    session_id: str,
    fast_mode: bool = True,
) -> dict:
    # Startup-critical path: use the fast tier here so branch generation lands
    # inside the interview startup budget more reliably on high-latency networks.
    llm = LLMRouter(tier="small" if fast_mode else "medium")
    fallback_track = _fallback_track(seed, next_focus_label)
    user = _TRACK_USER_TEMPLATE.format(
        resume_context=resume_context[:900],
        label=seed["label"],
        focus_key=seed["focus_key"][:64],
        anchor_context=_anchor_context_for_focus(seed)[:260] or seed["label"],
        resume_snippets="\n".join(f"- {snippet}" for snippet in seed.get("resume_snippets", [])[:3]) or "- None available",
        next_focus_label=next_focus_label or "another area from the candidate's background",
    )
    last_error: Exception | None = None
    try:
        raw = await asyncio.wait_for(
            llm.call(system=_TRACK_SYSTEM, user=user, max_tokens=850 if fast_mode else 1100),
            timeout=_FOCUS_TRACK_TIMEOUT_SECONDS if fast_mode else _FOCUS_TRACK_BACKGROUND_TIMEOUT_SECONDS,
        )
        parsed = _parse_track_output(raw, seed, fallback_track)
        return {
            **parsed,
            "source": "llm",
        }
    except Exception as exc:
        last_error = exc
    if fast_mode:
        retry_llm = LLMRouter(tier="medium")
        retry_user = _TRACK_USER_TEMPLATE.format(
            resume_context=resume_context[:650],
            label=seed["label"],
            focus_key=seed["focus_key"][:64],
            anchor_context=_anchor_context_for_focus(seed)[:200] or seed["label"],
            resume_snippets="\n".join(f"- {snippet}" for snippet in seed.get("resume_snippets", [])[:2]) or "- None available",
            next_focus_label=next_focus_label or "another area from the candidate's background",
        )
        try:
            raw = await asyncio.wait_for(
                retry_llm.call(system=_TRACK_SYSTEM, user=retry_user, max_tokens=900),
                timeout=8.5,
            )
            parsed = _parse_track_output(raw, seed, fallback_track)
            return {
                **parsed,
                "source": "llm",
            }
        except Exception as exc:
            last_error = exc
    else:
        retry_llm = LLMRouter(tier="large")
        retry_user = _TRACK_USER_TEMPLATE.format(
            resume_context=resume_context[:700],
            label=seed["label"],
            focus_key=seed["focus_key"][:64],
            anchor_context=_anchor_context_for_focus(seed)[:220] or seed["label"],
            resume_snippets="\n".join(f"- {snippet}" for snippet in seed.get("resume_snippets", [])[:3]) or "- None available",
            next_focus_label=next_focus_label or "another area from the candidate's background",
        )
        try:
            raw = await asyncio.wait_for(
                retry_llm.call(system=_TRACK_SYSTEM, user=retry_user, max_tokens=1100),
                timeout=22.0,
            )
            parsed = _parse_track_output(raw, seed, fallback_track)
            return {
                **parsed,
                "source": "llm",
            }
        except Exception as exc:
            last_error = exc
    print(
        f"[TrajectoryMap] Focus {seed['focus_key']} fell back to deterministic templates"
        + (f" for {session_id[:8]}" if session_id else "")
        + f": {last_error}"
    )
    return {
        "track": fallback_track,
        "source": "deterministic_fallback",
        "llm_branches": [],
        "fallback_branches": [f"{sprint_key}.{branch}" for sprint_key in _SPRINT_KEYS for branch in sorted(_VALID_BRANCHES)],
        "llm_branch_count": 0,
        "fallback_branch_count": len(_SPRINT_KEYS) * len(_VALID_BRANCHES),
    }


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
    resume_focus = _resume_focus_source(resume) or resume
    seeds = await _extract_focus_seeds_llm(resume, session_id)
    if len(seeds) < 3:
        artifact_seeds = await _extract_focus_artifacts_llm(resume, session_id)
        if artifact_seeds:
            seeds = _normalize_seed_candidates([*seeds, *artifact_seeds], limit=5)
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

    limited_seeds = seeds[:_FOCUS_TRACK_MAX_AREAS]
    tasks: dict[asyncio.Task, tuple[dict, str]] = {}
    for index, seed in enumerate(limited_seeds):
        next_focus_label = seeds[(index + 1) % len(seeds)]["label"] if len(seeds) > 1 else "another area from the candidate's background"
        task = asyncio.create_task(
            _generate_focus_track(
                resume_context=resume_focus,
                seed=seed,
                next_focus_label=next_focus_label,
                session_id=session_id,
            )
        )
        tasks[task] = (seed, next_focus_label)

    generated_tracks: dict[str, dict] = {}
    done, pending = await asyncio.wait(
        tasks.keys(),
        timeout=_FOCUS_TRACK_BUILD_DEADLINE_SECONDS,
    )
    for task in done:
        seed, next_focus_label = tasks[task]
        try:
            generated_tracks[seed["focus_key"]] = task.result()
        except Exception:
            generated_tracks[seed["focus_key"]] = {
                "track": _fallback_track(seed, next_focus_label),
                "source": "deterministic_fallback",
            }

    for task in pending:
        seed, next_focus_label = tasks[task]
        task.cancel()
        generated_tracks[seed["focus_key"]] = {
            "track": _fallback_track(seed, next_focus_label),
            "source": "deterministic_fallback",
        }

    focus_areas: list[dict] = []
    pending_hydration_focus_keys: list[str] = []
    for index, seed in enumerate(limited_seeds):
        next_focus_label = limited_seeds[(index + 1) % len(limited_seeds)]["label"] if len(limited_seeds) > 1 else "another area from the candidate's background"
        track_result = generated_tracks.get(seed["focus_key"]) or {
            "track": _fallback_track(seed, next_focus_label),
            "source": "deterministic_fallback",
        }
        if track_result.get("source") != "llm":
            pending_hydration_focus_keys.append(seed["focus_key"])
        focus_areas.append({
            "label": seed["label"],
            "focus_key": seed["focus_key"],
            "anchor_context": _anchor_context_for_focus(seed),
            "resume_snippets": list(seed.get("resume_snippets", [])[:3]),
            "track_source": track_result.get("source", "deterministic_fallback"),
            "llm_branch_count": int(track_result.get("llm_branch_count", 0) or 0),
            "fallback_branch_count": int(track_result.get("fallback_branch_count", 0) or 0),
            "llm_branches": list(track_result.get("llm_branches", []) or []),
            "fallback_branches": list(track_result.get("fallback_branches", []) or []),
            **track_result["track"],
        })

    if pending:
        print(
            f"[TrajectoryMap] Deadline hit with {len(pending)} pending focus tracks"
            + (f" for {session_id[:8]}" if session_id else "")
        )

    elapsed_ms = round((time.perf_counter() - started) * 1000)
    print(
        f"[TrajectoryMap] Built {len(focus_areas)} focus areas in {elapsed_ms}ms"
        + (f" for {session_id[:8]}" if session_id else "")
    )
    return {
        "focus_areas": focus_areas,
        "generated_at": time.time(),
        "pending_hydration_focus_keys": pending_hydration_focus_keys,
    }


def build_deterministic_interview_map(
    *,
    resume: str,
    session_id: str = "",
) -> dict:
    """
    Build a fully deterministic interview map with no provider calls.

    This is the startup safety net when the LLM-backed trajectory builder is slow
    or unavailable. The goal is not perfect phrasing; the goal is to guarantee a
    resume-grounded spine so the interview can still start cleanly.
    """
    started = time.perf_counter()
    seeds = _fallback_focus_seeds_from_resume(resume)
    if not seeds:
        resume_units = _resume_units(resume)
        anchor = resume_units[0][:220] if resume_units else "the candidate's recent technical work"
        seeds = [{
            "label": "Recent Technical Work",
            "focus_key": "recent_technical_work",
            "anchor_context": anchor,
        }]

    focus_areas: list[dict] = []
    for index, seed in enumerate(seeds[:5]):
        focus_key = _compact_focus_key(
            str(seed.get("label", "") or ""),
            str(seed.get("focus_key", "") or ""),
        )
        normalized_seed = {
            **seed,
            "focus_key": focus_key or f"focus_{index + 1}",
        }
        snippets = _extract_resume_snippets(resume, normalized_seed, limit=3)
        if not snippets:
            anchor_context = _anchor_context_for_focus(normalized_seed)
            if anchor_context:
                snippets = [anchor_context]
        normalized_seed["resume_snippets"] = snippets[:3]
        next_focus_label = (
            str(seeds[(index + 1) % len(seeds)].get("label", "") or "").strip()
            if len(seeds) > 1
            else "another area from the candidate's background"
        )
        focus_areas.append({
            "label": str(normalized_seed.get("label", "") or f"Focus Area {index + 1}").strip(),
            "focus_key": normalized_seed["focus_key"],
            "anchor_context": _anchor_context_for_focus(normalized_seed),
            "resume_snippets": list(normalized_seed.get("resume_snippets", [])[:3]),
            "track_source": "deterministic_fallback",
            "llm_branch_count": 0,
            "fallback_branch_count": len(_SPRINT_KEYS) * len(_VALID_BRANCHES),
            "llm_branches": [],
            "fallback_branches": [f"{sprint_key}.{branch}" for sprint_key in _SPRINT_KEYS for branch in sorted(_VALID_BRANCHES)],
            **_fallback_track(normalized_seed, next_focus_label),
        })

    elapsed_ms = round((time.perf_counter() - started) * 1000)
    print(
        f"[TrajectoryMap] Built deterministic fallback with {len(focus_areas)} focus areas in {elapsed_ms}ms"
        + (f" for {session_id[:8]}" if session_id else "")
    )
    return {
        "focus_areas": focus_areas,
        "generated_at": time.time(),
        "source": "deterministic_fallback",
        "pending_hydration_focus_keys": [area["focus_key"] for area in focus_areas],
    }


def validate_interview_map(
    interview_map: dict,
    *,
    require_all_llm: bool = False,
    min_focus_areas: int = 3,
    min_llm_branch_ratio: float = 0.72,
) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    focus_areas = interview_map.get("focus_areas", []) if isinstance(interview_map, dict) else []
    if not isinstance(focus_areas, list):
        focus_areas = []
    pending_focuses = list(interview_map.get("pending_hydration_focus_keys", []) or []) if isinstance(interview_map, dict) else []

    if len(focus_areas) < min_focus_areas:
        errors.append(f"Map has only {len(focus_areas)} focus areas; need at least {min_focus_areas}.")

    llm_focus_count = 0
    rich_focus_count = 0
    focus_reports: list[dict] = []
    for area in focus_areas:
        label = str(area.get("label", "") or "").strip()
        focus_key = str(area.get("focus_key", "") or "").strip()
        track_source = str(area.get("track_source", "") or "")
        llm_branch_count = int(area.get("llm_branch_count", 0) or 0)
        fallback_branch_count = int(area.get("fallback_branch_count", 0) or 0)
        llm_branches = set(str(item) for item in (area.get("llm_branches", []) or []))
        if track_source == "deterministic_fallback" and llm_branch_count == 0 and fallback_branch_count == 0:
            fallback_branch_count = len(_SPRINT_KEYS) * len(_VALID_BRANCHES)
        total_branches = llm_branch_count + fallback_branch_count
        llm_ratio = llm_branch_count / total_branches if total_branches else 0.0
        focus_errors: list[str] = []

        if not label or not focus_key:
            focus_errors.append("missing label or focus key")
        if any(token in label.lower() for token in _RICH_MAP_BANNED_LABEL_TOKENS):
            focus_errors.append(f"label '{label}' looks like metadata noise")

        for sprint_key in _SPRINT_KEYS:
            sprint = area.get(sprint_key, {})
            if not isinstance(sprint, dict):
                focus_errors.append(f"{label}: {sprint_key} missing")
                continue
            for branch in _VALID_BRANCHES:
                if not _clean_track_value(sprint.get(branch, "")):
                    focus_errors.append(f"{label}: {sprint_key}.{branch} empty")

        if track_source == "llm":
            llm_focus_count += 1
        if llm_ratio >= min_llm_branch_ratio and _RICH_MAP_CORE_BRANCHES <= llm_branches:
            rich_focus_count += 1

        if require_all_llm:
            if track_source != "llm":
                focus_errors.append(f"{label}: track_source is {track_source}, expected llm")
            if llm_ratio < min_llm_branch_ratio:
                focus_errors.append(f"{label}: only {llm_branch_count}/{total_branches} branches are LLM-authored")
            missing_core = sorted(_RICH_MAP_CORE_BRANCHES - llm_branches)
            if missing_core:
                focus_errors.append(f"{label}: missing core LLM branches: {', '.join(missing_core)}")

        if focus_errors:
            errors.extend(focus_errors)

        focus_reports.append({
            "label": label,
            "focus_key": focus_key,
            "track_source": track_source,
            "llm_branch_count": llm_branch_count,
            "fallback_branch_count": fallback_branch_count,
            "llm_branch_ratio": round(llm_ratio, 3),
            "pending": focus_key in pending_focuses,
            "ready": not focus_errors,
        })

    if require_all_llm and pending_focuses:
        errors.append(f"Map still has pending hydration focuses: {', '.join(pending_focuses)}")
    if llm_focus_count < len(focus_areas):
        warnings.append(f"Only {llm_focus_count}/{len(focus_areas)} focus areas are fully marked as llm.")

    return {
        "ready": not errors,
        "errors": errors,
        "warnings": warnings,
        "focus_count": len(focus_areas),
        "llm_focus_count": llm_focus_count,
        "rich_focus_count": rich_focus_count,
        "pending_focus_keys": pending_focuses,
        "focus_reports": focus_reports,
        "require_all_llm": require_all_llm,
        "min_llm_branch_ratio": min_llm_branch_ratio,
    }


async def hydrate_interview_map_tracks(
    *,
    interview_map: dict,
    resume: str,
    session_id: str = "",
    focus_keys: list[str] | None = None,
) -> dict:
    if not isinstance(interview_map, dict):
        return interview_map

    focus_areas = interview_map.get("focus_areas", [])
    if not isinstance(focus_areas, list) or not focus_areas:
        return interview_map

    resume_focus = _resume_focus_source(resume) or resume
    target_keys = set(focus_keys or interview_map.get("pending_hydration_focus_keys", []) or [])
    if not target_keys:
        target_keys = {
            str(area.get("focus_key", "") or "")
            for area in focus_areas
            if str(area.get("track_source", "") or "") != "llm"
        }

    updated_focus_areas: list[dict] = []
    hydrated_keys: list[str] = []
    for index, area in enumerate(focus_areas):
        focus_key = str(area.get("focus_key", "") or "")
        next_focus_label = (
            str(focus_areas[(index + 1) % len(focus_areas)].get("label", "") or "").strip()
            if len(focus_areas) > 1
            else "another area from the candidate's background"
        )
        if focus_key and focus_key in target_keys:
            seed = {
                "label": str(area.get("label", "") or ""),
                "focus_key": focus_key,
                "anchor_context": str(area.get("anchor_context", "") or ""),
                "resume_snippets": list(area.get("resume_snippets", []) or []),
            }
            result = await _generate_focus_track(
                resume_context=resume_focus,
                seed=seed,
                next_focus_label=next_focus_label,
                session_id=session_id,
                fast_mode=False,
            )
            if result.get("source") == "llm":
                updated_focus_areas.append({
                    **area,
                    "track_source": "llm",
                    "llm_branch_count": int(result.get("llm_branch_count", 0) or 0),
                    "fallback_branch_count": int(result.get("fallback_branch_count", 0) or 0),
                    "llm_branches": list(result.get("llm_branches", []) or []),
                    "fallback_branches": list(result.get("fallback_branches", []) or []),
                    **result["track"],
                })
                hydrated_keys.append(focus_key)
                continue
        updated_focus_areas.append(area)

    remaining = [
        str(area.get("focus_key", "") or "")
        for area in updated_focus_areas
        if str(area.get("track_source", "") or "") != "llm"
    ]
    return {
        **interview_map,
        "focus_areas": updated_focus_areas,
        "pending_hydration_focus_keys": remaining,
        "last_hydrated_at": time.time() if hydrated_keys else interview_map.get("last_hydrated_at"),
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
