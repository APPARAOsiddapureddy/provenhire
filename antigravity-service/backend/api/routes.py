import os
import time
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from backend.services.orchestrator import Orchestrator
from backend.services.interview_telemetry import interview_telemetry
from backend.services.tts_service import TTSService

router = APIRouter()
tts_service = TTSService()
orchestrator = Orchestrator(tts_service=tts_service)


class StartInterviewRequest(BaseModel):
    prepared_session_id: str = ""
    resume: str = ""
    github_links: list[str] = []
    target_role: str = ""
    years_experience: str = ""
    prior_assessment_context: dict = {}
    prior_assessment_prompt: str = ""


class PrepareInterviewMapRequest(BaseModel):
    resume: str
    github_links: list[str] = []
    target_role: str = ""
    years_experience: str = ""
    prior_assessment_context: dict = {}
    prior_assessment_prompt: str = ""


class TTSRequest(BaseModel):
    text: str
    session_id: str = ""
    use_filler: bool = True


class TurnRequest(BaseModel):
    session_id: str
    transcript: str
    entities: list[str] = []  # NER entities extracted by Deepgram during transcription
    turn_id: str = ""          # Frontend-generated UUID; echoed back for stale response detection


class PartialRequest(BaseModel):
    session_id: str
    transcript: str
    entities: list[str] = []  # Best-known entities from the live transcript snapshot
    turn_id: str = ""         # Frontend-generated UUID for the active candidate answer turn
    is_final: bool = True     # Deepgram is_final block vs throttled interim snapshot
    snapshot_seq: int = 0     # Monotonic client-side sequence for stale-snapshot protection


class TelemetryEventRequest(BaseModel):
    session_id: str
    event: str
    source: str = "frontend"
    level: str = "info"
    fields: dict = {}


# ─────────────────────────────────────────────
# INTERVIEW LIFECYCLE
# ─────────────────────────────────────────────

