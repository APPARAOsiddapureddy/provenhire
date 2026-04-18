import os


def env_first(*names: str, default: str = "") -> str:
    """
    Return the first non-empty environment value across a list of aliases.
    Keeps config changes uniform across old/new variable names.
    """
    for name in names:
        value = os.environ.get(name, "")
        if value and str(value).strip():
            return str(value).strip()
    return default


def model_tier(name: str, default: str) -> str:
    return env_first(f"OPENROUTER_{name.upper()}_MODEL", default=default)


def elevenlabs_api_key() -> str:
    return env_first("ELEVENLABS_API_KEY", "TTS_API_KEY")


def elevenlabs_voice_id(default: str) -> str:
    return env_first("ELEVENLABS_VOICE_ID", "TTS_VOICE_ID", default=default)
