import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    root = Path(__file__).resolve().parent
    for env_file in [root.parent / ".env", root.parent / ".env.local", root / ".env", root / ".env.local"]:
        if env_file.exists():
            load_dotenv(env_file, override=True)
except ImportError:
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from backend.api.routes import router, tts_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await tts_service.warm_filler_cache()
    except Exception:
        pass

    try:
        from backend.db.postgres import init_schema
        await init_schema()
    except Exception:
        pass

    try:
        import asyncio
        from backend.rag import question_bank
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, question_bank.load)
    except Exception:
        pass

    yield


app = FastAPI(title="Antigravity — Adversarial Interview Service", lifespan=lifespan)

_origins = os.getenv("ANTIGRAVITY_CORS_ORIGINS", "").split(",")
_default_origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:4173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
]
allow_origins = [o.strip() for o in _origins if o.strip()] or _default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")