@router.post("/prepare_interview_map")
async def prepare_interview_map(data: PrepareInterviewMapRequest):
    started = time.perf_counter()
    try:
        session_id = await orchestrator.prepare_session_map(
            data.resume,
            data.github_links,
            target_role=data.target_role,
            years_experience=data.years_experience,
            prior_assessment_context=data.prior_assessment_context,
            prior_assessment_prompt=data.prior_assessment_prompt,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    state = await orchestrator.get_session_state(session_id)
    interview_map = state.get("interview_trajectory_map") or {}
    focus_areas = interview_map.get("focus_areas", []) or []
    validation = state.get("interview_map_validation") or {}
    trajectory_focus_preview = [
        {
            "label": str(area.get("label", "") or ""),
            "focus_key": str(area.get("focus_key", "") or ""),
            "track_source": str(area.get("track_source", "") or ""),
            "llm_branch_count": int(area.get("llm_branch_count", 0) or 0),
            "resume_snippets": [str(snippet) for snippet in (area.get("resume_snippets") or [])[:2]],
        }
        for area in focus_areas[:4]
    ]
    await interview_telemetry.log(
        session_id,
        "api.prepare_interview_map",
        source="backend.api",
        resume_chars=len(data.resume),
        github_links=len(data.github_links),
        target_role=data.target_role,
        years_experience=data.years_experience,
        focus_areas=len(focus_areas),
        llm_focuses=int(validation.get("llm_focus_count", 0) or 0),
        rich_focuses=int(validation.get("rich_focus_count", 0) or 0),
        elapsed_ms=round((time.perf_counter() - started) * 1000, 3),
    )
    return {
        "session_id": session_id,
        "map_status": state.get("interview_map_status", ""),
        "map_validation": validation,
        "trajectory_focus_areas": len(focus_areas),
        "trajectory_focus_preview": trajectory_focus_preview,
    }

@router.post("/start_interview")
async def start_interview(data: StartInterviewRequest):
    started = time.perf_counter()
    try:
        if data.prepared_session_id.strip():
            session_id = await orchestrator.start_prepared_session(data.prepared_session_id.strip())
        else:
            session_id = await orchestrator.start_session(
                data.resume,
                data.github_links,
                target_role=data.target_role,
                years_experience=data.years_experience,
                prior_assessment_context=data.prior_assessment_context,
                prior_assessment_prompt=data.prior_assessment_prompt,
            )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    state = await orchestrator.get_session_state(session_id)
    focus_areas = ((state.get("interview_trajectory_map") or {}).get("focus_areas", []) or [])
    trajectory_focus_preview = [
        {
            "label": str(area.get("label", "") or ""),
            "focus_key": str(area.get("focus_key", "") or ""),
            "resume_snippets": [str(snippet) for snippet in (area.get("resume_snippets") or [])[:2]],
            "sprint_1": {
                "if_vague": str(((area.get("sprint_1") or {}).get("if_vague", "")) or ""),
                "if_short_answer": str(((area.get("sprint_1") or {}).get("if_short_answer", "")) or ""),
                "bridge_to_next_focus": str(((area.get("sprint_1") or {}).get("bridge_to_next_focus", "")) or ""),
            },
        }
        for area in focus_areas[:3]
    ]
    response = {
        "session_id": session_id,
        "opening_question": state["last_question"],
        "sprint": state["current_sprint"],
        "sprint_name": state["sprint_name"],
        "trajectory_focus_areas": len(focus_areas),
        "trajectory_focus_preview": trajectory_focus_preview,
    }
    await interview_telemetry.log(
        session_id,
        "api.start_interview",
        source="backend.api",
        resume_chars=len(data.resume),
        github_links=len(data.github_links),
        target_role=data.target_role,
        years_experience=data.years_experience,
        elapsed_ms=round((time.perf_counter() - started) * 1000, 3),
    )
    return response


@router.get("/interview_map_status/{session_id}")
async def get_interview_map_status(session_id: str):
    try:
        state = await orchestrator.get_session_state(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    interview_map = state.get("interview_trajectory_map") or {}
    focus_areas = interview_map.get("focus_areas", []) or []
    return {
        "session_id": session_id,
        "map_status": state.get("interview_map_status", ""),
        "map_error": state.get("interview_map_error", ""),
        "map_validation": state.get("interview_map_validation", {}),
        "trajectory_focus_areas": len(focus_areas),
        "trajectory_focus_preview": [
            {
                "label": str(area.get("label", "") or ""),
                "focus_key": str(area.get("focus_key", "") or ""),
                "track_source": str(area.get("track_source", "") or ""),
                "llm_branch_count": int(area.get("llm_branch_count", 0) or 0),
            }
            for area in focus_areas[:4]
        ],
    }


@router.get("/deepgram_token")
async def get_deepgram_token():
    """Returns the Deepgram API key so the browser SDK can connect directly.
    Safe for this internal dev app — never expose in a public deployment."""
    return {"token": os.environ["DEEPGRAM_API_KEY"]}


@router.post("/partial_transcript")
async def partial_transcript(data: PartialRequest):
    """
    Browser sends throttled live transcript snapshots while the candidate is speaking.
    These are speculative-only: they help prep the best available follow-up, but never
    become canonical interview history or evaluation input.
    """
    started = time.perf_counter()
    await orchestrator.on_partial_transcript(
        data.session_id,
        data.transcript,
        entities=data.entities,
        turn_id=data.turn_id,
        is_final=data.is_final,
        snapshot_seq=data.snapshot_seq,
    )
    await interview_telemetry.log(
        data.session_id,
        "api.partial_transcript",
        source="backend.api",
        turn_id=data.turn_id,
        is_final=data.is_final,
        snapshot_seq=data.snapshot_seq,
        transcript_chars=len(data.transcript),
        transcript_words=len(data.transcript.split()),
        entities_count=len(data.entities),
        elapsed_ms=round((time.perf_counter() - started) * 1000, 3),
    )
    return {"ok": True}


@router.post("/process_turn")
async def process_turn(data: TurnRequest):
    """
    Browser sends final transcript + NER entities → agents run → follow-up returned.
    Entities extracted by Deepgram during transcription — no extra LLM call needed for concept extraction.
    """
    started = time.perf_counter()
    result = await orchestrator.handle_transcript(data.session_id, data.transcript, entities=data.entities, turn_id=data.turn_id)
    await interview_telemetry.log(
        data.session_id,
        "api.process_turn",
        source="backend.api",
        turn_id=data.turn_id,
        transcript_chars=len(data.transcript),
        transcript_words=len(data.transcript.split()),
        entities_count=len(data.entities),
        route_kind=result.get("route_kind"),
        complete=bool(result.get("complete")),
        question_count=result.get("question_count"),
        elapsed_ms=round((time.perf_counter() - started) * 1000, 3),
    )
    return result


@router.post("/end_interview/{session_id}")
async def end_interview(session_id: str):
    started = time.perf_counter()
    try:
        final_state = await orchestrator.end_session(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    evaluation = final_state.get("final_evaluation") or {}
    response = {
        "session_id": session_id,
        "hire_recommendation": evaluation.get("hire_recommendation", "N/A"),
        "overall_score": evaluation.get("overall_score", 0),
        "summary": evaluation.get("summary", ""),
    }
    await interview_telemetry.log(
        session_id,
        "api.end_interview",
        source="backend.api",
        question_count=final_state.get("question_count", 0),
        history_len=len(final_state.get("history", [])),
        hire_recommendation=evaluation.get("hire_recommendation"),
        overall_score=evaluation.get("overall_score"),
        elapsed_ms=round((time.perf_counter() - started) * 1000, 3),
    )
    return response


# ─────────────────────────────────────────────
# TTS
# ─────────────────────────────────────────────

@router.get("/tts_filler")
async def get_filler():
    """
    Returns a random pre-cached filler phrase.
    Pre-generated at startup — responds in <10ms after warm-up.
    """
    from fastapi import HTTPException
    started = time.perf_counter()
    try:
        phrase, audio_bytes, media_type, provider_used = await tts_service.get_filler_payload()
        await interview_telemetry.log(
            "system",
            "api.tts_filler",
            source="backend.api",
            provider=provider_used,
            media_type=media_type,
            text=phrase,
            audio_bytes=len(audio_bytes),
            elapsed_ms=round((time.perf_counter() - started) * 1000, 3),
        )
        return Response(
            content=audio_bytes,
            media_type=media_type,
            headers={"X-Filler-Text": phrase, "X-TTS-Provider": provider_used},
        )
    except Exception as e:
        print(f"[TTS] Filler generation failed: {e}")
        raise HTTPException(status_code=502, detail=f"Filler TTS failed: {str(e)[:80]}")


@router.get("/tts_health")
async def get_tts_health():
    return tts_service.status_snapshot()


@router.post("/telemetry")
async def record_telemetry_event(data: TelemetryEventRequest):
    await interview_telemetry.log(
        data.session_id,
        data.event,
        source=data.source,
        level=data.level,
        **(data.fields or {}),
    )
    return {"ok": True}


@router.get("/telemetry/{session_id}")
async def get_telemetry(session_id: str, limit: int = 400):
    return await interview_telemetry.summarize(session_id, limit=limit)


@router.post("/tts")
async def synthesize_speech(data: TTSRequest):
    from fastapi import HTTPException

    started = time.perf_counter()

    # Fast path: return pre-generated audio if available
    if data.session_id:
        cached = tts_service.get_prepped(data.session_id, data.text)
        if cached:
            elapsed_ms = round((time.perf_counter() - started) * 1000, 3)
            print(f"[TTS] Cache served in {elapsed_ms}ms")
            audio_bytes, media_type, provider_used = cached
            await interview_telemetry.log(
                data.session_id,
                "api.tts",
                source="backend.api",
                text_chars=len(data.text),
                source_kind="prepped",
                provider=provider_used,
                media_type=media_type,
                audio_bytes=len(audio_bytes),
                elapsed_ms=elapsed_ms,
            )
            return Response(
                content=audio_bytes,
                media_type=media_type,
                headers={
                    "Cache-Control": "no-cache",
                    "X-TTS-Source": "prepped",
                    "X-TTS-Provider": provider_used,
                },
            )

    # Slow path: live synthesis
    import asyncio as _asyncio
    try:
        audio_bytes, media_type, provider_used = await tts_service.synthesize(data.text)
        if not audio_bytes:
            print(f"[TTS] Provider {tts_service.provider} returned zero bytes for text: '{data.text[:30]}...'")
            raise HTTPException(status_code=502, detail="TTS returned empty audio")
    except HTTPException:
        raise
    except _asyncio.CancelledError:
        # Client disconnected or worker is shutting down (e.g. reload).
        # Re-raise so uvicorn handles the cancellation cleanly — do NOT wrap in 502.
        print(f"[TTS] Request cancelled (client disconnect or server reload)")
        await interview_telemetry.log(
            data.session_id or "system",
            "api.tts_cancelled",
            source="backend.api",
            level="warn",
            text_chars=len(data.text),
        )
        raise
    except Exception as e:
        import traceback
        print(f"[TTS] Synthesis failed — provider={tts_service.provider}, type={type(e).__name__}, msg={str(e)[:300]}")
        traceback.print_exc()
        await interview_telemetry.log(
            data.session_id or "system",
            "api.tts_failed",
            source="backend.api",
            level="error",
            text_chars=len(data.text),
            provider=tts_service.provider,
            error_type=type(e).__name__,
            error=str(e)[:300],
            elapsed_ms=round((time.perf_counter() - started) * 1000, 3),
        )
        raise HTTPException(status_code=502, detail=f"TTS unavailable: {str(e)[:120]}")

    elapsed_ms = round((time.perf_counter() - started) * 1000, 3)
    print(f"[TTS] Live synthesis via provider={provider_used} in {elapsed_ms}ms ({len(audio_bytes)} bytes)")
    await interview_telemetry.log(
        data.session_id or "system",
        "api.tts",
        source="backend.api",
        text_chars=len(data.text),
        source_kind="live",
        provider=provider_used,
        media_type=media_type,
        audio_bytes=len(audio_bytes),
        elapsed_ms=elapsed_ms,
    )

    return Response(
        content=audio_bytes,
        media_type=media_type,
        headers={
            "Cache-Control": "no-cache",
            "X-TTS-Source": "live",
            "X-TTS-Provider": provider_used,
        },
    )


# ─────────────────────────────────────────────
# STATE & REPORTING
# ─────────────────────────────────────────────

@router.get("/sessions")
async def get_sessions():
    """All completed interviews for recruiter dashboard."""
    from backend.db.postgres import list_sessions
    rows = await list_sessions()
    # Convert datetime to ISO string for JSON serialisation
    for r in rows:
        if hasattr(r.get("created_at"), "isoformat"):
            r["created_at"] = r["created_at"].isoformat()
    return rows


@router.get("/state/{session_id}")
async def get_state(session_id: str):
    try:
        return await orchestrator.get_session_state(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")


@router.get("/report/{session_id}")
async def get_report(session_id: str):
    try:
        state = await orchestrator.get_session_state(session_id)
    except KeyError:
        # Redis expired or service restarted — try Postgres durable store before 404ing.
        from backend.db.postgres import get_session_report
        pg_report = await get_session_report(session_id)
        if pg_report:
            return pg_report
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")

    evaluation = state.get("final_evaluation") or {}
    weaknesses = state.get("weaknesses", [])

    weakness_by_type: dict[str, int] = {}
    for w in weaknesses:
        t = w.get("type", "unknown")
        weakness_by_type[t] = weakness_by_type.get(t, 0) + 1

    return {
        "session_id": session_id,
        "complete": state.get("interview_complete", False),
        "target_role": state.get("target_role", ""),
        "years_experience": state.get("years_experience", ""),
        "total_questions": state.get("question_count", 0),
        "overall_score": evaluation.get("overall_score"),
        "hire_recommendation": evaluation.get("hire_recommendation"),
        "confidence_score": evaluation.get("confidence_score"),
        "summary": evaluation.get("summary"),
        "strengths": evaluation.get("strengths", []),
        "risk_flags": evaluation.get("risk_flags", []),
        "untested_dimensions": evaluation.get("untested_dimensions", []),
        "claim_credibility_risk": evaluation.get("claim_credibility_risk", {"level": "not_tested", "detail": ""}),
        "scores": evaluation.get("breakdown", state.get("scores", {})),
        "failure_surface": evaluation.get("failure_surface", state.get("failure_surface", {})),
        "weakness_summary": weakness_by_type,
        "raw_weaknesses": weaknesses,
    }
