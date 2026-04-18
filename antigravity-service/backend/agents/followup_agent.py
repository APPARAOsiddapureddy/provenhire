import json
import re
from backend.models.llm_router import LLMRouter
from backend.rag import question_bank


def _extract_question_from_serialized_payload(text: str) -> str | None:
    stripped = text.strip()
    if not stripped or stripped[0] not in "[{":
        return None

    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError:
        return None

    def _extract_candidate(value: object) -> str | None:
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, dict):
            for key in ("question", "followup", "response", "text"):
                candidate = value.get(key)
                if isinstance(candidate, str) and candidate.strip():
                    return candidate.strip()
        return None

    if isinstance(payload, dict):
        return _extract_candidate(payload)

    if isinstance(payload, list):
        for item in payload:
            candidate = _extract_candidate(item)
            if candidate:
                return candidate

    return None


def _clean_question_output(text: str) -> str:
    """
    Strip LLM meta-commentary that leaks into question output.

    The LLM sometimes ignores "Output only the question" and prepends reasoning like:
      "I notice the candidate's response was fragmented. Here's my follow-up: ..."
      "I can't adapt this because... **My recommendation:** Pause here..."
      "Note: Based on the answer above, here is the question: ..."

    This function extracts just the actual question, stripping everything else.
    Applied to every question string before it leaves the agent layer.
    """
    if not isinstance(text, str):
        text = str(text)
    text = text.strip()

    payload_question = _extract_question_from_serialized_payload(text)
    if payload_question:
        text = payload_question

    # ── Step 1: Extract from common "intro: [question]" delimiter patterns ─────
    delimiter_patterns = [
        r"(?i)here(?:'s| is) (?:my |the |an )?(?:adapted |follow-up |follow up |next )?question\s*[:\-–]\s*",
        r"(?i)follow-up\s*(?:question)?\s*[:\-–]\s*",
        r"(?i)my (?:recommendation|suggestion)\s*[:\-–]\s*",
        r"(?i)adapted question\s*[:\-–]\s*",
        r"(?i)note\s*[:\-–]\s*",
        r"(?i)\*\*(?:question|follow-up|my recommendation)\*\*\s*[:\-–]?\s*",
    ]
    for pattern in delimiter_patterns:
        parts = re.split(pattern, text, maxsplit=1)
        if len(parts) == 2 and parts[1].strip():
            text = parts[1].strip()
            break

    # ── Step 2: Strip leading meta-commentary sentences ─────────────────────────
    # Match leading sentences that are clearly internal reasoning, not a question
    meta_sentence_patterns = [
        r"^I (?:notice|see|can't|cannot|was unable|couldn't|understand|note)\b[^?]*?[.!]\s*",
        r"^(?:Based on|Given|Since|Because|Note that|Please note)[^?]*?[.!]\s*",
        r"^The candidate[^?]*?[.!]\s*",
        r"^\*\*[^*]+\*\*\s*",  # **bold header** at start
    ]
    for _ in range(5):  # max 5 leading meta sentences to strip
        stripped = False
        for pattern in meta_sentence_patterns:
            m = re.match(pattern, text, flags=re.IGNORECASE | re.DOTALL)
            if m and len(text) - m.end() > 10:  # don't strip if nothing would remain
                text = text[m.end():].strip()
                stripped = True
                break
        if not stripped:
            break

    # ── Step 3: If text has a quoted question, extract it ───────────────────────
    quoted = re.search(r'"([^"]{10,}[?])"', text)
    if quoted:
        text = quoted.group(1).strip()

    # ── Step 4: Take only the first question sentence if multiple remain ─────────
    # Split on sentence boundaries, pick the first one ending in "?"
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    for sentence in sentences:
        if sentence.strip().endswith("?") and len(sentence.strip()) > 15:
            text = sentence.strip()
            break

    # ── Step 5: Strip residual markdown formatting ───────────────────────────────
    text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)   # **bold**
    text = re.sub(r'\*([^*]+)\*', r'\1', text)         # *italic*
    text = re.sub(r'__([^_]+)__', r'\1', text)          # __underline__

    return text.strip('"').strip()


