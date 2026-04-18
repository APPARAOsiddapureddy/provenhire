import os
import json
from openai import AsyncOpenAI
from backend.config.env_runtime import model_tier


# Model routing tiers via OpenRouter
# OpenRouter model IDs: https://openrouter.ai/models
DEFAULT_MODEL_TIERS = {
    "small": "anthropic/claude-haiku-4-5",   # concept extraction, resume parsing
    "medium": "anthropic/claude-sonnet-4-5", # weakness detection, follow-ups
    "large": "deepseek/deepseek-r1",         # strongest reasoning/evaluation path for now
}

MODEL_TIERS = {
    tier: model_tier(tier, default_model)
    for tier, default_model in DEFAULT_MODEL_TIERS.items()
}

# Default max_tokens per tier — small tasks need less space, evaluation needs headroom
TIER_MAX_TOKENS = {
    "small": 256,
    "medium": 768,
    "large": 2500,   # full interview evaluation with JSON schema needs real space
}

# Alternative cheap/fast options for cost optimization:
# "small": "google/gemini-flash-1.5"
# "medium": "openai/gpt-4o-mini"
# "large": "openai/gpt-4o"


class LLMRouter:
    """
    Routes LLM calls to the right model tier via OpenRouter.
    OpenRouter is OpenAI API-compatible — one key, all models.

    Tiers:
    - small  → fast classification tasks (~50ms)
    - medium → follow-up generation, weakness detection (~200ms)
    - large  → deep evaluation, scoring (~500ms)
    """

    def __init__(self, tier: str = "medium"):
        assert tier in MODEL_TIERS, f"Unknown tier: {tier}. Choose from: {list(MODEL_TIERS.keys())}"
        self.tier = tier
        self.model = MODEL_TIERS[tier]
        self.client = AsyncOpenAI(
            api_key=os.environ["OPENROUTER_API_KEY"],
            base_url="https://openrouter.ai/api/v1",
        )

    async def call(self, system: str, user: str, max_tokens: int | None = None) -> dict | str:
        if max_tokens is None:
            max_tokens = TIER_MAX_TOKENS[self.tier]
        response = await self.client.chat.completions.create(
            model=self.model,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        text = response.choices[0].message.content or ""
        text = text.strip()

        # Strip reasoning model thinking blocks (<think>...</think>)
        import re as _re
        text = _re.sub(r"<think>[\s\S]*?</think>", "", text).strip()

        # Try to parse as JSON; fall back to raw string
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Strip markdown code fences if present
            if "```" in text:
                fenced = _re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
                if fenced:
                    try:
                        return json.loads(fenced.group(1).strip())
                    except json.JSONDecodeError:
                        pass
            # Last resort: find the first { ... } JSON object in the text
            obj_match = _re.search(r"\{[\s\S]*\}", text)
            if obj_match:
                try:
                    return json.loads(obj_match.group(0))
                except json.JSONDecodeError:
                    pass
            return text
