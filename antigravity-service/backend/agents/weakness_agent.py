from backend.models.llm_router import LLMRouter


PROMPT = """You are a technical interviewer analyzing a candidate's answer for reasoning gaps.

Do NOT validate or praise. Your job is to identify the most important next probe.
Sometimes that means exposing a weakness. Sometimes that means asking one clarification question
before escalating.

Weakness types:
- missing_step: they skipped a critical reasoning step or assumption
- vague: buzzwords without substance, no mechanism explained
- incorrect: technically wrong claim or broken logic
- shallow: surface-level answer that doesn't go deep enough
- overconfidence: claims certainty where there should be uncertainty or trade-offs
- deflection: they avoided the actual question, redirected, or talked around it
- ambiguous_but_promising: there may be real substance here, but it needs one clarification turn before attack

Attack strategies (pick the one that will most expose the weakness):
- clarification: ask one exploratory clarifying question before escalating
- implementation_probe: ask them to implement or describe the mechanism step-by-step
- ownership_probe: pin down what they personally built versus what the team/system did
- edge_case: introduce a scenario that breaks their assumption
- scaling: increase the scale/load until their approach breaks
- contradiction: surface a contradiction between what they said and what's true
- step_by_step: force them to walk through reasoning explicitly

Severity:
- high: fundamental gap, incorrect claim, or completely vague — must be probed
- medium: incomplete or could go deeper — worth following up
- low: minor omission, acceptable for this sprint

IMPORTANT: If the candidate explicitly admits a gap, corrects their own previous claim, or shows high intellectual honesty (e.g., 'I actually mislabeled that, it was just prompt engineering'), set severity to 'medium' or 'low'. Intellectual honesty is a strength, not a weakness—do NOT punish it with a high-severity attack probe. Pick an 'implementation_probe' or 'step_by_step' to explore the NEW truth they just provided.

Calibration rules:
- Use the expected role, years of experience, and resume ownership signals to calibrate severity.
- If the candidate claims only internship / contributing / supporting ownership, do NOT hold them to the same ownership bar as someone claiming leadership or end-to-end architecture.
- Use `ownership_probe` when the main uncertainty is "what did YOU personally do?"
- Use `clarification` with `ambiguous_but_promising` when the answer hints at substance and deserves one clarifying question before confrontation.
- Use `deflection` when they do not seriously attempt the question.

Output JSON only:
{
  "weakness": "<one sentence describing the specific gap>",
  "type": "missing_step | vague | incorrect | shallow | overconfidence | deflection | ambiguous_but_promising",
  "severity": "low | medium | high",
  "attack_strategy": "clarification | implementation_probe | ownership_probe | edge_case | scaling | contradiction | step_by_step"
}"""


class WeaknessAgent:
    """
    Core agent — THE most important agent in the system.
    Detects the exact failure point in the candidate's reasoning.
    Context-aware: uses sprint + previous weaknesses to avoid redundant probing.
    """

    def __init__(self):
        self.llm = LLMRouter(tier="medium")

    async def detect(
        self,
        question: str,
        answer: str,
        sprint: int = 1,
        prior_weaknesses: list[dict] | None = None,
        memory_context: str = "",
        parsed_resume: dict | None = None,
        target_role: str = "",
        years_experience: str = "",
    ) -> dict:
        """
        Detects weakness in the candidate's answer.
        Sprint context shifts what counts as 'high severity':
          Sprint 1: ownership gaps, vague project claims
          Sprint 2: conceptual gaps, incorrect fundamentals
          Sprint 3: system design holes, missing trade-offs
        """
        sprint_focus = {
            1: "Focus on: did they actually build this? Are they vague about their own contribution?",
            2: "Focus on: are they hand-waving fundamentals? Is reasoning mechanically correct?",
            3: "Focus on: are they ignoring trade-offs, failure modes, or scale implications?",
        }.get(sprint, "")

        prior_context = ""
        if prior_weaknesses:
            recent = prior_weaknesses[-3:]  # last 3 weaknesses
            typed = [f"{w.get('type', '')}({w.get('severity', '')})" for w in recent]
            prior_context = f"\nAlready probed: {', '.join(typed)}. Avoid redundant weakness detection."

        memory_section = f"\n\nCandidate context from prior turns:\n{memory_context}" if memory_context else ""
        parsed_resume = parsed_resume or {}
        experience_tier = parsed_resume.get("experience_tier", "")
        projects = parsed_resume.get("projects", [])
        experiences = parsed_resume.get("experiences", [])
        ownership_signals = []
        for project in projects[:3]:
            ownership_signals.append(
                f"{project.get('name', 'project')}: ownership={project.get('ownership_level', 'unknown')} contribution={project.get('contribution_type', 'contributed')}"
            )
        for exp in experiences[:2]:
            ownership_signals.append(
                f"{exp.get('title', 'role')} @ {exp.get('company', '')}: contribution={exp.get('contribution_type', 'contributed')}"
            )
        calibration_context = (
            f"\nExpected target role: {target_role or 'not provided'}"
            f"\nExpected years of experience: {years_experience or 'not provided'}"
            f"\nResume experience tier: {experience_tier or 'unknown'}"
        )
        if ownership_signals:
            calibration_context += "\nOwnership signals:\n- " + "\n- ".join(ownership_signals)
        prior_assessment_prompt = str(parsed_resume.get("prior_assessment_prompt", "") or "").strip()
        if prior_assessment_prompt:
            calibration_context += f"\nPrior assessment context:\n{prior_assessment_prompt[:1200]}"

        user = f"""Sprint {sprint} — {sprint_focus}{prior_context}{memory_section}
{calibration_context}

Question: {question}

Candidate Answer: {answer}"""

        result = await self.llm.call(system=PROMPT, user=user)
        if isinstance(result, dict):
            return result
        return {"weakness": str(result), "type": "vague", "severity": "low", "attack_strategy": "clarification"}
