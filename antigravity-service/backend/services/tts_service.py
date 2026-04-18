import asyncio
import os
import random

import httpx
from elevenlabs import VoiceSettings
from elevenlabs.client import AsyncElevenLabs
from elevenlabs.core.api_error import ApiError
from backend.config.env_runtime import elevenlabs_api_key, elevenlabs_voice_id
from backend.services.interview_telemetry import interview_telemetry


ELEVENLABS_MODEL = "eleven_turbo_v2_5"
ELEVENLABS_VOICE_ID = elevenlabs_voice_id("EXAVITQu4vr4xnSDxMaL")

CARTESIA_MODEL_ID = os.environ.get("CARTESIA_MODEL_ID") or "sonic-turbo"
CARTESIA_VOICE_ID = os.environ.get("CARTESIA_VOICE_ID") or "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"
CARTESIA_VERSION = os.environ.get("CARTESIA_VERSION") or "2025-04-16"
CARTESIA_ENDPOINT = "https://api.cartesia.ai/tts/bytes"

FILLER_PHRASES = [
    "Interesting.",
    "Got it.",
    "Alright.",
    "I see.",
    "Right.",
    "Sure.",
]


class TTSService:
    """
    TTS provider wrapper.

    Project policy is ElevenLabs. Cartesia is retained only as a last-resort
    fallback when ElevenLabs credentials are unavailable at runtime.
    """

    def __init__(self):
        requested_provider = (os.environ.get("TTS_PROVIDER") or "").strip().lower()
        self._cartesia_api_key = os.environ.get("CARTESIA_API_KEY", "").strip()
        self._elevenlabs_api_key = elevenlabs_api_key()

        valid_providers = {"elevenlabs", "cartesia"}
        if requested_provider and requested_provider not in valid_providers:
            print(
                f"[TTS] Unknown provider '{requested_provider}'. "
                "Defaulting to ElevenLabs."
            )
            requested_provider = ""

        if requested_provider == "cartesia":
            print(
                "[TTS] Ignoring TTS_PROVIDER=cartesia and enforcing ElevenLabs "
                "per project policy."
            )

        self._provider = "elevenlabs"

        if not self._elevenlabs_api_key:
            if self._cartesia_api_key:
                print(
                    "[TTS] ElevenLabs key missing. Falling back to Cartesia as an "
                    "emergency backup."
                )
                self._provider = "cartesia"
            else:
                print("[TTS] No TTS provider credentials configured.")

        self._elevenlabs_client = (
            AsyncElevenLabs(api_key=self._elevenlabs_api_key)
            if self._elevenlabs_api_key
            else None
        )
        self._voice_settings = VoiceSettings(
            stability=0.5,
            similarity_boost=0.75,
            style=0.0,
            use_speaker_boost=True,
        )
        self._http = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=5.0, read=45.0, write=15.0, pool=45.0)
        )
        self._filler_cache: dict[str, tuple[bytes, str, str]] = {}
        # Keyed by session_id → (question_text, audio_bytes, media_type, provider_used).
        # Populated by background pipeline; consumed once by /tts.
        self._prepped_audio: dict[str, tuple[str, bytes, str, str]] = {}
        self._last_error: str = ""
        self._last_provider_used: str = self._provider

    @property
    def provider(self) -> str:
        return self._provider

    @property
    def media_type(self) -> str:
        if self._provider == "cartesia":
            return "audio/wav"
        return "audio/mpeg"

    def status_snapshot(self) -> dict:
        return {
            "provider": self._provider,
            "media_type": self.media_type,
            "elevenlabs_configured": bool(self._elevenlabs_api_key),
            "cartesia_configured": bool(self._cartesia_api_key),
            "filler_cache_size": len(self._filler_cache),
            "prepped_audio_entries": len(self._prepped_audio),
            "last_provider_used": self._last_provider_used,
            "last_error": self._last_error,
        }

    async def _stream_elevenlabs(self, text: str):
        if not self._elevenlabs_client:
            raise RuntimeError("ElevenLabs not configured")

        async for chunk in self._elevenlabs_client.text_to_speech.convert(
            voice_id=ELEVENLABS_VOICE_ID,
            text=text,
            model_id=ELEVENLABS_MODEL,
            voice_settings=self._voice_settings,
            output_format="mp3_44100_128",
        ):
            if chunk:
                yield chunk

    async def _elevenlabs_bytes(self, text: str) -> bytes:
        chunks: list[bytes] = []
        async for chunk in self._stream_elevenlabs(text):
            if chunk:
                chunks.append(chunk)
        if not chunks:
            raise RuntimeError("ElevenLabs returned empty audio")
        return b"".join(chunks)

    async def _cartesia_bytes(self, text: str) -> bytes:
        if not self._cartesia_api_key:
            raise RuntimeError("Cartesia not configured")

        payload = {
            "model_id": CARTESIA_MODEL_ID,
            "transcript": text,
            "voice": {
                "mode": "id",
                "id": CARTESIA_VOICE_ID,
            },
            "output_format": {
                "container": "wav",
                "encoding": "pcm_s16le",
                "sample_rate": 44100,
            },
            "language": "en",
        }
        headers = {
            "Authorization": f"Bearer {self._cartesia_api_key}",
            "Cartesia-Version": CARTESIA_VERSION,
            "Content-Type": "application/json",
        }

        response = await self._http.post(CARTESIA_ENDPOINT, headers=headers, json=payload)
        if response.status_code >= 400:
            detail = response.text[:180].replace("\n", " ")
            raise RuntimeError(f"Cartesia {response.status_code}: {detail}")
        if not response.content:
            raise RuntimeError("Cartesia returned empty audio")
        return response.content

    def _should_fallback_to_cartesia(self, error: Exception) -> bool:
        if not self._cartesia_api_key:
            return False
        if isinstance(error, ApiError):
            detail = str(error).lower()
            quota_exhausted = "quota_exceeded" in detail or "credits remaining" in detail
            if quota_exhausted:
                return True
            return error.status_code in {429, 500, 502, 503, 504}
        return False

    async def synthesize(self, text: str) -> tuple[bytes, str, str]:
        """
        Returns (audio_bytes, media_type, provider_used).

        ElevenLabs remains the preferred provider. If it is unavailable at runtime
        (for example quota exhausted / rate-limited) and Cartesia is configured,
        we fall back per request instead of failing with an opaque 502.
        """
        self._last_error = ""

        if self._provider == "cartesia":
            audio = await self._cartesia_bytes(text)
            self._last_provider_used = "cartesia"
            return audio, "audio/wav", "cartesia"

        try:
            audio = await self._elevenlabs_bytes(text)
            self._last_provider_used = "elevenlabs"
            return audio, "audio/mpeg", "elevenlabs"
        except Exception as e:
            self._last_error = str(e)[:500]
            if self._should_fallback_to_cartesia(e):
                print(f"[TTS] ElevenLabs unavailable ({type(e).__name__}); falling back to Cartesia.")
                audio = await self._cartesia_bytes(text)
                self._last_provider_used = "cartesia"
                return audio, "audio/wav", "cartesia"
            raise

    async def stream(self, text: str):
        """
        Backwards-compatible async generator wrapper over synthesize().
        """
        audio, _, _ = await self.synthesize(text)
        if audio:
            yield audio

    async def get_filler_audio(self) -> bytes:
        _, audio, _, _ = await self.get_filler_payload()
        return audio

    async def get_filler_payload(self) -> tuple[str, bytes, str, str]:
        phrase = random.choice(FILLER_PHRASES)
        if phrase not in self._filler_cache:
            audio, media_type, provider_used = await self.synthesize(phrase)
            self._filler_cache[phrase] = (audio, media_type, provider_used)
        audio, media_type, provider_used = self._filler_cache[phrase]
        return phrase, audio, media_type, provider_used

    async def stream_with_filler(self, followup_text: str):
        filler = random.choice(FILLER_PHRASES)
        full_text = f"{filler} {followup_text}"
        async for chunk in self.stream(full_text):
            yield chunk

    async def pre_generate(self, session_id: str, text: str) -> None:
        """
        Pre-synthesize audio for the next question while the candidate is answering.
        Called from the background pipeline after next_question is determined.
        Result cached in _prepped_audio; consumed once by get_prepped().
        """
        try:
            started = asyncio.get_event_loop().time()
            audio, media_type, provider_used = await self.synthesize(text)
            if audio:
                self._prepped_audio[session_id] = (text, audio, media_type, provider_used)
                elapsed_ms = round((asyncio.get_event_loop().time() - started) * 1000)
                print(
                    f"[TTS] Pre-generated {len(audio)} bytes in {elapsed_ms}ms "
                    f"via {provider_used} for {session_id[:8]}"
                )
                await interview_telemetry.log(
                    session_id,
                    "tts_pregenerated",
                    source="backend.tts",
                    provider=provider_used,
                    media_type=media_type,
                    text_chars=len(text),
                    audio_bytes=len(audio),
                    elapsed_ms=elapsed_ms,
                )
        except Exception as e:
            print(f"[TTS] Pre-generation failed for {session_id[:8]}: {e}")
            await interview_telemetry.log(
                session_id,
                "tts_pregeneration_failed",
                source="backend.tts",
                level="warn",
                text_chars=len(text),
                error_type=type(e).__name__,
                error=str(e)[:300],
            )

    def get_prepped(self, session_id: str, text: str) -> tuple[bytes, str, str] | None:
        """
        Return cached audio if text matches the pre-generated question, then clear it.
        Returns None if no cache hit (falls through to live synthesis).
        """
        entry = self._prepped_audio.get(session_id)
        if entry and entry[0] == text:
            del self._prepped_audio[session_id]
            print(f"[TTS] Cache hit — serving pre-generated audio via {entry[3]} for {session_id[:8]}")
            asyncio.create_task(
                interview_telemetry.log(
                    session_id,
                    "tts_cache_hit",
                    source="backend.tts",
                    provider=entry[3],
                    media_type=entry[2],
                    text_chars=len(text),
                    audio_bytes=len(entry[1]),
                )
            )
            return entry[1], entry[2], entry[3]
        return None

    async def warm_filler_cache(self):
        for phrase in FILLER_PHRASES:
            if phrase not in self._filler_cache:
                try:
                    await self._cache_phrase(phrase)
                    await asyncio.sleep(0.1)
                except Exception as e:
                    print(f"[TTS] Failed to pre-cache filler '{phrase}': {e}")

    async def _cache_phrase(self, phrase: str):
        audio, media_type, provider_used = await self.synthesize(phrase)
        self._filler_cache[phrase] = (audio, media_type, provider_used)
