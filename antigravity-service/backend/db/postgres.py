import logging
import os
import time
import asyncpg

_pool: asyncpg.Pool | None = None
_last_connect_error: str | None = None
_disabled_until = 0.0

_LOGGER = logging.getLogger(__name__)
_RETRY_COOLDOWN_SECS = 60


async def _mark_unavailable(exc: Exception):
    global _pool, _last_connect_error, _disabled_until
    if _pool is not None:
        try:
            await _pool.close()
        except Exception:
            pass
        _pool = None
    _disabled_until = time.time() + _RETRY_COOLDOWN_SECS
    message = f"{type(exc).__name__}: {exc}"
    if message != _last_connect_error:
        _LOGGER.warning(
            "Postgres unavailable; disabling DB-backed features for %ss. Reason: %s",
            _RETRY_COOLDOWN_SECS,
            message,
        )
        _last_connect_error = message


async def get_pool() -> asyncpg.Pool | None:
    global _pool, _last_connect_error
    if _pool is not None:
        return _pool

    if time.time() < _disabled_until:
        return None

    if _pool is None:
        try:
            _pool = await asyncpg.create_pool(
                dsn=os.environ.get("DATABASE_URL", "postgresql://localhost/antigravity"),
                min_size=2,
                max_size=10,
            )
            if _last_connect_error is not None:
                _LOGGER.info("Postgres connection restored; DB-backed features re-enabled.")
                _last_connect_error = None
        except Exception as exc:
            await _mark_unavailable(exc)
            return None
    return _pool


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


async def init_schema():
    """Create tables if they don't exist. Called at app startup."""
    pool = await get_pool()
    if pool is None:
        return False
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                session_id          TEXT PRIMARY KEY,
                created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                resume_snippet      TEXT,
                hire_recommendation TEXT,
                overall_score       NUMERIC(4,1),
                sprint_reached      INTEGER,
                duration_minutes    NUMERIC(5,1)
            )
        """)
    return True


async def persist_session(
    session_id: str,
    resume_snippet: str,
    hire_recommendation: str,
    overall_score: float,
    sprint_reached: int,
    duration_minutes: float,
):
    """Write completed session to Postgres. Called once at end_session()."""
    pool = await get_pool()
    if pool is None:
        return False
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO sessions (session_id, resume_snippet, hire_recommendation, overall_score, sprint_reached, duration_minutes)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (session_id) DO UPDATE SET
                    hire_recommendation = EXCLUDED.hire_recommendation,
                    overall_score       = EXCLUDED.overall_score,
                    sprint_reached      = EXCLUDED.sprint_reached,
                    duration_minutes    = EXCLUDED.duration_minutes
                """,
                session_id,
                resume_snippet[:200] if resume_snippet else "",
                hire_recommendation,
                overall_score,
                sprint_reached,
                duration_minutes,
            )
        return True
    except Exception as exc:
        await _mark_unavailable(exc)
        return False


async def list_sessions() -> list[dict]:
    """Returns all completed sessions for the recruiter dashboard."""
    pool = await get_pool()
    if pool is None:
        return []
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM sessions ORDER BY created_at DESC"
            )
    except Exception as exc:
        await _mark_unavailable(exc)
        return []
    return [dict(r) for r in rows]