def _is_viable_question_output(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False
    if stripped.startswith("{") or stripped.startswith("["):
        return False
    if not re.search(r"[A-Za-z]", stripped):
        return False
    if len(stripped) < 12 or len(stripped.split()) < 3:
        return False
    if re.fullmatch(r"(?i)(question|follow-up|follow up|recommendation|note)\s*[:\-–]?", stripped):
        return False
    if stripped.endswith(":") and "?" not in stripped:
        return False
    return True


def _finalize_question_output(text: str, fallback: str) -> str:
    cleaned = _clean_question_output(text)
    if _is_viable_question_output(cleaned):
        return cleaned

    fallback_cleaned = _clean_question_output(fallback)
    if _is_viable_question_output(fallback_cleaned):
        return fallback_cleaned
    return fallback.strip()


def _normalize_speculative_decision(
    result: dict | str,
    fallback: str,
    current_best_question: str = "",
    current_map_candidate: str = "",
) -> dict:
    """
    Normalize speculative generation into:
      {"action": "keep" | "replace", "question": str}

    If an existing speculative candidate is already good enough, the model may
    return a keep signal. Otherwise we finalize the replacement question safely.
    """
    existing = current_best_question.strip()
    map_candidate = current_map_candidate.strip()

    if isinstance(result, dict):
        action = str(result.get("action", "")).strip().lower()
        raw_question = (
            result.get("question")
            or result.get("followup")
            or result.get("response")
            or result.get("text")
            or ""
        )
        if action == "keep" and existing:
            return {"action": "keep", "question": existing}
        if action in {"use_map", "use_map_candidate", "promote_map"} and map_candidate:
            return {"action": "replace", "question": map_candidate}
        finalized = _finalize_question_output(str(raw_question), fallback)
        return {"action": "replace", "question": finalized}

    if isinstance(result, str):
        stripped = result.strip()
        if existing and re.fullmatch(r"(?i)keep(?:\s+current)?", stripped):
            return {"action": "keep", "question": existing}
        if map_candidate and re.fullmatch(r"(?i)(use[_ ]?map(?:[_ ]?candidate)?|promote[_ ]?map)", stripped):
            return {"action": "replace", "question": map_candidate}
        finalized = _finalize_question_output(stripped, fallback)
        return {"action": "replace", "question": finalized}

    if existing:
        return {"action": "keep", "question": existing}
    return {"action": "replace", "question": _finalize_question_output(fallback, fallback)}


def _join_focus_context(
    focus_context: str = "",
    resume_snippets: list[str] | None = None,
) -> str:
    lines: list[str] = []
    if focus_context.strip():
        lines.append(focus_context.strip())
    cleaned_snippets = [snippet.strip() for snippet in (resume_snippets or []) if snippet and snippet.strip()]
    if cleaned_snippets:
        if lines:
            lines.append("Additional exact resume snippets:")
        else:
            lines.append("Exact resume snippets:")
        lines.extend(f"- {snippet}" for snippet in cleaned_snippets[:3])
    return "\n".join(lines).strip()


def _fallback_for_strategy(attack_strategy: str) -> str:
    return {
        "clarification": "What exactly was the mechanism you used there?",
        "ownership_probe": "Which part of that did you personally implement or decide yourself?",
        "implementation_probe": "Walk me through the exact implementation path you took there.",
        "step_by_step": "Walk me through exactly how that worked, step by step.",
        "contradiction": "Earlier you described that differently. How do those two accounts fit together?",
        "edge_case": "What happens in the first edge case where that approach starts to break?",
        "scaling": "If that needed to handle 10x the load, what would break first?",
    }.get(attack_strategy, "Can you walk me through that in more concrete detail?")


def _fallback_sprint_question(sprint: int) -> str:
    return {
        1: "What was the most consequential implementation decision you made in that project?",
        2: "What concept underneath that work did you have to understand most deeply?",
        3: "If that system had to handle 10x the demand, what would you redesign first?",
    }.get(sprint, "Can you walk me through the most important trade-off in that work?")


def _fallback_sprint_opener(sprint: int) -> str:
    return {
        2: "We just talked through your project. What technical concept underneath it mattered most to understand?",
        3: "Staying with the system you just described, what would become the first real scaling or reliability bottleneck?",
    }.get(sprint, _fallback_sprint_question(sprint))


def _fallback_discrepancy_question() -> str:
    return "Earlier you described that differently. Can you reconcile the difference for me?"


# ─────────────────────────────────────────────
# PERSONA SYSTEM PROMPTS
# ─────────────────────────────────────────────

PERSONA_PROMPTS = {
    "curious_lead": """You are a Curious Lead interviewer — a genuinely interested engineer who wants to understand the candidate's work deeply.

Your style:
- Start broad: understand the problem space before asking about implementation.
- Ask "why did you make that choice?" — you're curious, not accusatory.
- Explore ownership naturally: "What parts did you personally design?" — not as a gotcha, but to understand their contribution.
- When something breaks or went wrong, treat it as an interesting learning moment.
- NEW RULE: If the candidate admits a gap or self-corrects, immediately pivot to curious exploration of the new area they just provided. Reward their honesty by moving on.
- Invite them to go deeper: "That's interesting — can you walk me through that decision in more detail?"

Rules:
- ONE question only. Conversational and specific to what they just said.
- Build on their answer — reference what they told you.
- Do NOT ask yes/no questions.
- Do NOT be confrontational or dismissive.
- If a gap has already been probed once, pivot — ask what they DO know rather than repeating the same probe rephrased.""",

    "socratic_mentor": """You are a Socratic Mentor interviewer — a thoughtful teacher who helps candidates reveal what they actually understand.

Your style:
- When they use a term, ask them to explain it in plain language.
- When they give a high-level answer, invite depth: "Walk me through how that actually works under the hood."
- When they're stuck, guide them to think out loud: "What do you know about the building blocks here?"
- Acknowledge good reasoning before pushing further.
- NEW RULE: If the candidate shows self-awareness about a gap, treat it as a success. Help them reason through what they DO know instead of dwelling on the gap.

Rules:
- ONE question only. Clear and focused on one concept at a time.
- Do NOT make the candidate feel stupid — your goal is to find the edges of their knowledge, not embarrass them.
- Do NOT ask questions that require memorized facts — ask for reasoning.
- Once you've established a knowledge boundary on one concept, move to a different concept — don't ask the same thing six different ways.""",

    "senior_peer": """You are a Senior Peer interviewer — an experienced engineer thinking through a real design problem together with the candidate.

Your style:
- Treat it as a collaborative design session: "How would you approach X?"
- Introduce realistic constraints: "Given that the team is small and the timeline is tight, what would you prioritize?"
- Explore trade-offs: "What are the downsides of that approach? What would you give up?"
- Scale the conversation naturally: "If this needed to handle 10x the load, what's the first thing you'd change?"
- Acknowledge good trade-off thinking: "That's a reasonable trade-off — what made you lean that way?"

Rules:
- ONE question only. Grounded in a realistic engineering scenario.
- Treat the candidate as a peer, not a subordinate.
- Do NOT inject artificial chaos or failures just to stress them — only if it's genuinely relevant.""",
}

# ─────────────────────────────────────────────
# ATTACK STRATEGY INSTRUCTIONS
# These turn the abstract strategy name into a concrete question-generation directive.
# WeaknessAgent selects the strategy; this map tells the LLM how to execute it.
# ─────────────────────────────────────────────

ATTACK_STRATEGY_INSTRUCTIONS = {
    "clarification": (
        "Their answer may contain something real, but it is still ambiguous. "
        "Ask one exploratory clarification question that establishes mechanism, scope, or ownership before escalating."
    ),
    "implementation_probe": (
        "Ask them to walk through the actual implementation step-by-step. "
        "They were vague — push for the specific mechanism, not the concept."
    ),
    "ownership_probe": (
        "Pin down their personal contribution versus team contribution. "
        "Ask exactly what they themselves wrote, designed, or changed."
    ),
    "step_by_step": (
        "Their answer lacked structure. Ask them to reason through it explicitly: "
        "\"Walk me through exactly how you'd approach this, step by step.\""
    ),
    "contradiction": (
        "Their claim contradicts something — surface it directly but without accusation. "
        "\"Earlier you said X... but that would mean Y. How do you reconcile that?\""
    ),
    "edge_case": (
        "Their approach breaks under a specific scenario. Introduce that scenario: "
        "\"What happens when [X edge case]? Does your approach still hold?\""
    ),
    "scaling": (
        "Their answer works at small scale but falls apart under load. "
        "Push the scale: \"This works for N users — what's the first thing that breaks at 100x?\""
    ),
}

SPRINT_GOALS = {
    1: "Build a clear picture of the candidate's most significant project — the problem it solved, why they built it this way, what they personally contributed, and what challenges they faced. Start broad, then go deeper on the details that matter.",
    2: "Explore the candidate's conceptual understanding of the technical ideas underlying their work — not trivia, but genuine reasoning about how things work and why.",
    3: "Think through real engineering trade-offs together — scaling decisions, failure modes, design alternatives. Treat it as a collaborative discussion, not an interrogation.",
}


def _build_resume_context(parsed_resume: dict | None, resume: str) -> str:
    """Build a rich, structured resume context string for LLM prompts."""
    if not parsed_resume:
        return resume[:2000]
    projects = parsed_resume.get("projects", [])
    skills = parsed_resume.get("skills", [])
    claims = parsed_resume.get("claims", [])
    tools = parsed_resume.get("tools", [])
    experience = parsed_resume.get("experience", {})
    experiences = parsed_resume.get("experiences", [])
    experience_tier = parsed_resume.get("experience_tier", "")

    def _claim_text(claim: object) -> str:
        if isinstance(claim, str):
            return claim
        if isinstance(claim, dict):
            parts = [claim.get("text", "")]
            if claim.get("project"):
                parts.append(f"(project: {claim['project']})")
            meta = [claim.get("strength"), claim.get("contribution_type")]
            meta = [m for m in meta if m]
            if meta:
                parts.append(f"[{' / '.join(meta)}]")
            return " ".join(p for p in parts if p)
        return str(claim)

    ctx = f"Skills: {', '.join(skills[:15])}\n"
    ctx += f"Tools: {', '.join(tools[:10])}\n"
    if experience:
        ctx += f"Experience: {experience}\n"
    if experience_tier:
        ctx += f"Experience tier: {experience_tier}\n"
    if experiences:
        ctx += "Roles:\n" + "\n".join(
            f"  - {e.get('title', '')} @ {e.get('company', '')} ({e.get('duration', '')}) [{e.get('contribution_type', 'contributed')}]"
            for e in experiences[:4]
        ) + "\n"
    if projects:
        ctx += "Projects:\n" + "\n".join(
            f"  - {p.get('name', '')}: {p.get('description', '')} [{', '.join(p.get('technologies', [])[:5])}]"
            f" ownership={p.get('ownership_level', 'unknown')} contribution={p.get('contribution_type', 'contributed')}"
            for p in projects[:5]
        ) + "\n"
    if claims:
        ctx += "Key claims: " + "; ".join(_claim_text(c) for c in claims[:6])
    return ctx


class FollowUpAgent:
    """
    Generates the next interview question based on:
    - Detected weakness with specific attack strategy (targeted probe)
    - Resume discrepancy (direct confrontation challenge)
    - Sprint goal + persona (fresh question for normal progression)
    - Speculative prefetch from partial transcript (latency masking)

    All methods are context-aware: they use resume, history, sprint, and persona.
    """

    def __init__(self):
        self.llm = LLMRouter(tier="medium")
        self.llm_fast = LLMRouter(tier="small")  # Haiku — speculative + seed generation

    async def generate(
        self,
        question: str,
        answer: str,
        weakness: dict,
        persona: str,
        resume: str,
        parsed_resume: dict | None = None,
        focus_context: str = "",
        resume_snippets: list[str] | None = None,
    ) -> str:
        """
        High-severity weakness detected → generate a targeted probe.
        Uses the weakness type's specific attack strategy to drive the question.
        """
        system = PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS["curious_lead"])
        resume_context = _build_resume_context(parsed_resume, resume)
        focus_context_block = _join_focus_context(focus_context, resume_snippets)

        attack_strategy = weakness.get("attack_strategy", "step_by_step")
        strategy_instruction = ATTACK_STRATEGY_INSTRUCTIONS.get(
            attack_strategy,
            ATTACK_STRATEGY_INSTRUCTIONS["step_by_step"]
        )

        user = f"""Candidate background:
{resume_context}

Current focus context:
{focus_context_block or "Use the exact project or claim under discussion."}

Previous question: {question}

Candidate's answer: {answer}

Weakness detected:
- Type: {weakness.get('type', 'unknown')}
- Gap: {weakness.get('weakness', '')}
- Attack strategy: {attack_strategy}
- How to execute it: {strategy_instruction}

Generate ONE follow-up question that executes this attack strategy.
Ground it in something specific from their resume or answer.
If you are staying on the same project, explicitly signal continuity in the wording.
Output only the question."""

        result = await self.llm.call(system=system, user=user)
        raw = result if isinstance(result, str) else result.get("followup", str(result))
        return _finalize_question_output(raw, _fallback_for_strategy(attack_strategy))

    async def generate_clarification(
        self,
        question: str,
        answer: str,
        weakness: dict,
        persona: str,
        resume: str,
        parsed_resume: dict | None = None,
        focus_context: str = "",
        resume_snippets: list[str] | None = None,
    ) -> str:
        """
        Fast, directed clarification path for ambiguity / ownership uncertainty.
        This is intentionally lighter than generate(): it should establish mechanism,
        scope, or ownership without turning into a prosecutorial re-attack.
        """
        system = PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS["curious_lead"])
        resume_context = _build_resume_context(parsed_resume, resume)
        focus_context_block = _join_focus_context(focus_context, resume_snippets)

        attack_strategy = weakness.get("attack_strategy", "clarification")
        focus_instruction = {
            "clarification": (
                "Ask one precise clarifying question that pins down the mechanism, scope, or concrete decision."
            ),
            "ownership_probe": (
                "Ask one precise ownership question that pins down what the candidate personally built, changed, or decided."
            ),
        }.get(
            attack_strategy,
            "Ask one precise question that establishes the most important missing detail before escalating."
        )

        user = f"""Candidate background:
{resume_context[:900]}

Current focus context:
{focus_context_block or "Use the exact project or claim under discussion."}

Previous question: {question}

Candidate's answer: {answer}

Why we are clarifying:
- Weakness type: {weakness.get('type', 'unknown')}
- Gap: {weakness.get('weakness', '')}
- Route: {attack_strategy}

Instruction:
{focus_instruction}

Rules:
- ONE question only
- ≤20 words
- Reference something concrete from their answer or resume
- Curious and directed, not accusatory
- If you are staying on the same project, make that continuity explicit in the question
- Do NOT stack multiple asks in one sentence
- Do NOT escalate into contradiction yet

Output only the question."""

        result = await self.llm_fast.call(system=system, user=user)
        fallback = _fallback_for_strategy(attack_strategy)
        if isinstance(result, str):
            return _finalize_question_output(result, fallback)
        if isinstance(result, dict):
            raw = result.get("question") or result.get("followup") or str(result)
            return _finalize_question_output(raw, fallback)
        return fallback

    async def generate_discrepancy_challenge(
        self,
        question: str,
        answer: str,
        discrepancy: dict,
        persona: str,
        resume: str,
        parsed_resume: dict | None = None,
        focus_context: str = "",
        resume_snippets: list[str] | None = None,
    ) -> str:
        """
        Resume discrepancy detected → generate a direct but non-accusatory confrontation.
        The candidate said something that contradicts their resume claims.
        """
        system = PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS["curious_lead"])
        resume_context = _build_resume_context(parsed_resume, resume)
        focus_context_block = _join_focus_context(focus_context, resume_snippets)

        user = f"""Candidate background:
{resume_context}

Current focus context:
{focus_context_block or "Use the exact project or claim under discussion."}

Previous question: {question}

Candidate's answer: {answer}

Discrepancy detected between their answer and their resume:
{discrepancy.get('description', '')}
Conflict level: {discrepancy.get('conflict_level', 'unknown')}

Generate ONE question that surfaces this inconsistency — curious and direct, not accusatory.
The goal is to give them a chance to explain or clarify, not to catch them in a lie.
Reference the specific thing from their resume that conflicts.
If you are staying on the same project, make that continuity explicit in the wording.
Output only the question."""

        result = await self.llm.call(system=system, user=user)
        raw = result if isinstance(result, str) else result.get("question", str(result))
        return _finalize_question_output(raw, _fallback_discrepancy_question())

    async def generate_sprint_question(
        self,
        sprint: int,
        persona: str,
        resume: str,
        history: list[dict],
        weakness: dict | None = None,
        parsed_resume: dict | None = None,
        transition_brief: str = "",
        avoid_topics: list[str] | None = None,
        focus_context: str = "",
        resume_snippets: list[str] | None = None,
        trajectory_hint_question: str = "",
        pivoting_hint: bool = False,
    ) -> tuple[str, list[str]]:
        """
        Low/medium severity or clean answer → advance to the next question for this sprint.
        Generates a fresh question grounded in the candidate's actual resume and history.
        Returns (question_text, followups) — followups are the bank's pre-written deepening
        questions for the seed used, adapted to this candidate on the next turn.
        """
        covered = [h.get("question", "") for h in history[-6:]]
        covered_str = "\n".join(f"- {q}" for q in covered) if covered else "None yet."
        resume_context = _build_resume_context(parsed_resume, resume)
        focus_context_block = _join_focus_context(focus_context, resume_snippets)
        latest_turn = history[-1] if history else {}
        topic_anchor = (
            latest_turn.get("focus_label")
            or latest_turn.get("question")
            or latest_turn.get("answer")
            or ""
        )
        weakness_hint = ""
        if isinstance(weakness, dict):
            weakness_hint = weakness.get("weakness", "") or weakness.get("type", "")

        # Retrieve 2 relevant questions from the bank as structural seeds.
        # The LLM adapts the best fit to this specific candidate — never used verbatim.
        rag_query = "\n".join(
            section for section in [
                transition_brief[:240] if transition_brief else "",
                topic_anchor[:180] if topic_anchor else "",
                weakness_hint[:160] if weakness_hint else "",
                resume_context[:300],
            ]
            if section
        )
        rag_candidates = question_bank.retrieve(rag_query[:600], sprint=sprint, top_k=2)
        rag_context = ""
        # Capture followups from the best-matching seed for use as the next turn's deepening questions
        seed_followups: list[str] = []
        if rag_candidates:
            rag_context = "\n\nStructural question seeds (adapt to the candidate — do NOT copy verbatim):\n"
            rag_context += "\n".join(f"- {q['text']}" for q in rag_candidates)
            seed_followups = rag_candidates[0].get("followups", [])
        trajectory_hint_section = ""
        if trajectory_hint_question.strip():
            trajectory_hint_section = (
                "\nInterview-map candidate question (use as a grounded backbone if helpful):\n"
                f"- {trajectory_hint_question.strip()}"
            )

        avoid_section = ""
        if avoid_topics:
            avoid_section = (
                "\n⚠️ MANDATORY — These topics have already been probed exhaustively. Do NOT ask about them again:\n"
                + "\n".join(f"- {topic}" for topic in avoid_topics[:3])
                + "\nPick a different project, claim, or technology from the candidate's resume entirely."
            )
        transition_section = f"\nConversation memory to build on:\n{transition_brief}" if transition_brief else ""

        system = PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS["curious_lead"])
        user = f"""Sprint goal: {SPRINT_GOALS.get(sprint, '')}

Candidate background:
{resume_context}

Current focus context:
{focus_context_block or "Use the most relevant exact project or claim from the resume."}

Questions already asked (do NOT repeat these):
{covered_str}{rag_context}{trajectory_hint_section}{avoid_section}{transition_section}

Generate ONE new interview question that:
- Directly references something specific from their resume (a project by name, a technology they listed, a claim they made)
- Must feel like it belongs after the immediately preceding exchange, not as a reset
- Aligns with the sprint goal above
- Has not been covered already
- Uses the conversation memory above if helpful so the interview feels continuous, not cold
- Fits your interviewer persona
- If this is a pivot, explicitly name the transition in the question itself, e.g. "Switching to your TinyML pipeline..." or "On the systems side of that same Filmora workflow..."
- Do NOT ask a generic placeholder like "imagine a system serving millions of users" unless that exact scale/system came from their background or the prior exchange
{"- This is a pivot turn. The question must make the new project / tech context explicit." if pivoting_hint else "- If staying on the same project, explicit continuity phrasing is preferred."}

Output only the question."""

        result = await self.llm.call(system=system, user=user)
        question = result if isinstance(result, str) else result.get("question", str(result))
        fallback = rag_candidates[0]["text"] if rag_candidates else _fallback_sprint_question(sprint)
        return _finalize_question_output(question, fallback), seed_followups

    async def adapt_followup(
        self,
        raw_followup: str,
        question: str,
        answer: str,
        persona: str,
        resume_context: str,
        focus_context: str = "",
        resume_snippets: list[str] | None = None,
    ) -> str:
        """
        Takes a raw follow-up template from the question bank and grounds it in the
        candidate's specific answer. Called between sprint questions to go one level deeper
        before advancing to the next topic.
        """
        system = PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS["curious_lead"])
        focus_context_block = _join_focus_context(focus_context, resume_snippets)
        user = f"""The interview just covered this exchange:
Q: {question}
A: {answer[:400]}

Candidate background:
{resume_context[:300]}

Current focus context:
{focus_context_block or "Stay on the exact project or mechanism the exchange was about."}

Adapt this follow-up question so it references something specific from their answer above:
"{raw_followup}"

Rules:
- Keep it to ONE question
- ≤20 words
- Preserve the direction of the template, but make it concrete to what they actually said
- If they mentioned a specific component, technology, decision, or failure, anchor to that
- Avoid generic phrasing like "tell me more" unless nothing else is available
- If you are staying on the same project, make that continuity explicit in the question itself

Output only the adapted question. ONE question, conversational."""

        result = await self.llm_fast.call(system=system, user=user)
        # Fallback: use the raw template if LLM fails
        if isinstance(result, str):
            return _finalize_question_output(result, raw_followup)
        if isinstance(result, dict):
            raw = result.get("question") or result.get("followup") or raw_followup
            return _finalize_question_output(raw, raw_followup)
        return _finalize_question_output(raw_followup, "Can you walk me through that part in more concrete detail?")

    async def generate_sprint_opener(
        self,
        sprint: int,
        persona: str,
        resume: str,
        parsed_resume: dict | None,
        prior_sprint_history: list[dict],
        transition_brief: str = "",
        avoid_topics: list[str] | None = None,
        focus_context: str = "",
        resume_snippets: list[str] | None = None,
    ) -> str:
        """
        Generates a context-aware sprint transition question.

        Unlike generate_sprint_question, this is the OPENING of a new sprint — it
        should feel like a smooth pivot, not a cold restart. It references the most
        interesting thing that emerged in the previous sprint and uses it as a launchpad
        into the new sprint's goal.

        Sprint 1→2: "We just explored [project X]. Let's go deeper on [concept Y] you mentioned."
        Sprint 2→3: "You explained [concept Z]. Now let's think about how that design scales."
        """
        resume_context = _build_resume_context(parsed_resume, resume)
        focus_context_block = _join_focus_context(focus_context, resume_snippets)

        # Summarise the last sprint: last 4 Q&A pairs (avoid huge context)
        prior_summary = ""
        if prior_sprint_history:
            pairs = prior_sprint_history[-4:]
            prior_summary = "What we just covered in the previous sprint:\n"
            for i, turn in enumerate(pairs, 1):
                q = turn.get("question", "")[:120]
                a = turn.get("answer", "")[:180]
                if q:
                    prior_summary += f"  Q{i}: {q}\n"
                if a:
                    prior_summary += f"  A{i}: {a}\n"

        avoid_section = ""
        if avoid_topics:
            avoid_section = (
                "⚠️ MANDATORY — Do NOT re-center on these already-exhausted topics:\n"
                + "\n".join(f"- {topic}" for topic in avoid_topics[:3])
                + "\nUse a different area from the candidate's background.\n"
            )
        transition_memory = f"Transition memory:\n{transition_brief}\n" if transition_brief else ""

        transition_context = {
            2: "Transition from project exploration into the technical concepts that underpin the work they described. "
               "Reference a specific technology, decision, or claim from the previous sprint — use it as the jumping-off point.",
            3: "Transition from conceptual discussion into system design and trade-offs. "
               "Reference something concrete from what they've explained so far — scale it up, introduce a constraint, or ask about failure modes.",
        }.get(sprint, "")

        system = PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS["curious_lead"])
        user = f"""You are opening Sprint {sprint} of the interview.

Sprint {sprint} goal: {SPRINT_GOALS.get(sprint, '')}
Transition guidance: {transition_context}

Candidate background:
{resume_context}

Current focus context:
{focus_context_block or "Name the specific project or technology you are transitioning from / to."}

{prior_summary}
{transition_memory}{avoid_section}

Write ONE transition question that:
- Feels like a natural continuation of the conversation above (not a cold start)
- References something specific the candidate said or something concrete from their resume
- Opens the door to the new sprint goal without immediately going deep
- If one topic dominated the last sprint, use it only as a bridge and then pivot broader
- Is conversational and clear — a senior engineer talking to a peer
- Avoid vague stock prompts; the question should name a concrete project, concept, technology, or claim from the prior sprint / resume
- The question itself must explicitly signal the transition, e.g. "Staying with...", "Switching to...", or "On the systems side of..."

Output only the question."""

        result = await self.llm.call(system=system, user=user)
        raw = result if isinstance(result, str) else result.get("question", str(result))
        return _finalize_question_output(raw, _fallback_sprint_opener(sprint))

    async def generate_seed_question(
        self,
        sprint: int,
        persona: str,
        resume_context: str,
    ) -> str:
        """
        Called once at session start to pre-seed the first follow-up.
        Runs before any candidate answer exists — generates based on resume alone.
        Replaces the generic fallback on Turn 1's fast path.
        """
        system = PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS["curious_lead"])
        user = f"""Sprint {sprint} — {SPRINT_GOALS.get(sprint, '')}

Candidate background:
{resume_context}

The candidate has just been asked: "Tell me about a project you're genuinely proud of."
Before they've answered, generate ONE follow-up question you'll ask after they respond.
The question should:
- Reference a specific project, technology, or claim from their resume above
- Dig into personal contribution or a key implementation decision
- Be ≤20 words, conversational

Output only the question."""

        result = await self.llm_fast.call(system=system, user=user)
        if isinstance(result, str):
            return _finalize_question_output(result, "What part of that project was most dependent on your own implementation choices?")
        if isinstance(result, dict):
            return _finalize_question_output(result.get("question", str(result)), "What part of that project was most dependent on your own implementation choices?")
        return "What part of that project was most dependent on your own implementation choices?"

    async def generate_speculative(
        self,
        partial_text: str,
        new_entities: list[str],
        last_question: str,
        persona: str,
        sprint: int,
        resume_context: str,
        admission: bool = False,
        current_best_question: str = "",
        short_answer_rescue: bool = False,
        focus_context: str = "",
        resume_snippets: list[str] | None = None,
        current_map_candidate: str = "",
    ) -> dict:
        """
        Event-driven speculative question — Haiku only, never blocks the fast path.
        Triggered when a new entity appears in the partial transcript or an
        admission/gap signal is detected.

        The result is staged in speculative_cache and promoted in the fast path
        if no canonical prepped_next_question is available. If the speculative
        candidate is stale (sprint advanced, newer job wrote) it is discarded.
        """
        system = PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS["curious_lead"])
        fallback = "Say more about the specific mechanism you used there."
        focus_context_block = _join_focus_context(focus_context, resume_snippets)

        if admission:
            direction = (
                "The candidate appears to be admitting a gap or being honest about a limit. "
                "Generate a curious, exploratory follow-up that rewards their honesty — "
                "pivot to what they DO know or understand, not what they don't."
            )
            fallback = "What part of that are you most confident about, even if the rest was handled by the framework?"
        elif new_entities:
            direction = (
                f"The candidate just introduced: {', '.join(new_entities[:3])}. "
                "Generate a follow-up that digs one level deeper into one of these specifically."
            )
        elif short_answer_rescue:
            direction = (
                "The candidate gave a very short answer. Generate a light but specific rescue follow-up "
                "that stays attached to what they just said or to the last question, so the conversation "
                "does not collapse into a generic fallback."
            )
            fallback = "What exactly in that answer is the key detail you want me to understand?"
        else:
            direction = "Generate a deepening follow-up grounded in what the candidate just said."

        current_best_section = ""
        if current_best_question.strip():
            current_best_section = f"""
Current best speculative follow-up:
"{current_best_question[:180]}"

If the new transcript does NOT materially improve this question, keep it.
Only replace it if you can make it more specific, more grounded, or more useful.
"""
        map_candidate_section = ""
        if current_map_candidate.strip():
            map_candidate_section = f"""
Interview-map candidate question:
"{current_map_candidate[:180]}"

If this candidate is more grounded than the current speculative question, prefer it.
"""

        user = f"""Sprint {sprint} — partial transcript so far:
"{partial_text[-400:]}"

Last question asked: {last_question[:150]}

Candidate background:
{resume_context[:300]}

Current focus context:
{focus_context_block or "Stay on the most relevant project or claim from the resume."}

{direction}
{current_best_section}
{map_candidate_section}

Return JSON only:
- If the current best question is still good enough: {{"action": "keep"}}
- If you can improve it directly: {{"action": "replace", "question": "..."}} 
- If the interview-map candidate is better than the current best: {{"action": "use_map_candidate"}}

Rules:
- ONE question only
- ≤20 words
- Keep it specific and grounded
- Do not return commentary
- Do not pivot topics unless the candidate clearly admitted a gap
- Prefer exact resume/project wording over generic abstractions
"""

        result = await self.llm_fast.call(system=system, user=user)
        return _normalize_speculative_decision(
            result,
            fallback=fallback,
            current_best_question=current_best_question,
            current_map_candidate=current_map_candidate,
        )

    async def prefetch(self, concepts: list[str], state: dict) -> list[str]:
        """
        Speculatively generate follow-ups while the candidate is still speaking.
        Fires on interim results — the result is ready when the final transcript arrives.
        """
        if not concepts:
            return []

        persona = state.get("current_persona", "curious_lead")
        parsed_resume = state.get("parsed_resume", {})
        resume_context = _build_resume_context(parsed_resume, state.get("resume", ""))
        sprint = state.get("current_sprint", 1)

        system = PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS["curious_lead"])
        user = f"""Sprint {sprint} — {SPRINT_GOALS.get(sprint, '')}

Candidate background:
{resume_context[:600]}

The candidate is currently talking about: {', '.join(concepts[:3])}.

Generate 2 short follow-up questions that dig deeper, grounded in their specific background.
Output JSON: {{"questions": ["...", "..."]}}"""

        result = await self.llm.call(system=system, user=user)
        if isinstance(result, dict):
            return result.get("questions", [])
        return []
