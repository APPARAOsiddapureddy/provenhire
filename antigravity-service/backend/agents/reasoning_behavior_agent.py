from backend.models.llm_router import LLMRouter


PROMPT = """You are a meta-cognition evaluator.

Do NOT evaluate technical accuracy.
Evaluate HOW the candidate thinks and communicates.

Track:
1. Structure: Do they enumerate steps? ("First... Second...")
2. Clarification behavior: Do they ask for constraints before designing?
3. Adaptability: How do they react when their answer is challenged?
   - flexible: adjusts reasoning, incorporates new info
   - rigid: sticks to original answer despite pressure
   - defensive: deflects, avoids, or talks past the question
   - confrontational: becomes hostile or pushes back on the premise instead of engaging
   - admitted_gap: explicitly acknowledges they don't know or corrects themselves — this is intellectually honest, not evasive
4. Confidence calibration: Are they overconfident or appropriately uncertain?

Return JSON:
{
  "structure_score": 0-3,
  "clarification_behavior": "asks | assumes | mixed | asks_to_deflect",
  "adaptability": "flexible | rigid | defensive | confrontational | admitted_gap",
  "confidence_calibration": "calibrated | overconfident | underconfident",
  "notes": "..."
}
"""


class ReasoningBehaviorAgent:
    """
    Runs in parallel — evaluates meta-cognition, not technical accuracy.
    Captures HOW the candidate thinks, not just WHAT they answer.
    This feeds into the final hire recommendation.
    """

    def __init__(self):
        self.llm = LLMRouter(tier="medium")

    async def evaluate(self, answer: str, was_challenged: bool = False) -> dict:
        context = f"Candidate was challenged: {was_challenged}\n\nAnswer:\n{answer}"
        return await self.llm.call(system=PROMPT, user=context)
