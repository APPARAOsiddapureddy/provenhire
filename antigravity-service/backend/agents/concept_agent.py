from backend.models.llm_router import LLMRouter


PROMPT = """You are a concept extraction engine.

Input:
- Candidate answer

Output:
- List of key technical concepts mentioned
- Ignore filler words

Return JSON: {"concepts": [...]}
"""


class ConceptAgent:
    """
    Extracts technical concepts from a candidate's answer.
    Runs in parallel at the start of every turn.
    Uses a small/fast model — latency target: ~50ms.
    """

    def __init__(self):
        self.llm = LLMRouter(tier="small")

    async def extract(self, answer: str) -> list[str]:
        result = await self.llm.call(
            system=PROMPT,
            user=f"Candidate answer: {answer}",
        )
        return result.get("concepts", [])
