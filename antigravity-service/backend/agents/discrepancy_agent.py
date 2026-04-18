from backend.models.llm_router import LLMRouter


PROMPT = """Compare:
- Resume claims
- Candidate explanation

Detect inconsistencies between what the candidate claims to have built/know
and what they actually demonstrate in their answer.

IMPORTANT: If prior turns have already confirmed that a particular project or claim is
credible (listed in "Already established as true"), do NOT re-flag it as a conflict.
A candidate describing the same project across multiple turns is normal interview behavior,
not a discrepancy. Only flag genuinely new contradictions.

Distinguish carefully between:
- none: no discrepancy, or the answer is consistent with the resume
- suspected: the answer sounds inflated, ambiguous, or weakly aligned with the resume, but not directly contradictory yet
- confirmed: the answer directly contradicts the resume, prior confirmed facts, or the candidate's own earlier claims

Output JSON:
{
  "conflict_level": "none | suspected | confirmed",
  "description": "...",
  "severity": "low | medium | high"
}
"""


class DiscrepancyAgent:
    """
    Cross-verifies what candidate claims on resume vs what they explain.
    Flags bluffing, resume inflation, and knowledge gaps.
    Memory context prevents re-flagging claims already confirmed in prior turns.
    """

    def __init__(self):
        self.llm = LLMRouter(tier="medium")

    async def check(self, resume: str, answer: str, memory_context: str = "") -> dict:
        memory_section = f"\n\n{memory_context}" if memory_context else ""
        result = await self.llm.call(
            system=PROMPT,
            user=f"Resume:\n{resume}{memory_section}\n\nCandidate Explanation:\n{answer}",
        )
        if isinstance(result, dict):
            if "conflict" in result and "conflict_level" not in result:
                result["conflict_level"] = "confirmed" if result.get("conflict") else "none"
            return result
        return {"conflict_level": "none", "description": str(result), "severity": "low"}
