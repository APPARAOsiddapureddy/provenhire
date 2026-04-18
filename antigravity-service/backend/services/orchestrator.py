import asyncio
import re
import time
import uuid
from backend.db.postgres import persist_session
from backend.agents.concept_agent import ConceptAgent
from backend.agents.weakness_agent import WeaknessAgent
from backend.agents.followup_agent import FollowUpAgent, _build_resume_context
from backend.agents.discrepancy_agent import DiscrepancyAgent
from backend.agents.evaluation_agent import EvaluationAgent
from backend.agents.resume_agent import ResumeAgent
from backend.agents.reasoning_behavior_agent import ReasoningBehaviorAgent
from backend.rag import question_bank
from backend.services.interview_map import (
    generate_interview_map,
    get_focus_area_context,
    select_from_trajectory_map,
    select_from_trajectory_map_detailed,
)
from backend.services.interview_telemetry import interview_telemetry
from backend.state.session_manager import SessionManager


def _build_resume_context_for_followup(parsed_resume: dict | None, resume: str) -> str:
    """Thin wrapper so orchestrator can call the shared helper without circular imports."""
    return _build_resume_context(parsed_resume, resume)


def _build_focus_prompt_pack(
    interview_map: dict,
    *,
    focus_key: str,
    last_question: str = "",
    answer: str = "",
    history: list[dict] | None = None,
) -> dict:
    area = get_focus_area_context(
        interview_map,
        focus_key=focus_key,
        query_text=f"{last_question} {answer}",
        history=history or [],
        limit=3,
    )
    if not area:
        return {
            "focus_key": focus_key,
            "focus_label": "",
            "resume_snippets": [],
            "prompt_context": "",
        }
    return area


# Fallback follow-ups: sprint-keyed templates used when no prepped question exists and the
# bank has nothing queued. No LLM call — served instantly as a last resort.
_FALLBACK_FOLLOWUPS: dict[int, list[str]] = {
    1: [
        "What would you do differently if you were starting this project from scratch today?",
        "What was the hardest part to get right, and how did you know when you'd actually solved it?",
    ],
    2: [
        "Where does your mental model of this concept start to break down?",
        "How would you explain the trade-off you just described to an engineer who hasn't worked in this space?",
    ],
    3: [
        "What's the first thing that breaks under load in the design you just described?",
        "What would you instrument to catch that failure before it hits production?",
    ],
}

# Agent fallbacks — individual agent crash → use these so one LLM blip doesn't kill the turn
_WEAKNESS_FALLBACK    = {"weakness": "", "type": "vague", "severity": "low", "attack_strategy": "clarification"}
_DISCREPANCY_FALLBACK = {"conflict_level": "none", "description": "", "severity": "low"}
_REASONING_FALLBACK   = {"structure_score": 5, "adaptability": "flexible", "confidence_calibration": "calibrated"}


_ADMISSION_SIGNALS = re.compile(
    r"\b(i don'?t know|i'?m not sure|i didn'?t (write|build|implement|code)|"
    r"to be honest|actually i|i should (mention|clarify|be honest)|"
    r"i'?m not (certain|familiar|sure)|i haven'?t|i can'?t (explain|tell)|"
    r"i was just|i only|it'?s basically|it'?s just|i mean it'?s not really|"
    r"i don'?t (really|actually) know)\b",
    re.IGNORECASE,
)


def _looks_like_admission(text: str) -> bool:
    """Detect honesty/gap signals in partial transcript — triggers speculative pivot."""
    return bool(_ADMISSION_SIGNALS.search(text))


def _normalize_transcript(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", text.lower())).strip()


def _looks_like_question_echo(answer: str, question: str) -> bool:
    """
    Defensive filter for speaker bleed / browser-TTS feedback loops.
    If the "candidate answer" is mostly just the interviewer's question repeated back,
    do not let it consume a turn or drive the agent pipeline.
    """
    normalized_answer = _normalize_transcript(answer)
    normalized_question = _normalize_transcript(question)

    if not normalized_answer or not normalized_question:
        return False
    if len(normalized_answer) < 18:
        return False
    if normalized_question.startswith(normalized_answer):
        return True

    answer_words = [w for w in normalized_answer.split(" ") if len(w) > 2]
    question_word_set = {w for w in normalized_question.split(" ") if len(w) > 2}
    if len(answer_words) < 4:
        return False

    overlapping = [w for w in answer_words if w in question_word_set]
    overlap_ratio = len(overlapping) / max(len(answer_words), 1)
    novel_words = [w for w in answer_words if w not in question_word_set]
    return overlap_ratio >= 0.85 and len(novel_words) <= 2


def _focus_key(label: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
    return key or "general"


def _resume_focus_candidates(parsed_resume: dict | None, resume: str) -> list[tuple[str, str, set[str]]]:
    parsed_resume = parsed_resume or {}
    candidates: list[tuple[str, str, set[str]]] = []
    token_stopwords = {
        "project", "projects", "engineer", "engineering", "assistant", "intern",
        "built", "build", "using", "with", "present", "current", "custom",
        "production", "ready", "system", "experience", "worked",
        "for", "from", "into", "onto", "over", "under", "about", "after",
        "before", "during", "when", "while", "that", "this", "these", "those",
        "just", "than", "then", "them", "they", "their", "your", "what",
        "which", "where", "would", "could", "should", "have", "had",
        "into", "across", "through",
    }
    candidate_map: dict[str, dict] = {}

    def _tokens_from(*sources: object) -> set[str]:
        tokens: set[str] = set()
        for source in sources:
            normalized = _normalize_transcript(str(source or ""))
            for token in normalized.split(" "):
                if len(token) <= 2 or token in token_stopwords:
                    continue
                tokens.add(token)
        return tokens

    def _ensure_candidate(label: str, *sources: object) -> None:
        clean_label = str(label or "").strip()
        key = _focus_key(clean_label)
        if not clean_label or not key:
            return
        entry = candidate_map.setdefault(key, {"label": clean_label[:80], "tokens": set()})
        entry["tokens"].update(_tokens_from(clean_label, *sources))

    claims_by_project: dict[str, list[str]] = {}
    for claim in parsed_resume.get("claims", []):
        if not isinstance(claim, dict):
            continue
        project = str(claim.get("project", "") or "").strip()
        text = str(claim.get("text", "") or "").strip()
        if project and text:
            claims_by_project.setdefault(project.lower(), []).append(text)

    for project in parsed_resume.get("projects", []):
        if not isinstance(project, dict):
            continue
        name = str(project.get("name", "") or "").strip()
        if not name:
            continue
        project_claims = claims_by_project.get(name.lower(), [])
        _ensure_candidate(
            name,
            project.get("description", ""),
            " ".join(project.get("technologies", []) or []),
            " ".join(project_claims),
        )

    for exp in parsed_resume.get("experiences", []):
        if not isinstance(exp, dict):
            continue
        company = str(exp.get("company", "") or "").strip()
        title = str(exp.get("title", "") or "").strip()
        if company and title:
            label = f"{title} at {company}"
        else:
            label = company or title
        if not label:
            continue
        _ensure_candidate(
            label,
            exp.get("description", ""),
            exp.get("duration", ""),
            title,
            company,
        )

    if not candidate_map:
        for line in resume.splitlines():
            stripped = line.strip()
            if "@" in stripped or "intern" in stripped.lower() or "research assistant" in stripped.lower():
                label = stripped.split("@")[0].strip(" :-")
                _ensure_candidate(label, stripped)

    for key, entry in candidate_map.items():
        tokens = entry["tokens"]
        if not tokens:
            continue
        candidates.append((entry["label"], key, tokens))
    return candidates


def _infer_focus(question: str, answer: str, parsed_resume: dict | None, resume: str) -> tuple[str, str]:
    combined = _normalize_transcript(f"{question} {answer}")
    combined_tokens = set(token for token in combined.split(" ") if len(token) > 2)

    best_label = ""
    best_key = ""
    best_score = 0
    for label, key, tokens in _resume_focus_candidates(parsed_resume, resume):
        score = len(tokens & combined_tokens)
        if score > best_score:
            best_score = score
            best_label = label
            best_key = key

    if best_score > 0:
        return best_key, best_label

    if "internship" in combined or "resume" in combined:
        return "resume_background", "resume/background"
    if "python" in combined or "c++" in combined:
        return "python_cpp", "Python/C++"
    if "system" in combined or "scale" in combined or "load" in combined:
        return "system_design", "system design"
    if "concept" in combined or "explain" in combined:
        return "foundations", "foundations"
    return "general", "general background"


def _seed_relevant_to_answer(
    seeded_question: str,
    answer: str,
    entities: list[str],
    parsed_resume: dict | None,
    resume: str,
) -> bool:
    """
    Returns True if a pre-seeded question (generated from resume before any candidate answer)
    is topically aligned with what the candidate actually talked about in their first answer.

    The seed is generated from resume alone and defaults to the most prominent claim.
    If the candidate's first answer introduces a different project or topic, the seed
    will steer Turn 2 into an irrelevant lane — this check prevents that.
    """
    answer_focus_key, _ = _infer_focus("", answer, parsed_resume, resume)
    if answer_focus_key in ("general", "general background"):
        return True  # Can't determine focus — keep seed

    q_focus_key, _ = _infer_focus(seeded_question, "", parsed_resume, resume)
    if q_focus_key == answer_focus_key:
        return True

    # Entity-level check: any named entity from the answer appearing in the seeded question
    if entities:
        q_norm = _normalize_transcript(seeded_question)
        for entity in entities:
            e_norm = _normalize_transcript(entity)
            if e_norm and len(e_norm) > 2 and e_norm in q_norm:
                return True

    return False


def _is_substantive_answer(text: str) -> bool:
    cleaned = _normalize_transcript(text)
    if not cleaned or _looks_like_admission(text):
        return False
    words = [word for word in cleaned.split(" ") if word]
    return len(words) >= 18


def _collect_overprobed_topics(history: list[dict], current_focus_label: str = "") -> list[str]:
    counts: dict[str, int] = {}
    # Topics with confirmed honest admissions are terminal dead-ends — exclude immediately
    # regardless of probe count. Candidate explicitly said they don't know; asking again wastes time.
    admitted_topics: set[str] = set()
    for turn in history:
        label = turn.get("focus_label") or ""
        if label:
            counts[label] = counts.get(label, 0) + 1
            rb = turn.get("reasoning_behavior")
            if isinstance(rb, dict) and rb.get("adaptability") == "admitted_gap" and rb.get("structure_score", 5) <= 1:
                admitted_topics.add(label)
    if current_focus_label:
        counts[current_focus_label] = counts.get(current_focus_label, 0) + 1

    ranked = sorted(counts.items(), key=lambda item: item[1], reverse=True)
    overprobed = [label for label, count in ranked if count >= 2][:3]
    # Merge admitted topics first so they're at the top of the avoid list
    merged = list(dict.fromkeys(list(admitted_topics) + overprobed))
    return merged[:5]


def _build_continuity_brief(
    history: list[dict],
    candidate_model: dict,
    current_question: str = "",
    current_answer: str = "",
    current_focus_label: str = "",
) -> str:
    lines: list[str] = []

    substantive_turns = [turn for turn in history if _is_substantive_answer(turn.get("answer", ""))]
    if substantive_turns:
        turn = substantive_turns[-1]
        lines.append(
            f"Last substantive thread: {turn.get('question', '')[:110]} -> {turn.get('answer', '')[:180]}"
        )

    if current_question and current_answer and _is_substantive_answer(current_answer):
        lines.append(f"Most recent answer to build from: {current_question[:110]} -> {current_answer[:180]}")

    established = candidate_model.get("established_facts", []) if isinstance(candidate_model, dict) else []
    if established:
        lines.append("Established facts: " + "; ".join(established[-2:]))

    if current_focus_label and current_focus_label != "general background":
        lines.append(f"Current thread label: {current_focus_label}")

    return "\n".join(f"- {line}" for line in lines if line)


def _should_prioritize_bank_followup(
    prepped_context: dict,
    queued_followups: list[str],
    active_packet: dict | None = None,
) -> bool:
    """
    Decide when a stored deepening follow-up should beat the pre-generated next question.

    We only let bank follow-ups jump the queue when the staged response is a generic
    sprint-advance / breadth-pivot style question. Direct contradiction, clarification,
    or strong weakness probes still take precedence.
    """
    if not queued_followups:
        return False

    active_route_kind = ""
    if isinstance(active_packet, dict):
        active_route_kind = str(active_packet.get("route_kind", "") or "")
    if active_route_kind in ("sprint_fallback", "unknown"):
        return False

    route_kind = prepped_context.get("route_kind")
    if route_kind in ("discrepancy_challenge", "clarification_fast", "attack_probe", "complete"):
        return False
    if prepped_context.get("pivoting"):
        return False

    weakness = prepped_context.get("weakness")
    if isinstance(weakness, dict) and weakness.get("severity") == "high":
        return False

    return True


def _short_answer_rescue_eligible(text: str) -> bool:
    words = [word for word in _normalize_transcript(text).split(" ") if word]
    return 1 <= len(words) <= 18


def _is_generic_fasttrack_route(route_kind: object) -> bool:
    return str(route_kind or "") in {"sprint_fallback", "sprint_seed", "unknown"}


def _question_already_asked(candidate: str, history: list[dict], window: int = 15) -> bool:
    """
    Returns True if this exact question text was already served in this session.
    Normalised comparison — strips punctuation/case so minor rephrasing is NOT blocked,
    but verbatim repeated templates ARE caught.
    """
    if not candidate:
        return False
    normalized = _normalize_transcript(candidate)
    if not normalized:
        return False
    for turn in history[-window:]:
        asked = _normalize_transcript(str(turn.get("question", "") or ""))
        if asked and asked == normalized:
            return True
    return False


def _normalize_followups(followups: list[str] | None, limit: int = 2) -> list[str]:
    cleaned: list[str] = []
    for followup in followups or []:
        text = str(followup).strip()
        if text and text not in cleaned:
            cleaned.append(text)
    return cleaned[:limit]


def _build_question_packet(
    *,
    question_text: str,
    sprint: int,
    route_kind: str,
    parsed_resume: dict | None,
    resume: str,
    followups: list[str] | None = None,
    pivoting: bool = False,
    weakness: dict | None = None,
    discrepancy: dict | None = None,
    source_turn_number: int = 0,
    focus_key_override: str = "",
    focus_label_override: str = "",
) -> dict:
    followup_templates = _normalize_followups(followups)
    if focus_key_override or focus_label_override:
        focus_key = focus_key_override or _focus_key(focus_label_override)
        focus_label = focus_label_override or focus_key_override
    else:
        focus_key, focus_label = _infer_focus(question_text, "", parsed_resume, resume)
    return {
        "question_text": question_text,
        "route_kind": route_kind,
        "sprint": sprint,
        "focus_key": focus_key,
        "focus_label": focus_label,
        "followups": followup_templates,
        "asked_followup_count": 0,
        "max_followups": len(followup_templates),
        "pivoting": pivoting,
        "weakness": weakness,
        "discrepancy": discrepancy,
        "source_turn_number": source_turn_number,
    }


def _clone_question_packet(packet: dict | None) -> dict:
    if not isinstance(packet, dict):
        return {}
    cloned = dict(packet)
    cloned["followups"] = list(packet.get("followups") or [])
    return cloned


def _packet_followups_remaining(packet: dict | None) -> list[str]:
    if not isinstance(packet, dict):
        return []
    followups = list(packet.get("followups") or [])
    asked = _coerce_positive_int(packet.get("asked_followup_count", 0), default=0)
    if asked <= 0:
        asked = 0
    max_followups = _coerce_positive_int(packet.get("max_followups", len(followups)), default=len(followups))
    limit = min(max_followups, len(followups))
    if asked >= limit:
        return []
    return followups[asked:limit]


def _packet_has_followups(packet: dict | None) -> bool:
    return bool(_packet_followups_remaining(packet))


def _build_sprint_fallback_opener(sprint: int, prior_sprint_history: list[dict], parsed_resume: dict | None) -> str:
    """
    Context-aware sprint opener fallback — used when the LLM call for generate_sprint_opener fails.
    Builds a question anchored to the last substantive topic from the prior sprint instead of
    returning a completely generic template.
    """
    # Find the last substantive answer from the prior sprint to use as a pivot point
    last_focus_label = ""
    for turn in reversed(prior_sprint_history):
        label = turn.get("focus_label") or turn.get("focus_key") or ""
        answer = turn.get("answer", "")
        if label and label not in ("general", "general background") and _is_substantive_answer(answer):
            last_focus_label = label
            break

    if sprint == 2:
        if last_focus_label:
            return f"You mentioned work on {last_focus_label} — let's go deeper on the technical concepts there. What's the core idea that made it work?"
        return "Let's go deeper on the technical concepts behind your work. Pick one idea that was central — how did it actually work under the hood?"

    if sprint == 3:
        if last_focus_label:
            return f"Based on what you've described with {last_focus_label} — let's think about how that design would hold up at scale. Where do you think it would start to break under real load?"
        return "Let's stay with the system or project you just described. If it suddenly had to be far more reliable or handle much more load, what would you redesign first?"

    return f"Let's move into the next part of the interview. What aspect of your work do you think best shows your technical depth?"


# ─────────────────────────────────────────────
# SPRINT CONFIG
# ─────────────────────────────────────────────
QUESTIONS_PER_SPRINT = 5
MAX_INTERVIEW_MINUTES = 30

SPRINTS = {
    1: {
        "name": "Project Defense",
        "persona": "curious_lead",
        "goal": "Understand the candidate's most significant project — the problem it solved, their personal contribution, and the key decisions they made.",
    },
    2: {
        "name": "Foundations",
        "persona": "socratic_mentor",
        "goal": "Explore the candidate's conceptual understanding of the technical ideas in their work — reasoning and intuition, not trivia.",
    },
    3: {
        "name": "System Design",
        "persona": "senior_peer",
        "goal": "Think through real engineering trade-offs together — scaling, failure modes, and design alternatives.",
    },
}

SPRINT_OPENERS = {
    1: "Tell me about a project from your background that you're genuinely proud of — what problem were you trying to solve, and why did it matter?",
    2: "Let's talk about the technical concepts behind your work. Pick one idea at the core of what you've built — how would you explain it to someone encountering it for the first time?",
    3: "Staying with the system you just described, what would become the first real scaling or reliability bottleneck if usage jumped sharply?",
}


def _coerce_positive_int(value: object, default: int = 1) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def _staged_answer_version(item: dict) -> int:
    analysis = item.get("analysis", {})
    analysis_version = analysis.get("answer_version") if isinstance(analysis, dict) else None
    return _coerce_positive_int(item.get("answer_version", analysis_version), default=1)


def _is_superseded_staged_item(item: dict, latest_turn_versions: dict[str, int]) -> bool:
    turn_id = item.get("turn_id")
    if not turn_id:
        return False
    staged_version = _staged_answer_version(item)
    latest_version = _coerce_positive_int(
        latest_turn_versions.get(turn_id),
        default=staged_version,
    )
    return staged_version < latest_version


def _upsert_turn_skeleton(
    state: dict,
    *,
    turn_id: str,
    question: str,
    answer: str,
    sprint: int,
    persona: str,
    focus_key: str,
    focus_label: str,
    route_kind: str,
    answer_version: int,
) -> None:
    """
    Write immediate conversational memory for the just-committed candidate answer.

    This happens in the fast path before the full background analysis completes so
    continuity does not depend on delayed staging. The background pipeline later
    enriches this same turn record in-place by `turn_id`.
    """
    if not turn_id:
        return

    history = state.setdefault("history", [])
    existing = next((item for item in history if item.get("turn_id") == turn_id), None)
    payload = {
        "turn_id": turn_id,
        "question": question,
        "answer": answer,
        "weakness": None,
        "concepts": [],
        "discrepancy": None,
        "reasoning_behavior": None,
        "sprint": sprint,
        "persona": persona,
        "focus_key": focus_key,
        "focus_label": focus_label,
        "answer_version": answer_version,
        "route_kind": route_kind,
        "analysis_status": "pending",
    }

    if existing:
        existing.update(payload)
    else:
        history.append(payload)


class Orchestrator:
    """
    The Interview Controller — two-track response architecture.

    ┌─ FAST TRACK (handle_transcript) ──────────────────────────── ~300-500ms ─┐
    │  1. Consume staged analysis from previous background run                  │
    │     → apply to canonical state (history, weaknesses, candidate_model)     │
    │  2. Serve fast response — priority:                                        │
    │     a) prepped_next_question (adversarial probe, instant, no LLM)         │
    │     b) bank follow-up via adapt_followup() (Haiku, ~300ms)                │
    │     c) sprint fallback template (instant, no LLM)                         │
    │  3. Update canonical counters (question_count, sprint_question_count)      │
    │  4. Kick off background pipeline as asyncio.create_task                   │
    │  5. Return — candidate hears a response in ≤500ms                         │
    └────────────────────────────────────────────────────────────────────────────┘

    ┌─ SLOW TRACK (_run_background_pipeline) ──────────── runs during candidate ─┐
    │  Full WeaknessAgent + DiscrepancyAgent + ReasoningBehaviorAgent in parallel │
    │  → all guardrails applied (honest admission, consecutive guard, S3 remap)   │
    │  → full FollowUpAgent priority chain → adversarial probe for next turn      │
    │  Writes ONLY to staging fields. Never touches canonical state.              │
    │  (Codex invariant: one path mutates canonical state per committed answer)   │
    └────────────────────────────────────────────────────────────────────────────┘

    Net effect: zero dead air. Full adversarial analysis runs during the candidate's
    answer to the fast follow-up. Adversarial probe arrives instantly on the next turn.
    """

    def __init__(self, tts_service=None):
        self.session_manager = SessionManager()
        self.concept_agent = ConceptAgent()
        self.weakness_agent = WeaknessAgent()
        self.followup_agent = FollowUpAgent()
        self.discrepancy_agent = DiscrepancyAgent()
        self.evaluation_agent = EvaluationAgent()
        self.resume_agent = ResumeAgent()
        self.reasoning_agent = ReasoningBehaviorAgent()
        self.tts_service = tts_service  # Optional — enables audio pre-generation

        # In-memory inflight guard for _run_background_pipeline.
        # Keyed by (session_id, turn_id, answer_version) so exact duplicate work is
        # suppressed while same-turn revisions remain allowed to run.
        self._pipeline_inflight: set[tuple[str, str, int]] = set()
        # Tracks which turn_ids currently have ANY pipeline in flight per session.
        # Prevents STT revision explosions: if a pipeline is already running for a
        # given (session_id, turn_id), subsequent revisions skip launching a new one.
        self._turn_pipeline_running: dict[str, set[str]] = {}  # session_id → set[turn_id]

        self._per_answer_scores: dict[str, list[dict]] = {}
        self._partial_entities: dict[str, set] = {}
        self._partial_snapshot_meta: dict[str, dict] = {}
        self._speculative_locks: dict[str, asyncio.Lock] = {}

    async def _trace(self, session_id: str, event: str, **fields) -> None:
        await interview_telemetry.log(session_id, event, source="backend.orchestrator", **fields)

    # ─────────────────────────────────────────────
    # SESSION LIFECYCLE
    # ─────────────────────────────────────────────

    async def start_session(
        self,
        resume: str,
        github_links: list[str],
        target_role: str = "",
        years_experience: str = "",
    ) -> str:
        started_at = time.perf_counter()
        session_id = str(uuid.uuid4())

        parsed_resume = await self.resume_agent.parse(
            resume,
            target_role=target_role,
            years_experience=years_experience,
        )
        if not isinstance(parsed_resume, dict):
            parsed_resume = {}

        # Do NOT pre-load generic follow-ups into the opening packet. _seed_first_question
        # runs immediately after start_session and writes a resume-grounded follow-up to
        # prepped_next_question. Generic follow-ups in the opening packet would fire via
        # should_use_packet_followup BEFORE the seed arrives, shadowing it.
        # The BGPipeline populates proper follow-ups after Turn 1's answer.
        opening_followups: list[str] = []
        opening_packet = _build_question_packet(
            question_text=SPRINT_OPENERS[1],
            sprint=1,
            route_kind="sprint_opener",
            parsed_resume=parsed_resume,
            resume=resume,
            followups=opening_followups,
            source_turn_number=0,
        )

        state = {
            "session_id": session_id,
            "current_sprint": 1,
            "current_persona": "curious_lead",
            "sprint_name": SPRINTS[1]["name"],
            "question_count": 0,
            "sprint_question_count": 0,
            "interview_start_time": time.time(),
            "interview_complete": False,
            "resume": resume,
            "parsed_resume": parsed_resume,
            "github_links": github_links,
            "target_role": target_role,
            "years_experience": years_experience,
            "skills": parsed_resume.get("skills", []),
            "scores": {},
            "weaknesses": [],
            "history": [],
            "failure_surface": {},
            "final_evaluation": None,
            "last_question": SPRINT_OPENERS[1],
            "consecutive_high_weakness_count": 0,
            "last_weakness_type": None,
            "current_question_followups": list(opening_followups),
            "current_question_followup_asked": False,
            "active_question_packet": opening_packet,
            "prepped_next_packet": {},
            "candidate_model": {
                "project_map": {},
                "established_facts": [],
                "probed_weaknesses": [],
            },
            # ── Two-track staging fields ──────────────────────────────────────
            # Written ONLY by _run_background_pipeline.
            # Consumed atomically at the START of the next handle_transcript call.
            # Never written by the fast path (Codex invariant).
            #
            # prepped_next_question   — adversarial probe from full pipeline, served instantly
            # prepped_turn_queue      — ordered queue of completed background analyses
            #                           (each item contains analysis + metadata + turn_number)
            #                           consumed on later real turns / session end
            # prepped_next_context    — metadata attached to prepped_next_question
            "prepped_next_question": None,
            "prepped_next_question_turn_number": 0,
            "prepped_next_context": {},
            "prepped_turn_queue": [],
            # ── Speculative cache — partial-STT driven, Haiku only ────────────
            # Written ONLY by _run_speculative_generation (event-driven on partials).
            # Consumed in the fast path if no canonical prepped_next_question exists.
            # NEVER writes canonical state (Codex invariant extends here too).
            "speculative_cache": {},
            # Tracks the most recent candidate answer turn currently being resolved.
            # If the frontend submits another chunk with the same turn_id before the
            # AI has truly moved on, we treat it as a same-turn revision, not a
            # brand-new interview turn.
            "current_answer_turn_id": "",
            "current_answer_question": "",
            "current_answer_response": "",
            "current_answer_context": {},
            "current_answer_turn_number": 0,
            "current_answer_version": 0,
            # Tracks the newest committed same-turn revision per turn_id so stale
            # background runs can self-discard instead of overwriting newer analysis.
            "latest_turn_versions": {},
            # ── Interview trajectory map — resume-grounded fallback spine ─────
            # Generated once by _build_interview_map at session start using
            # deterministic focus extraction + per-focus LLM generation.
            # Consulted in the fast path whenever the staged/speculative path
            # is absent, generic, or weaker than a grounded resume-aware branch.
            "interview_trajectory_map": {},
        }
        await self.session_manager.save_state(session_id, state)
        await self._trace(
            session_id,
            "session_started",
            resume_chars=len(resume),
            github_links=len(github_links),
            target_role=target_role,
            years_experience=years_experience,
            opening_question=SPRINT_OPENERS[1],
            elapsed_ms=round((time.perf_counter() - started_at) * 1000, 3),
        )

        # Build the turn-1 seed and the full trajectory map before returning.
        # Product decision: startup latency is acceptable; a verified map is required
        # before the interview can start.
        seed_result, map_result = await asyncio.gather(
            self._seed_first_question(session_id),
            self._build_interview_map(session_id),
            return_exceptions=True,
        )

        if isinstance(seed_result, Exception):
            print(f"[Seed] start_session seed failure for {session_id[:8]}: {seed_result}")
        if isinstance(map_result, Exception):
            raise RuntimeError(f"Interview map build failed: {map_result}")

        verified_state = await self.session_manager.get_state(session_id)
        focus_areas = (verified_state.get("interview_trajectory_map") or {}).get("focus_areas", [])
        if not focus_areas:
            raise RuntimeError("Interview map missing after startup build")

        return session_id

    async def end_session(self, session_id: str) -> dict:
        started_at = time.perf_counter()
        state = await self.session_manager.get_state(session_id)
        state["interview_complete"] = True

        # Flush any staged analysis that hasn't been consumed so evaluation sees complete history
        queue = state.pop("prepped_turn_queue", [])
        legacy_staged = state.pop("prepped_turn_analysis", None)
        legacy_metadata = state.pop("prepped_next_metadata", {})
        if legacy_staged and legacy_staged.get("session_id") == session_id:
            queue.append({
                "turn_id": legacy_staged.get("turn_id", ""),
                "turn_number": legacy_staged.get("turn_number", state.get("question_count", 0)),
                "answer_version": legacy_staged.get("answer_version", 1),
                "analysis": legacy_staged,
                "metadata": legacy_metadata,
            })
        latest_turn_versions = dict(state.get("latest_turn_versions", {}))
        for item in sorted(
            queue,
            key=lambda queued: (
                queued.get("turn_number", 0),
                _staged_answer_version(queued),
            ),
        ):
            if _is_superseded_staged_item(item, latest_turn_versions):
                continue
            analysis = item.get("analysis", {})
            if analysis.get("session_id") == session_id:
                self._apply_staged_analysis(state, analysis, item.get("metadata", {}))
                applied_turn_id = item.get("turn_id")
                if applied_turn_id:
                    latest_turn_versions.pop(applied_turn_id, None)
        state.pop("prepped_next_question", None)
        state.pop("prepped_next_question_turn_number", None)
        state.pop("prepped_next_context", None)
        state.pop("prepped_next_packet", None)
        state.pop("speculative_cache", None)
        state.pop("latest_turn_versions", None)

        history = state.get("history", [])
        if history:
            reasoning_signals = [
                h.get("reasoning_behavior", {})
                for h in history
                if isinstance(h.get("reasoning_behavior"), dict)
            ]
            per_answer_scores = self._per_answer_scores.pop(session_id, [])
            weaknesses = state.get("weaknesses", [])
            unique_types = len({w.get("type") for w in weaknesses if w.get("type")})
            coverage_ratio = unique_types / max(len(weaknesses), 1) if weaknesses else 1.0

            evaluation = await self.evaluation_agent.score_full_interview(
                history=history,
                resume=state.get("resume", ""),
                weaknesses=weaknesses,
                reasoning_signals=reasoning_signals,
                per_answer_scores=per_answer_scores,
                coverage_ratio=coverage_ratio,
                target_role=state.get("target_role", ""),
                years_experience=state.get("years_experience", ""),
                parsed_resume=state.get("parsed_resume", {}),
            )
            state["final_evaluation"] = evaluation
            state["scores"] = evaluation.get("breakdown", {})
            state["failure_surface"] = evaluation.get("failure_surface", {})

        await self.session_manager.save_state(session_id, state)
        self._partial_entities.pop(session_id, None)
        self._partial_snapshot_meta.pop(session_id, None)
        await self._trace(
            session_id,
            "session_ended",
            question_count=state.get("question_count", 0),
            history_len=len(state.get("history", [])),
            sprint=state.get("current_sprint", 1),
            elapsed_ms=round((time.perf_counter() - started_at) * 1000, 3),
        )

        try:
            evaluation = state.get("final_evaluation") or {}
            duration = (time.time() - state.get("interview_start_time", time.time())) / 60
            asyncio.create_task(persist_session(
                session_id=session_id,
                resume_snippet=state.get("resume", "")[:200],
                hire_recommendation=evaluation.get("hire_recommendation", ""),
                overall_score=float(evaluation.get("overall_score") or 0),
                sprint_reached=int(state.get("current_sprint", 1)),
                duration_minutes=round(duration, 1),
            ))
        except Exception:
            pass

        return state

    async def _score_answer_async(
        self,
        session_id: str,
        question: str,
        answer: str,
        target_role: str = "",
        years_experience: str = "",
    ):
        """Per-answer scoring — fired from background pipeline, never blocks response path."""
        try:
            score = await self.evaluation_agent.score_answer(
                question,
                answer,
                target_role=target_role,
                years_experience=years_experience,
            )
            if isinstance(score, dict) and "score" in score:
                if session_id not in self._per_answer_scores:
                    self._per_answer_scores[session_id] = []
                self._per_answer_scores[session_id].append({
                    "question": question[:100],
                    "score": score.get("score", 0),
                    "breakdown": score.get("breakdown", {}),
                })
        except Exception:
            pass

    # ─────────────────────────────────────────────
    # REAL-TIME TRANSCRIPT HANDLING
    # ─────────────────────────────────────────────

    async def on_partial_transcript(
        self,
        session_id: str,
        text: str,
        entities: list[str] | None = None,
        turn_id: str = "",
        is_final: bool = True,
        snapshot_seq: int = 0,
    ):
        """
        Fires on throttled live transcript snapshots while the candidate is speaking.

        Two jobs:
        1. Entity accumulation — merged into full turn at handle_transcript time
        2. Speculative question generation (event-driven, Haiku only):
           - New entity detected → generate entity-anchored follow-up
           - Admission/gap signal detected → generate exploratory pivot question
           - Longer rolling transcript snapshot → refresh the "best available so far"
             speculative follow-up while the candidate is still talking
           NO canonical state written here. Codex invariant holds.
        """
        if not turn_id or not text:
            return

        cleaned = text.strip()
        if not cleaned:
            return

        snapshot_meta = self._partial_snapshot_meta.get(session_id)
        if snapshot_meta and snapshot_meta.get("turn_id") == turn_id:
            last_seq = int(snapshot_meta.get("snapshot_seq", 0) or 0)
            if snapshot_seq and snapshot_seq < last_seq:
                await self._trace(
                    session_id,
                    "partial_snapshot_dropped_stale",
                    turn_id=turn_id,
                    snapshot_seq=snapshot_seq,
                    last_snapshot_seq=last_seq,
                    is_final=is_final,
                    level="warn",
                )
                return

        self._partial_snapshot_meta[session_id] = {
            "turn_id": turn_id,
            "snapshot_seq": snapshot_seq,
            "is_final": is_final,
            "transcript_chars": len(cleaned),
        }

        existing = self._partial_entities.get(session_id, set())

        new_entities: set[str] = set()
        if entities:
            new_entities = set(entities) - existing
            existing.update(entities)
            self._partial_entities[session_id] = existing

        admission = _looks_like_admission(cleaned)

        # Fire speculative if:
        # a) new named entity detected, OR
        # b) admission/gap signal, OR
        # c) rolling transcript has enough substance to ground a better follow-up
        #    — covers the common case where Deepgram NER misses technical jargon
        word_count = len(cleaned.split())
        periodic_trigger_words = 16 if not is_final else 20
        periodic_trigger = word_count >= periodic_trigger_words and not admission and not new_entities

        if new_entities or admission or periodic_trigger:
            asyncio.create_task(
                self._run_speculative_generation(
                    session_id=session_id,
                    partial_text=cleaned,
                    new_entities=new_entities,
                    admission=admission,
                    turn_id=turn_id,
                    is_final=is_final,
                    snapshot_seq=snapshot_seq,
                )
            )

    async def handle_transcript(
        self,
        session_id: str,
        text: str,
        entities: list[str] | None = None,
        turn_id: str = "",
    ) -> dict:
        """
        FAST PATH — returns in ~300-500ms regardless of full pipeline latency.

        On every committed utterance:
          1. Consume staged analysis from previous background run → apply to canonical state
          2. Serve fast response (prepped probe → bank follow-up → sprint fallback)
          3. Update canonical counters
          4. Kick off background pipeline (runs during candidate's next answer)
          5. Return immediately
        """
        started_at = time.perf_counter()
        state = await self.session_manager.get_state(session_id)
        await self._trace(
            session_id,
            "fasttrack_start",
            turn_id=turn_id,
            transcript_chars=len(text),
            transcript_words=len(text.split()),
            entities_count=len(entities or []),
            question_count=state.get("question_count", 0),
            sprint=state.get("current_sprint", 1),
        )

        if state.get("interview_complete"):
            return {"response": "The interview has concluded. Thank you.", "complete": True, "turn_id": turn_id}

        is_turn_revision = bool(turn_id and turn_id == state.get("current_answer_turn_id"))
        current_answer_version = (
            state.get("current_answer_version", 0) + 1
            if is_turn_revision
            else 1
        )
        latest_turn_versions = dict(state.get("latest_turn_versions", {}))
        if turn_id:
            latest_turn_versions[turn_id] = current_answer_version

        # Merge entities from partial accumulation
        accumulated = self._partial_entities.pop(session_id, set())
        partial_snapshot_meta = self._partial_snapshot_meta.get(session_id)
        if partial_snapshot_meta and partial_snapshot_meta.get("turn_id") == turn_id:
            self._partial_snapshot_meta.pop(session_id, None)
        if entities:
            accumulated.update(entities)
        entities = list(accumulated) if accumulated else entities

        last_question = (
            state.get("current_answer_question", "")
            if is_turn_revision and state.get("current_answer_question")
            else state.get("last_question", "")
        )
        sprint = state.get("current_sprint", 1)
        persona = state.get("current_persona", "curious_lead")
        parsed_resume = state.get("parsed_resume", {})
        resume = state.get("resume", "")
        resume_context = _build_resume_context_for_followup(parsed_resume, resume)

        # Ghost-VAD / echo filter — discard answers that are just the AI's question echoed back
        if _looks_like_question_echo(text, last_question):
            await self._trace(
                session_id,
                "fasttrack_echo_guard",
                turn_id=turn_id,
                route_kind="echo_guard",
                transcript_chars=len(text),
                question_chars=len(last_question),
                level="warn",
            )
            return {
                "response": "Your audio sounded like it picked up my question instead of your answer. Start again from the top and give me your answer in your own words.",
                "sprint": sprint,
                "sprint_name": state["sprint_name"],
                "persona": persona,
                "question_count": state["question_count"],
                "complete": False,
                "pivoting": False,
                "weakness": None,
                "discrepancy": None,
                "route_kind": "echo_guard",
                "turn_id": turn_id,
            }

        # ── Step 1: Consume staged analysis from previous turn ────────────────
        # Background pipeline writes turn N's full analysis here.
        # Applied at the START of turn N+1 — never inside the background pipeline.
        # This is the single path that mutates canonical state per committed answer.
        queue = state.pop("prepped_turn_queue", [])
        legacy_staged = state.pop("prepped_turn_analysis", None)
        legacy_metadata = state.pop("prepped_next_metadata", {})
        if legacy_staged and legacy_staged.get("session_id") == session_id:
            queue.append({
                "turn_id": legacy_staged.get("turn_id", ""),
                "turn_number": legacy_staged.get("turn_number", state.get("question_count", 0)),
                "answer_version": legacy_staged.get("answer_version", 1),
                "analysis": legacy_staged,
                "metadata": legacy_metadata,
            })

        ready_items: list[dict] = []
        deferred_items: list[dict] = []
        dropped_superseded = 0
        for item in queue:
            if _is_superseded_staged_item(item, latest_turn_versions):
                print(
                    f"[FastTrack] Dropping superseded staged analysis for turn_id "
                    f"{item.get('turn_id')} v{_staged_answer_version(item)}"
                )
                dropped_superseded += 1
                continue
            if turn_id and item.get("turn_id") == turn_id:
                deferred_items.append(item)
            else:
                ready_items.append(item)

        for item in sorted(
            ready_items,
            key=lambda queued: (
                queued.get("turn_number", 0),
                _staged_answer_version(queued),
            ),
        ):
            analysis = item.get("analysis", {})
            if analysis.get("session_id") == session_id:
                self._apply_staged_analysis(state, analysis, item.get("metadata", {}))
                applied_turn_id = item.get("turn_id")
                if applied_turn_id:
                    latest_turn_versions.pop(applied_turn_id, None)
        if deferred_items:
            state["prepped_turn_queue"] = deferred_items
        else:
            state.pop("prepped_turn_queue", None)
        await self._trace(
            session_id,
            "fasttrack_stage_consume",
            turn_id=turn_id,
            is_revision=is_turn_revision,
            ready_items=len(ready_items),
            deferred_items=len(deferred_items),
            dropped_superseded=dropped_superseded,
        )

        active_packet = _clone_question_packet(state.get("active_question_packet"))
        if not active_packet and last_question:
            active_packet = _build_question_packet(
                question_text=last_question,
                sprint=sprint,
                route_kind="unknown",
                parsed_resume=parsed_resume,
                resume=resume,
                followups=list(state.get("current_question_followups") or []),
                source_turn_number=max(state.get("question_count", 0), 0),
            )

        current_focus_key, current_focus_label = _infer_focus(last_question, text, parsed_resume, resume)
        focus_prompt_pack = _build_focus_prompt_pack(
            state.get("interview_trajectory_map", {}),
            focus_key=current_focus_key,
            last_question=last_question,
            answer=text,
            history=state.get("history", []),
        )
        if not is_turn_revision:
            _upsert_turn_skeleton(
                state,
                turn_id=turn_id,
                question=last_question,
                answer=text,
                sprint=sprint,
                persona=persona,
                focus_key=current_focus_key,
                focus_label=current_focus_label,
                route_kind=active_packet.get("route_kind", "unknown"),
                answer_version=current_answer_version,
            )

        # ── Step 2: Determine fast response ──────────────────────────────────
        # Priority:
        # a) current question packet follow-up — deterministic deepening before topic advance
        # b) prepped_next_packet — background-prepared next main question
        # c) speculative_cache — entity/admission-triggered Haiku question from partials
        # d) sprint fallback template (instant, no LLM)
        prepped_q = None
        prepped_context: dict = {}
        prepped_packet: dict = {}
        if is_turn_revision:
            prepped_q = state.get("current_answer_response")
            prepped_context = state.get("current_answer_context", {})
        else:
            prepped_q = state.get("prepped_next_question")
            prepped_context = state.get("prepped_next_context", {})
            prepped_packet = _clone_question_packet(state.get("prepped_next_packet"))
            seed_turn_number = state.get("prepped_next_question_turn_number")

            if prepped_q and seed_turn_number == 0:
                if not _seed_relevant_to_answer(prepped_q, text, entities or [], parsed_resume, resume):
                    print(f"[FastTrack] Seed discarded — topic mismatch with first answer for {session_id}")
                    prepped_q = None
                    prepped_context = {}
                    prepped_packet = {}
            if seed_turn_number == 0 and current_focus_key not in ("general", "general background"):
                trajectory_seed = select_from_trajectory_map_detailed(
                    state.get("interview_trajectory_map", {}),
                    sprint=sprint,
                    focus_key=current_focus_key,
                    answer=text,
                    entities=entities or [],
                    history=state.get("history", []),
                    admission=_looks_like_admission(text),
                    has_discrepancy=False,
                )
                if trajectory_seed:
                    trajectory_question = trajectory_seed["question"]
                    trajectory_route_kind = trajectory_seed["route_kind"]
                    trajectory_focus_key = trajectory_seed["focus_key"]
                    trajectory_focus_label = trajectory_seed["focus_label"]
                    seeded_focus_key, _ = _infer_focus(prepped_q or "", "", parsed_resume, resume)
                    if trajectory_focus_key == current_focus_key and seeded_focus_key != current_focus_key:
                        prepped_q = trajectory_question
                        prepped_context = {
                            "pivoting": trajectory_route_kind == "trajectory_map_bridge",
                            "route_kind": trajectory_route_kind,
                            "weakness": None,
                            "discrepancy": None,
                        }
                        prepped_packet = _build_question_packet(
                            question_text=prepped_q,
                            sprint=sprint,
                            route_kind=trajectory_route_kind,
                            parsed_resume=parsed_resume,
                            resume=resume,
                            followups=[],
                            pivoting=trajectory_route_kind == "trajectory_map_bridge",
                            source_turn_number=state.get("question_count", 0),
                            focus_key_override=trajectory_focus_key,
                            focus_label_override=trajectory_focus_label,
                        )
                        print(f"[FastTrack] Trajectory map replaced seed for {session_id}")

        pivoting = prepped_context.get("pivoting", False)
        served_route_kind = prepped_context.get("route_kind")
        served_weakness: dict | None = None
        served_discrepancy: dict | None = None

        spec = state.get("speculative_cache", {})
        if spec.get("turn_id") and spec.get("turn_id") != turn_id:
            state["speculative_cache"] = {}
            spec = {}

        admission = _looks_like_admission(text)
        trajectory_admission = None
        if not is_turn_revision and admission:
            trajectory_admission = select_from_trajectory_map_detailed(
                state.get("interview_trajectory_map", {}),
                sprint=sprint,
                focus_key=current_focus_key,
                answer=text,
                entities=entities or [],
                history=state.get("history", []),
                admission=True,
                has_discrepancy=bool(served_discrepancy),
                branch_hint="if_honest_gap",
            )

        current_packet_followups = _packet_followups_remaining(active_packet)
        should_use_packet_followup = (
            not is_turn_revision
            and bool(current_packet_followups)
            and not active_packet.get("pivoting")
            and not trajectory_admission
            and _should_prioritize_bank_followup(prepped_context, current_packet_followups, active_packet)
        )

        if should_use_packet_followup:
            raw_followup = current_packet_followups[0]
            fast_response = await self.followup_agent.adapt_followup(
                raw_followup=raw_followup,
                question=last_question,
                answer=text,
                persona=persona,
                resume_context=resume_context,
                focus_context=focus_prompt_pack.get("prompt_context", ""),
                resume_snippets=focus_prompt_pack.get("resume_snippets", []),
            )
            active_packet["asked_followup_count"] = active_packet.get("asked_followup_count", 0) + 1
            active_packet["question_text"] = fast_response
            active_packet["route_kind"] = "bank_followup_fast"
            served_weakness = None
            served_discrepancy = None
            served_route_kind = "bank_followup_fast"
            pivoting = False
            print(f"[FastTrack] Active-packet follow-up served for {session_id}")

        else:
            generic_prepped_fasttrack = bool(prepped_q) and _is_generic_fasttrack_route(
                prepped_context.get("route_kind")
            )

            if trajectory_admission and (not prepped_q or generic_prepped_fasttrack):
                prepped_q = trajectory_admission["question"]
                trajectory_route_kind = trajectory_admission["route_kind"]
                prepped_context = {
                    "pivoting": trajectory_route_kind == "trajectory_map_bridge",
                    "route_kind": trajectory_route_kind,
                    "weakness": None,
                    "discrepancy": None,
                }
                prepped_packet = _build_question_packet(
                    question_text=prepped_q,
                    sprint=sprint,
                    route_kind=trajectory_route_kind,
                    parsed_resume=parsed_resume,
                    resume=resume,
                    followups=[],
                    pivoting=trajectory_route_kind == "trajectory_map_bridge",
                    source_turn_number=state.get("question_count", 0),
                    focus_key_override=trajectory_admission["focus_key"],
                    focus_label_override=trajectory_admission["focus_label"],
                )
                generic_prepped_fasttrack = False
                print(f"[FastTrack] Trajectory-map honesty probe promoted for {session_id}")

            if generic_prepped_fasttrack:
                if (
                    spec.get("best_ready_question")
                    and spec.get("sprint") == sprint
                    and spec.get("turn_id") == turn_id
                ):
                    prepped_q = spec["best_ready_question"]
                    state["speculative_cache"] = {}
                    prepped_context = {
                        "pivoting": False,
                        "route_kind": "speculative_fast",
                        "weakness": None,
                        "discrepancy": None,
                    }
                    prepped_packet = _build_question_packet(
                        question_text=prepped_q,
                        sprint=sprint,
                        route_kind="speculative_fast",
                        parsed_resume=parsed_resume,
                        resume=resume,
                        followups=[],
                        source_turn_number=state.get("question_count", 0),
                    )
                    generic_prepped_fasttrack = False
                    print(
                        f"[FastTrack] Promoted speculative candidate over generic staged fallback for {session_id}"
                    )
                else:
                    trajectory_generic = select_from_trajectory_map_detailed(
                        state.get("interview_trajectory_map", {}),
                        sprint=sprint,
                        focus_key=current_focus_key,
                        answer=text,
                        entities=entities or [],
                        history=state.get("history", []),
                        admission=admission,
                        has_discrepancy=bool(served_discrepancy),
                    )
                    if trajectory_generic:
                        prepped_q = trajectory_generic["question"]
                        trajectory_route_kind = trajectory_generic["route_kind"]
                        prepped_context = {
                            "pivoting": trajectory_route_kind == "trajectory_map_bridge",
                            "route_kind": trajectory_route_kind,
                            "weakness": None,
                            "discrepancy": None,
                        }
                        prepped_packet = _build_question_packet(
                            question_text=prepped_q,
                            sprint=sprint,
                            route_kind=trajectory_route_kind,
                            parsed_resume=parsed_resume,
                            resume=resume,
                            followups=[],
                            pivoting=trajectory_route_kind == "trajectory_map_bridge",
                            source_turn_number=state.get("question_count", 0),
                            focus_key_override=trajectory_generic["focus_key"],
                            focus_label_override=trajectory_generic["focus_label"],
                        )
                        generic_prepped_fasttrack = False
                        print(
                            f"[FastTrack] Trajectory map promoted over generic staged fallback for {session_id}"
                        )

            if not prepped_q:
                if (
                    spec.get("best_ready_question")
                    and spec.get("sprint") == sprint
                    and spec.get("turn_id") == turn_id
                ):
                    prepped_q = spec["best_ready_question"]
                    state["speculative_cache"] = {}
                    prepped_context = {
                        "pivoting": False,
                        "route_kind": "speculative_fast",
                        "weakness": None,
                        "discrepancy": None,
                    }
                    prepped_packet = _build_question_packet(
                        question_text=prepped_q,
                        sprint=sprint,
                        route_kind="speculative_fast",
                        parsed_resume=parsed_resume,
                        resume=resume,
                        followups=[],
                        source_turn_number=state.get("question_count", 0),
                    )
                    print(f"[FastTrack] Speculative candidate promoted for {session_id}")

            rescued = False
            should_try_short_answer_rescue = (
                not is_turn_revision
                and _short_answer_rescue_eligible(text)
                and (not prepped_q or generic_prepped_fasttrack)
            )
            if should_try_short_answer_rescue:
                # ── 1. Instant: trajectory map short-answer track (no latency) ──
                traj_short = select_from_trajectory_map_detailed(
                    state.get("interview_trajectory_map", {}),
                    sprint=sprint,
                    focus_key=current_focus_key,
                    answer=text,
                    entities=entities or [],
                    history=state.get("history", []),
                    admission=admission,
                    has_discrepancy=bool(served_discrepancy),
                    branch_hint="if_short_answer",
                )
                if traj_short:
                    fast_response = traj_short["question"]
                    served_route_kind = traj_short["route_kind"]
                    served_weakness = None
                    served_discrepancy = None
                    active_packet = _build_question_packet(
                        question_text=fast_response,
                        sprint=sprint,
                        route_kind=served_route_kind,
                        parsed_resume=parsed_resume,
                        resume=resume,
                        followups=[],
                        source_turn_number=state.get("question_count", 0),
                        focus_key_override=traj_short["focus_key"],
                        focus_label_override=traj_short["focus_label"],
                    )
                    pivoting = False
                    rescued = True
                    await self._trace(
                        session_id,
                        "trajectory_map_short_answer_served",
                        turn_id=turn_id,
                        word_count=len(text.split()),
                        route_kind=served_route_kind,
                        focus_key=current_focus_key,
                    )
                    print(f"[FastTrack] Trajectory-map short-answer served ({served_route_kind}) for {session_id}")

                # ── 2. Live Haiku rescue — only when map didn't help ──────────
                if not rescued:
                    try:
                        await self._trace(
                            session_id,
                            "short_answer_rescue_attempt",
                            turn_id=turn_id,
                            word_count=len(text.split()),
                            generic_prepped_fasttrack=generic_prepped_fasttrack,
                        )
                        rescue_decision = await asyncio.wait_for(
                            self.followup_agent.generate_speculative(
                                partial_text=text,
                                new_entities=entities or [],
                                last_question=last_question,
                                persona=persona,
                                sprint=sprint,
                                resume_context=resume_context,
                                admission=admission,
                                current_best_question="",
                                short_answer_rescue=True,
                                focus_context=focus_prompt_pack.get("prompt_context", ""),
                                resume_snippets=focus_prompt_pack.get("resume_snippets", []),
                            ),
                            timeout=1.6,
                        )
                        rescue_question = str(rescue_decision.get("question", "") or "").strip()
                        if rescue_question:
                            fast_response = rescue_question
                            served_weakness = None
                            served_discrepancy = None
                            served_route_kind = "short_answer_rescue"
                            active_packet = _build_question_packet(
                                question_text=fast_response,
                                sprint=sprint,
                                route_kind=served_route_kind,
                                parsed_resume=parsed_resume,
                                resume=resume,
                                followups=[],
                                source_turn_number=state.get("question_count", 0),
                            )
                            pivoting = False
                            rescued = True
                            await self._trace(
                                session_id,
                                "short_answer_rescue_succeeded",
                                turn_id=turn_id,
                                word_count=len(text.split()),
                                rescue_question_chars=len(rescue_question),
                                generic_prepped_fasttrack=generic_prepped_fasttrack,
                            )
                            print(f"[FastTrack] Short-answer rescue served for {session_id}")
                    except asyncio.TimeoutError:
                        await self._trace(
                            session_id,
                            "short_answer_rescue_timed_out",
                            turn_id=turn_id,
                            word_count=len(text.split()),
                            generic_prepped_fasttrack=generic_prepped_fasttrack,
                            level="warn",
                        )
                        print(f"[FastTrack] Short-answer rescue timed out for {session_id}")
                    except Exception as e:
                        await self._trace(
                            session_id,
                            "short_answer_rescue_failed",
                            turn_id=turn_id,
                            word_count=len(text.split()),
                            generic_prepped_fasttrack=generic_prepped_fasttrack,
                            level="warn",
                            error_type=type(e).__name__,
                            error=str(e)[:300],
                        )
                        print(f"[FastTrack] Short-answer rescue failed for {session_id}: {e}")

            # Dedup guard: if the prepped question was already served this session,
            # discard it so we don't repeat the same text back-to-back.
            if prepped_q and not rescued and not is_turn_revision:
                if _question_already_asked(prepped_q, state.get("history", [])):
                    print(f"[FastTrack] Dedup: prepped_q already in history — discarding for {session_id}")
                    prepped_q = None
                    state.pop("prepped_next_question", None)
                    state.pop("prepped_next_question_turn_number", None)
                    state.pop("prepped_next_context", None)
                    state.pop("prepped_next_packet", None)
                    prepped_context = {}
                    prepped_packet = {}

            if prepped_q and not rescued:
                fast_response = prepped_q
                served_weakness = prepped_context.get("weakness")
                served_discrepancy = prepped_context.get("discrepancy")
                if not served_route_kind:
                    served_route_kind = "prepped_next_question"
                active_packet = prepped_packet or _build_question_packet(
                    question_text=fast_response,
                    sprint=sprint,
                    route_kind=served_route_kind,
                    parsed_resume=parsed_resume,
                    resume=resume,
                    followups=[],
                    pivoting=prepped_context.get("pivoting", False),
                    weakness=served_weakness,
                    discrepancy=served_discrepancy,
                    source_turn_number=state.get("question_count", 0),
                )
                state.pop("prepped_next_question", None)
                state.pop("prepped_next_question_turn_number", None)
                state.pop("prepped_next_context", None)
                state.pop("prepped_next_packet", None)
                print(f"[FastTrack] {served_route_kind} ready — serving instantly for {session_id}")

            elif not rescued:
                    # ── 1. Trajectory map — resume-grounded, instant ──────────
                    traj_result = select_from_trajectory_map_detailed(
                        state.get("interview_trajectory_map", {}),
                        sprint=sprint,
                        focus_key=current_focus_key,
                        answer=text,
                        entities=entities or [],
                        history=state.get("history", []),
                        admission=admission,
                        has_discrepancy=bool(served_discrepancy),
                    )
                    if traj_result:
                        fast_response = traj_result["question"]
                        served_route_kind = traj_result["route_kind"]
                        active_packet = _build_question_packet(
                            question_text=fast_response,
                            sprint=sprint,
                            route_kind=served_route_kind,
                            parsed_resume=parsed_resume,
                            resume=resume,
                            followups=[],
                            pivoting=served_route_kind == "trajectory_map_bridge",
                            source_turn_number=state.get("question_count", 0),
                            focus_key_override=traj_result["focus_key"],
                            focus_label_override=traj_result["focus_label"],
                        )
                        await self._trace(
                            session_id,
                            "trajectory_map_served",
                            turn_id=turn_id,
                            route_kind=served_route_kind,
                            focus_key=current_focus_key,
                        )
                        print(f"[FastTrack] Trajectory map served ({served_route_kind}) for {session_id}")
                    else:
                        # ── 2. Generic fallback — last resort ─────────────────
                        fallbacks = _FALLBACK_FOLLOWUPS.get(sprint, ["Walk me through your thinking on that."])
                        history_for_dedup = state.get("history", [])
                        # Pick the first fallback not already in session history.
                        # If all are exhausted (very long generic sessions), cycle back to [0].
                        fast_response = next(
                            (fb for fb in fallbacks if not _question_already_asked(fb, history_for_dedup)),
                            fallbacks[0],
                        )
                        served_route_kind = "sprint_fallback"
                        print(f"[FastTrack] Sprint fallback served for {session_id}")

                    served_weakness = None
                    served_discrepancy = None
                    # No generic follow-ups chained off a fallback — the BGPipeline will generate
                    # a proper question packet after this answer. Chaining fallbacks creates a generic
                    # loop that's worse than waiting for the background pipeline.
                    active_packet = _build_question_packet(
                        question_text=fast_response,
                        sprint=sprint,
                        route_kind=served_route_kind,
                        parsed_resume=parsed_resume,
                        resume=resume,
                        followups=[],
                        source_turn_number=state.get("question_count", 0),
                    )
                    pivoting = False

        await self._trace(
            session_id,
            "fasttrack_response_selected",
            turn_id=turn_id,
            is_revision=is_turn_revision,
            route_kind=served_route_kind,
            pivoting=bool(pivoting),
            current_packet_followups_remaining=len(_packet_followups_remaining(active_packet)),
            had_prepped=bool(prepped_q),
            had_speculative=bool(spec.get("best_ready_question")) if isinstance(spec, dict) else False,
            weakness_type=served_weakness.get("type") if isinstance(served_weakness, dict) else None,
            weakness_severity=served_weakness.get("severity") if isinstance(served_weakness, dict) else None,
            discrepancy_conflict=served_discrepancy.get("conflict_level") if isinstance(served_discrepancy, dict) else None,
        )

        # ── Step 3: Update canonical state ───────────────────────────────────
        # Only counters and current question. History/weaknesses/candidate_model
        # are updated when staged analysis is consumed (Step 1).
        current_turn_number = state.get("current_answer_turn_number", state.get("question_count", 0))
        if not is_turn_revision:
            state["question_count"] = state.get("question_count", 0) + 1
            state["sprint_question_count"] = state.get("sprint_question_count", 0) + 1
            state["last_question"] = fast_response
            current_turn_number = state["question_count"]

            advanced, sprint_opener = await self._maybe_advance_sprint(
                state,
                answered_question=last_question,
                current_answer=text,
            )
            if advanced:
                fast_response = sprint_opener
                state["last_question"] = fast_response
                state.pop("prepped_next_question", None)
                state.pop("prepped_next_question_turn_number", None)
                state.pop("prepped_next_context", None)
                state.pop("prepped_next_packet", None)
                # No generic follow-ups on sprint openers — same reason as session start.
                # The BGPipeline for the opener answer will build proper follow-ups.
                active_packet = _build_question_packet(
                    question_text=fast_response,
                    sprint=state["current_sprint"],
                    route_kind="sprint_opener",
                    parsed_resume=parsed_resume,
                    resume=resume,
                    followups=[],
                    source_turn_number=state.get("question_count", 0),
                )
        else:
            state["last_question"] = fast_response

        state["active_question_packet"] = _clone_question_packet(active_packet)
        state["current_question_followups"] = _packet_followups_remaining(active_packet)
        state["current_question_followup_asked"] = not _packet_has_followups(active_packet)
        state["current_answer_turn_id"] = turn_id
        state["current_answer_question"] = last_question
        state["current_answer_response"] = fast_response
        state["current_answer_context"] = {
            "pivoting": pivoting,
            "route_kind": served_route_kind,
            "weakness": served_weakness,
            "discrepancy": served_discrepancy,
            "answer_version": current_answer_version,
            "packet_focus_key": active_packet.get("focus_key", ""),
            "packet_focus_label": active_packet.get("focus_label", ""),
        }
        state["current_answer_turn_number"] = current_turn_number
        state["current_answer_version"] = current_answer_version
        state["latest_turn_versions"] = latest_turn_versions

        complete = self._is_complete(state)
        await self.session_manager.save_state(session_id, state)

        if complete:
            await self.end_session(session_id)
            await self._trace(
                session_id,
                "fasttrack_complete",
                turn_id=turn_id,
                route_kind="complete",
                elapsed_ms=round((time.perf_counter() - started_at) * 1000, 3),
            )
            return {
                "response": "That wraps up our interview. Well done for getting through all three sprints. Your report is being generated now.",
                "sprint": state["current_sprint"],
                "persona": persona,
                "complete": True,
                "pivoting": False,
                "weakness": None,
                "discrepancy": None,
                "route_kind": "complete",
                "turn_id": turn_id,
            }

        # ── Step 4: Kick off background pipeline ─────────────────────────────
        # Runs during candidate's answer to fast_response.
        # Writes only to staging fields — canonical state never touched there.
        asyncio.create_task(
            self._run_background_pipeline(
                session_id=session_id,
                text=text,
                entities=entities,
                last_question=last_question,
                turn_id=turn_id,
                turn_number=current_turn_number,
                answer_version=current_answer_version,
            )
        )

        elapsed_ms = round((time.perf_counter() - started_at) * 1000)
        print(f"[FastTrack] {served_route_kind or 'unknown'} served in {elapsed_ms}ms for {session_id}")
        await self._trace(
            session_id,
            "fasttrack_done",
            turn_id=turn_id,
            route_kind=served_route_kind,
            sprint=state["current_sprint"],
            question_count=state["question_count"],
            elapsed_ms=round((time.perf_counter() - started_at) * 1000, 3),
        )

        return {
            "response": fast_response,
            "sprint": state["current_sprint"],
            "sprint_name": state["sprint_name"],
            "persona": persona,
            "question_count": state["question_count"],
            "complete": False,
            "pivoting": pivoting,
            # Weakness that generated this question (from previous background run)
            # Allows frontend to show "BOUNDARY EXPOSED" on adversarial probes
            "weakness": served_weakness,
            "discrepancy": served_discrepancy,
            "route_kind": served_route_kind,
            "turn_id": turn_id,
        }

    def _apply_staged_analysis(self, state: dict, staged: dict, metadata: dict) -> None:
        """
        Apply a background pipeline's analysis to canonical session state.
        Called ONLY at the start of handle_transcript — never inside the background pipeline.

        Updates: history, weaknesses, candidate_model, consecutive weakness guard,
                 follow-up sequencing state.
        """
        history = state.setdefault("history", [])
        existing_turn_id = staged.get("turn_id")
        existing_turn = next((item for item in history if item.get("turn_id") == existing_turn_id), None)
        already_complete = bool(existing_turn and existing_turn.get("analysis_status") == "complete")

        payload = {
            "turn_id": existing_turn_id,
            "question": staged.get("question", ""),
            "answer": staged.get("answer", ""),
            "weakness": staged.get("weakness"),
            "concepts": staged.get("concepts", []),
            "discrepancy": staged.get("discrepancy"),
            "reasoning_behavior": staged.get("reasoning_behavior"),
            "sprint": staged.get("sprint", state.get("current_sprint", 1)),
            "persona": staged.get("persona", state.get("current_persona", "curious_lead")),
            "focus_key": staged.get("focus_key", ""),
            "focus_label": staged.get("focus_label", ""),
            "answer_version": staged.get("answer_version", 1),
            "route_kind": metadata.get("route_kind", "unknown"),
            "analysis_status": "complete",
        }

        if existing_turn:
            existing_turn.update(payload)
        else:
            history.append(payload)

        # Append weakness to ledger
        weakness = staged.get("weakness")
        if weakness and weakness.get("type") and not already_complete:
            state["weaknesses"].append(weakness)

        # Apply candidate memory updates
        cm_updates = staged.get("candidate_model_updates", {})
        cm = state.get("candidate_model", {"project_map": {}, "established_facts": [], "probed_weaknesses": []})
        if not already_complete:
            for fact in cm_updates.get("established_facts", []):
                if fact not in cm["established_facts"]:
                    cm["established_facts"].append(fact)
            for probe in cm_updates.get("probed_weaknesses", []):
                cm["probed_weaknesses"].append(probe)
            cm["probed_weaknesses"] = cm["probed_weaknesses"][-8:]
        state["candidate_model"] = cm

        # Restore weakness guard state from background run
        if "consecutive_high_weakness_count" in metadata:
            state["consecutive_high_weakness_count"] = metadata["consecutive_high_weakness_count"]
            state["last_weakness_type"] = metadata.get("last_weakness_type")

        # Restore follow-up sequencing — only if background generated a sprint question
        # (discrepancy/weakness probes don't generate new bank follow-ups)
        if "current_question_followups" in metadata:
            state["current_question_followups"] = metadata["current_question_followups"]
            state["current_question_followup_asked"] = metadata.get("current_question_followup_asked", False)

        asyncio.create_task(
            interview_telemetry.log(
                state.get("session_id", "unknown"),
                "staged_analysis_applied",
                source="backend.orchestrator",
                turn_id=existing_turn_id,
                route_kind=metadata.get("route_kind", "unknown"),
                weakness_type=weakness.get("type") if isinstance(weakness, dict) else None,
                weakness_severity=weakness.get("severity") if isinstance(weakness, dict) else None,
                discrepancy_conflict=staged.get("discrepancy", {}).get("conflict_level")
                if isinstance(staged.get("discrepancy"), dict)
                else None,
                already_complete=already_complete,
            )
        )

    # ─────────────────────────────────────────────
    # BACKGROUND PIPELINE
    # ─────────────────────────────────────────────

    async def _run_background_pipeline(
        self,
        session_id: str,
        text: str,
        entities: list[str] | None,
        last_question: str,
        turn_id: str,
        turn_number: int,
        answer_version: int,
    ) -> None:
        """
        Full reasoning pipeline — runs during the candidate's answer to the fast follow-up.

        Runs all agents in parallel, applies all guardrails, generates the next adversarial
        question via the full FollowUpAgent priority chain.

        INVARIANT: canonical state fields (history, question_count, last_question, weaknesses,
        sprint counters, candidate_model) are NEVER mutated here. All outputs are staged in
        prepped_* fields and consumed atomically at the start of the next handle_transcript.
        """
        pipeline_key = (
            session_id,
            turn_id or f"turn-{turn_number}",
            answer_version,
        )
        await self._trace(
            session_id,
            "bgpipeline_start",
            turn_id=turn_id,
            turn_number=turn_number,
            answer_version=answer_version,
            transcript_chars=len(text),
            transcript_words=len(text.split()),
            entities_count=len(entities or []),
        )

        # Exact-duplicate guard: suppress identical (session, turn, version) triple.
        if pipeline_key in self._pipeline_inflight:
            print(
                f"[BGPipeline] Concurrent duplicate skipped (inflight) for "
                f"turn_id {turn_id} v{answer_version}"
            )
            await self._trace(
                session_id,
                "bgpipeline_skipped_duplicate",
                turn_id=turn_id,
                turn_number=turn_number,
                answer_version=answer_version,
                level="warn",
            )
            return
        # Revision-explosion guard: if any version of this turn is already running,
        # skip. The running pipeline will produce a stale-superseded result (discarded
        # at consumption) which is cheaper than running 14 concurrent LLM pipelines
        # for the same turn when STT fragments a single utterance.
        running_for_session = self._turn_pipeline_running.setdefault(session_id, set())
        if turn_id and turn_id in running_for_session:
            print(
                f"[BGPipeline] Revision skipped — turn_id {turn_id} already in flight "
                f"(v{answer_version} suppressed)"
            )
            await self._trace(
                session_id,
                "bgpipeline_skipped_revision_inflight",
                turn_id=turn_id,
                turn_number=turn_number,
                answer_version=answer_version,
                level="warn",
            )
            return
        self._pipeline_inflight.add(pipeline_key)
        if turn_id:
            running_for_session.add(turn_id)

        started_at = time.perf_counter()
        try:
            state = await self.session_manager.get_state(session_id)

            if state.get("interview_complete"):
                return

            existing_queue = state.get("prepped_turn_queue", [])
            if any(
                item.get("turn_id") == turn_id
                and _staged_answer_version(item) == answer_version
                for item in existing_queue
            ):
                print(
                    f"[BGPipeline] Skipping already-staged duplicate for "
                    f"turn_id {turn_id} v{answer_version} / {session_id}"
                )
                await self._trace(
                    session_id,
                    "bgpipeline_skipped_already_staged",
                    turn_id=turn_id,
                    turn_number=turn_number,
                    answer_version=answer_version,
                    level="warn",
                )
                return

            sprint = state.get("current_sprint", 1)
            persona = state.get("current_persona", "curious_lead")
            resume = state.get("resume", "")
            parsed_resume = state.get("parsed_resume", {})
            target_role = state.get("target_role", "")
            years_experience = state.get("years_experience", "")
            prior_weaknesses = state.get("weaknesses", [])
            candidate_model = state.get("candidate_model", {"project_map": {}, "established_facts": [], "probed_weaknesses": []})
            was_challenged = bool(prior_weaknesses and prior_weaknesses[-1].get("severity") == "high")
            history = [
                item
                for item in state.get("history", [])
                if item.get("turn_id") != turn_id
            ]

            # Memory context for agents — what's been established and probed so far
            established_facts = candidate_model.get("established_facts", [])
            probed_weaknesses_list = candidate_model.get("probed_weaknesses", [])
            memory_context = ""
            if established_facts:
                memory_context += "Already established as true:\n" + "\n".join(f"- {f}" for f in established_facts[-4:]) + "\n"
            if probed_weaknesses_list:
                memory_context += "Already probed (avoid repeating):\n" + "\n".join(f"- {p}" for p in probed_weaknesses_list[-4:]) + "\n"
            if history:
                prior_claims = [
                    f"- Q: {h.get('question', '')[:90]} | A: {h.get('answer', '')[:160]}"
                    for h in history[-3:]
                    if h.get("answer")
                ]
                if prior_claims:
                    memory_context += "Candidate claims from prior turns:\n" + "\n".join(prior_claims)

            # ── Parallel agent execution ──────────────────────────────────────
            async def _safe_weakness():
                weak_started = time.perf_counter()
                try:
                    result = await self.weakness_agent.detect(
                        last_question, text, sprint=sprint,
                        prior_weaknesses=prior_weaknesses,
                        memory_context=memory_context,
                        parsed_resume=parsed_resume,
                        target_role=target_role,
                        years_experience=years_experience,
                    )
                    return result, round((time.perf_counter() - weak_started) * 1000, 3)
                except Exception as e:
                    print(f"[BGPipeline] WeaknessAgent failed: {e}")
                    return _WEAKNESS_FALLBACK, round((time.perf_counter() - weak_started) * 1000, 3)

            async def _safe_discrepancy():
                disc_started = time.perf_counter()
                try:
                    result = await self.discrepancy_agent.check(resume, text, memory_context=memory_context)
                    return result, round((time.perf_counter() - disc_started) * 1000, 3)
                except Exception as e:
                    print(f"[BGPipeline] DiscrepancyAgent failed: {e}")
                    return _DISCREPANCY_FALLBACK, round((time.perf_counter() - disc_started) * 1000, 3)

            async def _safe_reasoning():
                reasoning_started = time.perf_counter()
                try:
                    result = await self.reasoning_agent.evaluate(text, was_challenged=was_challenged)
                    return result, round((time.perf_counter() - reasoning_started) * 1000, 3)
                except Exception as e:
                    print(f"[BGPipeline] ReasoningAgent failed: {e}")
                    return _REASONING_FALLBACK, round((time.perf_counter() - reasoning_started) * 1000, 3)

            if entities:
                (weakness, weakness_ms), (discrepancy, discrepancy_ms), (reasoning, reasoning_ms) = await asyncio.gather(
                    _safe_weakness(), _safe_discrepancy(), _safe_reasoning()
                )
                concepts = entities
                concepts_ms = 0.0
            else:
                async def _safe_concepts():
                    concept_started = time.perf_counter()
                    try:
                        result = await self.concept_agent.extract(text)
                        return result, round((time.perf_counter() - concept_started) * 1000, 3)
                    except Exception:
                        return [], round((time.perf_counter() - concept_started) * 1000, 3)
                (concepts_result, concepts_ms), ((weakness, weakness_ms), (discrepancy, discrepancy_ms), (reasoning, reasoning_ms)) = await asyncio.gather(
                    _safe_concepts(),
                    asyncio.gather(_safe_weakness(), _safe_discrepancy(), _safe_reasoning()),
                )
                concepts = concepts_result

            await self._trace(
                session_id,
                "bgpipeline_agents_complete",
                turn_id=turn_id,
                turn_number=turn_number,
                answer_version=answer_version,
                concepts_count=len(concepts or []),
                concepts_ms=concepts_ms,
                weakness_ms=weakness_ms,
                discrepancy_ms=discrepancy_ms,
                reasoning_ms=reasoning_ms,
            )

            # Per-answer scoring — fire and forget, never blocks anything
            asyncio.create_task(
                self._score_answer_async(
                    session_id,
                    last_question,
                    text,
                    target_role=target_role,
                    years_experience=years_experience,
                )
            )

            # ── Honest admission soft-cap ─────────────────────────────────────
            reasoning_adaptability = reasoning.get("adaptability", "") if isinstance(reasoning, dict) else ""
            honest_admission = reasoning_adaptability == "admitted_gap"
            if honest_admission and weakness.get("severity") == "high":
                weakness = {**weakness, "severity": "medium"}

            current_focus_key, current_focus_label = _infer_focus(
                last_question,
                text,
                parsed_resume,
                resume,
            )
            focus_prompt_pack = _build_focus_prompt_pack(
                state.get("interview_trajectory_map", {}),
                focus_key=current_focus_key,
                last_question=last_question,
                answer=text,
                history=history,
            )
            same_focus_history = [
                turn for turn in history
                if turn.get("focus_key") == current_focus_key
            ]
            same_focus_recent = sum(
                1 for turn in history[-3:]
                if turn.get("focus_key") == current_focus_key
            )
            same_focus_confirmed = sum(
                1
                for turn in same_focus_history
                if isinstance(turn.get("discrepancy"), dict)
                and turn["discrepancy"].get("conflict_level") == "confirmed"
            )
            same_focus_deflections = sum(
                1
                for turn in same_focus_history
                if isinstance(turn.get("weakness"), dict)
                and turn["weakness"].get("type") == "deflection"
            )
            substantive_recovery = _is_substantive_answer(text) and weakness.get("type") != "deflection"
            continuity_brief = _build_continuity_brief(
                history=history,
                candidate_model=candidate_model,
                current_question=last_question,
                current_answer=text,
                current_focus_label=current_focus_label,
            )
            overprobed_topics = _collect_overprobed_topics(history, current_focus_label=current_focus_label)

            # ── Breadth guard ────────────────────────────────────────────────
            # Prevent topic tunneling: if the last N turns all touched the same
            # resume claim / project, force a pivot — regardless of weakness type.
            # Uses topic focus keys from history, not weakness type repetition.
            weakness_type = weakness.get("type") if isinstance(weakness, dict) else None

            # ── Consecutive weakness guardrail ────────────────────────────────
            wtype = weakness_type
            if weakness and weakness.get("severity") == "high":
                if wtype == state.get("last_weakness_type"):
                    new_consecutive = state.get("consecutive_high_weakness_count", 0) + 1
                else:
                    new_consecutive = 1
            else:
                new_consecutive = 0
                wtype = None

            force_sprint_question = new_consecutive >= 3
            pivoting = force_sprint_question

            # ── Sprint 3 strategy remap ───────────────────────────────────────
            if sprint == 3 and weakness and weakness.get("attack_strategy") in ("implementation_probe", "step_by_step"):
                weakness = {**weakness, "attack_strategy": "scaling"}

            # ── Full priority chain → generates the next adversarial question ─
            discrepancy_conflict = (
                isinstance(discrepancy, dict)
                and discrepancy.get("conflict_level") == "confirmed"
                and discrepancy.get("severity") in ("medium", "high")
            )
            # same_focus_recent: how many of the last 3 turns shared this exact topic key
            # Threshold: 2 turns on same topic → already probed enough, move on
            # Exception: confirmed discrepancy on this topic is worth one extra press
            repeated_focus = (
                same_focus_recent >= 2
                and not discrepancy_conflict
                and isinstance(weakness, dict)
                and weakness.get("severity") == "high"
                and not substantive_recovery
            )
            contradiction_budget_exhausted = discrepancy_conflict and same_focus_confirmed >= 2 and not substantive_recovery
            deflection_budget_exhausted = weakness_type == "deflection" and same_focus_deflections >= 2
            if repeated_focus or contradiction_budget_exhausted or deflection_budget_exhausted:
                force_sprint_question = True
                pivoting = True
            # ambiguous_but_promising always demands clarification first — the type's semantics
            # require it regardless of what attack_strategy the LLM emitted.
            if isinstance(weakness, dict) and weakness.get("type") == "ambiguous_but_promising":
                weakness = {**weakness, "attack_strategy": "clarification",
                            "severity": weakness.get("severity") or "medium"}

            clarification_probe = (
                isinstance(weakness, dict)
                and weakness.get("attack_strategy") in ("clarification", "ownership_probe")
                and weakness.get("severity") in ("medium", "high")
            )
            aggressive_probe = (
                isinstance(weakness, dict)
                and weakness.get("severity") == "high"
                and weakness.get("attack_strategy") not in ("clarification", "ownership_probe")
            )
            resume_context = _build_resume_context_for_followup(parsed_resume, resume)
            seed_followups: list[str] = []
            route_kind = "sprint_seed"
            trajectory_hint = select_from_trajectory_map_detailed(
                state.get("interview_trajectory_map", {}),
                sprint=sprint,
                focus_key=current_focus_key,
                answer=text,
                entities=entities or [],
                history=history,
                admission=honest_admission,
                has_discrepancy=discrepancy_conflict,
            )

            if discrepancy_conflict and not force_sprint_question:
                next_question = await self.followup_agent.generate_discrepancy_challenge(
                    question=last_question, answer=text, discrepancy=discrepancy,
                    persona=persona, resume=resume, parsed_resume=parsed_resume,
                    focus_context=focus_prompt_pack.get("prompt_context", ""),
                    resume_snippets=focus_prompt_pack.get("resume_snippets", []),
                )
                route_kind = "discrepancy_challenge"

            elif clarification_probe and not force_sprint_question:
                next_question = await self.followup_agent.generate_clarification(
                    question=last_question,
                    answer=text,
                    weakness=weakness,
                    persona=persona,
                    resume=resume,
                    parsed_resume=parsed_resume,
                    focus_context=focus_prompt_pack.get("prompt_context", ""),
                    resume_snippets=focus_prompt_pack.get("resume_snippets", []),
                )
                route_kind = "clarification_fast"

            elif aggressive_probe and not force_sprint_question:
                next_question = await self.followup_agent.generate(
                    question=last_question, answer=text, weakness=weakness,
                    persona=persona, resume=resume, parsed_resume=parsed_resume,
                    focus_context=focus_prompt_pack.get("prompt_context", ""),
                    resume_snippets=focus_prompt_pack.get("resume_snippets", []),
                )
                route_kind = "attack_probe"

            elif state.get("current_question_followups") and not _is_generic_fasttrack_route(
                (state.get("active_question_packet") or {}).get("route_kind")
            ):
                # A bank follow-up is queued — adapt it for the next turn
                raw_followup = state["current_question_followups"][0]  # peek only, don't pop
                next_question = await self.followup_agent.adapt_followup(
                    raw_followup=raw_followup,
                    question=last_question,
                    answer=text,
                    persona=persona,
                    resume_context=resume_context,
                    focus_context=focus_prompt_pack.get("prompt_context", ""),
                    resume_snippets=focus_prompt_pack.get("resume_snippets", []),
                )
                route_kind = "bank_followup_fast"

            else:
                sprint_result = await self.followup_agent.generate_sprint_question(
                    sprint=sprint,
                    persona=persona,
                    resume=resume,
                    parsed_resume=parsed_resume,
                    history=history,
                    weakness=weakness,
                    transition_brief=continuity_brief,
                    avoid_topics=overprobed_topics,
                    focus_context=focus_prompt_pack.get("prompt_context", ""),
                    resume_snippets=focus_prompt_pack.get("resume_snippets", []),
                    trajectory_hint_question=(trajectory_hint or {}).get("question", ""),
                    pivoting_hint=pivoting,
                )
                next_question, seed_followups = sprint_result
                route_kind = "sprint_seed"

            await self._trace(
                session_id,
                "bgpipeline_route_selected",
                turn_id=turn_id,
                turn_number=turn_number,
                answer_version=answer_version,
                route_kind=route_kind,
                pivoting=bool(pivoting),
                force_sprint_question=bool(force_sprint_question),
                repeated_focus=bool(repeated_focus),
                contradiction_budget_exhausted=bool(contradiction_budget_exhausted),
                deflection_budget_exhausted=bool(deflection_budget_exhausted),
                same_focus_recent=same_focus_recent,
                same_focus_confirmed=same_focus_confirmed,
                same_focus_deflections=same_focus_deflections,
                weakness_type=weakness.get("type") if isinstance(weakness, dict) else None,
                weakness_severity=weakness.get("severity") if isinstance(weakness, dict) else None,
                discrepancy_conflict=discrepancy.get("conflict_level") if isinstance(discrepancy, dict) else None,
                followups_to_seed=len(seed_followups),
            )

            # ── Candidate model updates (no LLM call) ────────────────────────
            candidate_model_updates: dict[str, list] = {"established_facts": [], "probed_weaknesses": []}

            if isinstance(discrepancy, dict) and discrepancy.get("conflict_level") == "none" and discrepancy.get("description"):
                fact = discrepancy["description"][:120].rstrip(".") + f" (confirmed Turn {turn_number})"
                if fact not in candidate_model.get("established_facts", []):
                    candidate_model_updates["established_facts"].append(fact)

            if weakness and weakness.get("type") and weakness.get("weakness"):
                probe_note = f"{weakness['type']}: {weakness['weakness'][:80]} (Turn {turn_number})"
                candidate_model_updates["probed_weaknesses"].append(probe_note)

            # Follow-up sequencing metadata — passed to _apply_staged_analysis on next turn
            if route_kind == "bank_followup_fast":
                followups_to_store = list(state.get("current_question_followups", []))[1:3]
            elif route_kind == "sprint_seed":
                followups_to_store = seed_followups[:2] or _FALLBACK_FOLLOWUPS.get(sprint, [])[:2]
            else:
                followups_to_store = []

            # ── Write to staging fields only ──────────────────────────────────
            # Re-read state to pick up any handle_transcript changes since we started
            # (sprint advancement, question_count increment). This ensures our save
            # doesn't overwrite canonical counters with stale values.
            state = await self.session_manager.get_state(session_id)

            if state.get("interview_complete"):
                return  # Interview ended while we were processing — discard

            latest_turn_versions = dict(state.get("latest_turn_versions", {}))
            latest_known_version = _coerce_positive_int(
                latest_turn_versions.get(turn_id),
                default=answer_version,
            )
            if turn_id and answer_version < latest_known_version:
                print(
                    f"[BGPipeline] Discarding stale revision for turn_id {turn_id}: "
                    f"v{answer_version} < latest v{latest_known_version}"
                )
                await self._trace(
                    session_id,
                    "bgpipeline_discarded_stale_revision",
                    turn_id=turn_id,
                    turn_number=turn_number,
                    answer_version=answer_version,
                    latest_known_version=latest_known_version,
                    level="warn",
                )
                return

            queue = [
                item
                for item in state.get("prepped_turn_queue", [])
                if not (
                    item.get("turn_id") == turn_id
                    and _staged_answer_version(item) <= answer_version
                )
            ]
            queue.append({
                "turn_id": turn_id,
                "turn_number": turn_number,
                "answer_version": answer_version,
                "analysis": {
                    "session_id": session_id,
                    "turn_id": turn_id,
                    "turn_number": turn_number,
                    "answer_version": answer_version,
                    "question": last_question,
                    "answer": text,
                    "weakness": weakness,
                    "concepts": concepts,
                    "discrepancy": discrepancy,
                    "reasoning_behavior": reasoning,
                    "sprint": sprint,
                    "persona": persona,
                    "focus_key": current_focus_key,
                    "focus_label": current_focus_label,
                    "candidate_model_updates": candidate_model_updates,
                },
                "metadata": {
                    "pivoting": pivoting,
                    "route_kind": route_kind,
                    "consecutive_high_weakness_count": new_consecutive,
                    "last_weakness_type": wtype,
                    "current_question_followups": followups_to_store,
                    "current_question_followup_asked": False,
                    "answer_version": answer_version,
                },
            })
            state["prepped_turn_queue"] = queue

            if turn_number >= state.get("prepped_next_question_turn_number", 0):
                state["prepped_next_question"] = next_question
                state["prepped_next_question_turn_number"] = turn_number
                state["prepped_next_context"] = {
                    "pivoting": pivoting,
                    "route_kind": route_kind,
                    "weakness": weakness,
                    "discrepancy": discrepancy,
                    "turn_id": turn_id,
                    "answer_version": answer_version,
                }
                state["prepped_next_packet"] = _build_question_packet(
                    question_text=next_question,
                    sprint=sprint,
                    route_kind=route_kind,
                    parsed_resume=parsed_resume,
                    resume=resume,
                    followups=followups_to_store,
                    pivoting=pivoting,
                    weakness=weakness,
                    discrepancy=discrepancy,
                    source_turn_number=turn_number,
                )
            state["prepped_turn_analysis"] = {
                "session_id": session_id,
                "turn_id": turn_id,
                "turn_number": turn_number,
                "answer_version": answer_version,
                "question": last_question,
                "answer": text,
                "weakness": weakness,
                "concepts": concepts,
                "discrepancy": discrepancy,
                "reasoning_behavior": reasoning,
                "sprint": sprint,
                "persona": persona,
                "candidate_model_updates": candidate_model_updates,
            }
            state["prepped_next_metadata"] = {
                "pivoting": pivoting,
                "route_kind": route_kind,
                "consecutive_high_weakness_count": new_consecutive,
                "last_weakness_type": wtype,
                "current_question_followups": followups_to_store,
                "current_question_followup_asked": False,
                "answer_version": answer_version,
            }

            await self.session_manager.save_state(session_id, state)
            elapsed_ms = round((time.perf_counter() - started_at) * 1000)
            print(f"[BGPipeline] Turn {turn_number} complete — {route_kind} staged in {elapsed_ms}ms for {session_id}")
            await self._trace(
                session_id,
                "bgpipeline_staged",
                turn_id=turn_id,
                turn_number=turn_number,
                answer_version=answer_version,
                route_kind=route_kind,
                followups_staged=len(followups_to_store),
                prepped_question_chars=len(next_question),
                elapsed_ms=round((time.perf_counter() - started_at) * 1000, 3),
            )

            # Pre-generate TTS audio for the staged question so the /tts call
            # on the next turn hits cache instead of waiting for live synthesis.
            if self.tts_service:
                await self._trace(
                    session_id,
                    "bgpipeline_tts_pregen_dispatched",
                    turn_id=turn_id,
                    turn_number=turn_number,
                    answer_version=answer_version,
                    route_kind=route_kind,
                )
                asyncio.create_task(self.tts_service.pre_generate(session_id, next_question))

        except Exception as e:
            # Non-fatal: next turn gracefully falls back to bank follow-up or sprint fallback
            print(f"[BGPipeline] Failed for session {session_id}: {e}")
            await self._trace(
                session_id,
                "bgpipeline_failed",
                turn_id=turn_id,
                turn_number=turn_number,
                answer_version=answer_version,
                level="error",
                error_type=type(e).__name__,
                error=str(e)[:300],
                elapsed_ms=round((time.perf_counter() - started_at) * 1000, 3),
            )
        finally:
            # Always release the inflight slot so exact-version retries can rerun if needed.
            self._pipeline_inflight.discard(pipeline_key)
            # Release turn-level guard so the next distinct turn can run.
            self._turn_pipeline_running.get(session_id, set()).discard(turn_id)

    # ─────────────────────────────────────────────
    # SPECULATIVE + SEEDING
    # ─────────────────────────────────────────────

    async def _seed_first_question(self, session_id: str) -> None:
        """
        Fires once as asyncio.create_task at session start.
        Generates a resume-grounded first follow-up via Haiku and stores it as
        prepped_next_question — so Turn 1's fast path never hits the generic fallback.

        Completes in ~300ms, well within the sprint opener TTS + candidate answer time (~10-30s).
        """
        started_at = time.perf_counter()
        try:
            state = await self.session_manager.get_state(session_id)
            resume_context = _build_resume_context_for_followup(
                state.get("parsed_resume"), state.get("resume", "")
            )
            rag_candidates = question_bank.retrieve(resume_context[:400], sprint=1, top_k=1)
            seed_followups = []
            if rag_candidates:
                seed_followups = rag_candidates[0].get("followups", [])
            question = await self.followup_agent.generate_seed_question(
                sprint=1,
                persona="curious_lead",
                resume_context=resume_context,
            )
            # Re-read before saving — don't overwrite any parallel changes
            state = await self.session_manager.get_state(session_id)
            if (
                state.get("interview_complete")
                or state.get("prepped_next_question")
                or state.get("question_count", 0) > 0
                or state.get("current_sprint", 1) != 1
                or state.get("last_question") != SPRINT_OPENERS[1]
            ):
                return
            state["prepped_next_question"] = question
            state["prepped_next_question_turn_number"] = 0
            state["prepped_next_context"] = {
                "pivoting": False,
                "route_kind": "sprint_seed",
                "weakness": None,
                "discrepancy": None,
                "turn_id": "",
            }
            state["prepped_next_packet"] = _build_question_packet(
                question_text=question,
                sprint=1,
                route_kind="sprint_seed",
                parsed_resume=state.get("parsed_resume"),
                resume=state.get("resume", ""),
                followups=seed_followups[:2],
                source_turn_number=0,
            )
            await self.session_manager.save_state(session_id, state)
            print(f"[Seed] Turn 1 follow-up pre-seeded for {session_id}")
            await self._trace(
                session_id,
                "seed_first_question_ready",
                route_kind="sprint_seed",
                question_chars=len(question),
                followups_seeded=len(seed_followups[:2]),
                elapsed_ms=round((time.perf_counter() - started_at) * 1000, 3),
            )
        except Exception as e:
            print(f"[Seed] Failed to pre-seed first question: {e}")
            await self._trace(
                session_id,
                "seed_first_question_failed",
                level="warn",
                error_type=type(e).__name__,
                error=str(e)[:300],
                elapsed_ms=round((time.perf_counter() - started_at) * 1000, 3),
            )

    async def _build_interview_map(self, session_id: str) -> bool:
        """
        Runs once at session start as an asyncio.create_task.
        Generates the resume-grounded trajectory map (Haiku, ~400ms) and stores it
        in session state.  Completes well before the candidate finishes answering
        the opening question.  Purely additive — never overwrites canonical state.
        """
        started_at = time.perf_counter()
        try:
            state = await self.session_manager.get_state(session_id)
            # Don't overwrite if somehow already set (race with a restart)
            if state.get("interview_trajectory_map"):
                return True
            interview_map = await generate_interview_map(
                resume=state.get("resume", ""),
                session_id=session_id,
            )
            if not interview_map:
                await self._trace(session_id, "interview_map_empty", level="warn",
                                  elapsed_ms=round((time.perf_counter() - started_at) * 1000, 3))
                return False
            # Re-read state before saving to avoid trampling concurrent writes
            state = await self.session_manager.get_state(session_id)
            if state.get("interview_complete"):
                return False
            state["interview_trajectory_map"] = interview_map
            await self.session_manager.save_state(session_id, state)
            focus_count = len(interview_map.get("focus_areas", []))
            preview = [
                {
                    "label": str(area.get("label", "") or ""),
                    "focus_key": str(area.get("focus_key", "") or ""),
                    "sprint_1_if_vague": str(((area.get("sprint_1") or {}).get("if_vague", "")) or ""),
                }
                for area in interview_map.get("focus_areas", [])[:3]
            ]
            await self._trace(
                session_id,
                "interview_map_ready",
                focus_areas=focus_count,
                focus_preview=preview,
                elapsed_ms=round((time.perf_counter() - started_at) * 1000, 3),
            )
            return focus_count > 0
        except Exception as e:
            print(f"[TrajectoryMap] Build failed for {session_id[:8]}: {e}")
            await self._trace(session_id, "interview_map_failed", level="warn",
                              error=str(e)[:200],
                              elapsed_ms=round((time.perf_counter() - started_at) * 1000, 3))
            raise

    async def _run_speculative_generation(
        self,
        session_id: str,
        partial_text: str,
        new_entities: set,
        admission: bool = False,
        turn_id: str = "",
        is_final: bool = True,
        snapshot_seq: int = 0,
    ) -> None:
        """
        Event-driven speculative question generation on partial transcripts.
        Haiku only. Writes ONLY to speculative_cache — never canonical state.

        Versioned: only the newest job can write. Stale jobs from slower LLM
        calls are silently dropped. Sprint-tagged: discarded if sprint advances
        before the job completes.

        Throttled: min 1s between calls to prevent entity-churn thrash.
        """
        try:
            if not turn_id:
                return

            lock = self._speculative_locks.setdefault(session_id, asyncio.Lock())
            async with lock:
                state = await self.session_manager.get_state(session_id)
                if state.get("interview_complete"):
                    return

                sprint = state.get("current_sprint", 1)
                persona = state.get("current_persona", "curious_lead")
                resume_context = _build_resume_context_for_followup(
                    state.get("parsed_resume"), state.get("resume", "")
                )
                focus_key, _ = _infer_focus(
                    state.get("last_question", ""),
                    partial_text,
                    state.get("parsed_resume"),
                    state.get("resume", ""),
                )
                focus_prompt_pack = _build_focus_prompt_pack(
                    state.get("interview_trajectory_map", {}),
                    focus_key=focus_key,
                    last_question=state.get("last_question", ""),
                    answer=partial_text,
                    history=state.get("history", []),
                )
                map_candidate = select_from_trajectory_map_detailed(
                    state.get("interview_trajectory_map", {}),
                    sprint=sprint,
                    focus_key=focus_key,
                    answer=partial_text,
                    entities=list(new_entities),
                    history=state.get("history", []),
                    admission=admission,
                    has_discrepancy=False,
                    branch_hint="if_honest_gap" if admission else "",
                )
                cache = state.get("speculative_cache", {})
                now = time.time()
                current_best_question = ""

                if cache.get("turn_id") and cache.get("turn_id") != turn_id:
                    cache = {}
                else:
                    current_best_question = str(cache.get("best_ready_question", "") or "").strip()

                if cache.get("inflight") and cache.get("turn_id") == turn_id:
                    return

                if now - cache.get("last_trigger_time", 0.0) < 1.0:
                    return

                version = cache.get("speculation_version", 0) + 1
                state["speculative_cache"] = {
                    **cache,
                    "turn_id": turn_id,
                    "sprint": sprint,
                    "speculation_version": version,
                    "last_trigger_time": now,
                    "last_snapshot_seq": snapshot_seq,
                    "last_snapshot_is_final": is_final,
                    "inflight": True,
                }
                await self.session_manager.save_state(session_id, state)

            question = await self.followup_agent.generate_speculative(
                partial_text=partial_text,
                new_entities=list(new_entities),
                last_question=state.get("last_question", ""),
                persona=persona,
                sprint=sprint,
                resume_context=resume_context,
                admission=admission,
                current_best_question=current_best_question,
                focus_context=focus_prompt_pack.get("prompt_context", ""),
                resume_snippets=focus_prompt_pack.get("resume_snippets", []),
                current_map_candidate=(map_candidate or {}).get("question", ""),
            )

            # Re-read under the same session lock — only write if still the same active answer turn
            async with lock:
                state = await self.session_manager.get_state(session_id)
                if state.get("interview_complete"):
                    return
                cache = state.get("speculative_cache", {})
                if state.get("current_sprint", 1) != sprint:
                    return  # Sprint advanced while we were generating — discard
                if cache.get("turn_id") != turn_id:
                    return
                if cache.get("speculation_version") != version:
                    return
                if not cache.get("inflight"):
                    return

                resolved_question = str(question.get("question", "") or "").strip()
                if question.get("action") == "keep" and cache.get("best_ready_question"):
                    resolved_question = str(cache.get("best_ready_question", "") or "").strip()

                state["speculative_cache"] = {
                    **cache,
                    "best_ready_question": resolved_question or str(cache.get("best_ready_question", "") or ""),
                    "last_snapshot_seq": snapshot_seq,
                    "last_snapshot_is_final": is_final,
                    "last_refine_action": question.get("action", "replace"),
                    "inflight": False,
                }
                await self.session_manager.save_state(session_id, state)
            trigger = "admission" if admission else f"entities: {new_entities}"
            if not new_entities and not admission:
                trigger = "rolling_interim" if not is_final else "final_snapshot"
            print(
                f"[Speculative] v{version} staged ({trigger}, action={question.get('action', 'replace')}) "
                f"for {session_id}"
            )

        except Exception as e:
            print(f"[Speculative] Failed for {session_id}: {e}")

    # ─────────────────────────────────────────────
    # SPRINT LOGIC
    # ─────────────────────────────────────────────

    async def _maybe_advance_sprint(
        self,
        state: dict,
        answered_question: str = "",
        current_answer: str = "",
    ) -> tuple[bool, str]:
        """
        Advance sprint if current one is exhausted. Mutates state in place.

        Sprint openers are generated dynamically — Haiku call (~300ms) with the last
        sprint's history + resume context. Falls back to static SPRINT_OPENERS if the
        LLM call fails.
        """
        if state["sprint_question_count"] < QUESTIONS_PER_SPRINT:
            return False, ""

        next_sprint = state["current_sprint"] + 1
        if next_sprint > 3:
            return False, ""

        prior_sprint = state["current_sprint"]
        next_persona = SPRINTS[next_sprint]["persona"]

        state["current_sprint"] = next_sprint
        state["current_persona"] = next_persona
        state["sprint_name"] = SPRINTS[next_sprint]["name"]
        state["sprint_question_count"] = 0
        state["consecutive_high_weakness_count"] = 0
        state["last_weakness_type"] = None
        state["current_question_followups"] = []
        state["current_question_followup_asked"] = False

        # Pull the turns from the sprint we're leaving — used as context for the opener.
        # The current turn's analysis is still in the background pipeline (not yet in history),
        # so we synthesize a partial record for it using what we do have: the last question
        # asked and the candidate's current answer.
        history = state.get("history", [])
        prior_sprint_history = [h for h in history if h.get("sprint") == prior_sprint]
        if current_answer and answered_question:
            answered_focus_key, answered_focus_label = _infer_focus(
                answered_question,
                current_answer,
                state.get("parsed_resume"),
                state.get("resume", ""),
            )
            prior_sprint_history = prior_sprint_history + [{
                "question": answered_question,
                "answer": current_answer,
                "sprint": prior_sprint,
                "focus_key": answered_focus_key,
                "focus_label": answered_focus_label,
            }]

        continuity_brief = _build_continuity_brief(
            history=prior_sprint_history,
            candidate_model=state.get("candidate_model", {}),
            current_question=answered_question,
            current_answer=current_answer,
        )
        avoid_topics = _collect_overprobed_topics(prior_sprint_history)
        opener_focus_pack = _build_focus_prompt_pack(
            state.get("interview_trajectory_map", {}),
            focus_key=answered_focus_key if current_answer and answered_question else "",
            last_question=answered_question,
            answer=current_answer,
            history=prior_sprint_history,
        )

        try:
            opener = await self.followup_agent.generate_sprint_opener(
                sprint=next_sprint,
                persona=next_persona,
                resume=state.get("resume", ""),
                parsed_resume=state.get("parsed_resume"),
                prior_sprint_history=prior_sprint_history,
                transition_brief=continuity_brief,
                avoid_topics=avoid_topics,
                focus_context=opener_focus_pack.get("prompt_context", ""),
                resume_snippets=opener_focus_pack.get("resume_snippets", []),
            )
        except Exception as e:
            print(f"[SprintOpener] LLM failed for sprint {next_sprint}, using context fallback: {e}")
            # Build a context-aware fallback from the last substantive thread instead of
            # using a generic static template.
            opener = _build_sprint_fallback_opener(next_sprint, prior_sprint_history, state.get("parsed_resume"))

        state["last_question"] = opener
        return True, opener

    def _is_complete(self, state: dict) -> bool:
        """Interview ends when sprint 3 is exhausted, 30 minutes elapsed, or terminal admission."""
        if state["current_sprint"] == 3 and state["sprint_question_count"] >= QUESTIONS_PER_SPRINT:
            return True
        elapsed_minutes = (time.time() - state["interview_start_time"]) / 60
        if elapsed_minutes >= MAX_INTERVIEW_MINUTES:
            return True
        # Terminal admission: 2+ consecutive turns where candidate explicitly admitted they
        # cannot answer (admitted_gap with structure_score == 0). Continuing past this point
        # produces a degraded experience — evaluation already has enough signal.
        history = state.get("history", [])
        if len(history) >= 2:
            last_two = history[-2:]
            if all(
                isinstance(h.get("reasoning_behavior"), dict)
                and h["reasoning_behavior"].get("adaptability") == "admitted_gap"
                and h["reasoning_behavior"].get("structure_score", 5) <= 1
                for h in last_two
            ):
                print(f"[Complete] Terminal admission detected after {len(history)} turns — ending interview")
                return True
        return False

    async def get_session_state(self, session_id: str) -> dict:
        return await self.session_manager.get_state(session_id)
