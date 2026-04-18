"""
Question bank wrapper.
Loads ml_questions.json, builds FAISS index at startup, exposes retrieve().
"""
import json
import os
from backend.rag import faiss_store

_loaded = False


def load():
    """Load questions and build FAISS index. Idempotent — safe to call multiple times."""
    global _loaded
    if _loaded:
        return
    path = os.path.join(
        os.path.dirname(__file__), "..", "data", "question_bank", "ml_questions.json"
    )
    path = os.path.normpath(path)
    with open(path) as f:
        questions = json.load(f)
    faiss_store.build_index(questions)
    _loaded = True


def retrieve(query: str, sprint: int | None = None, top_k: int = 2) -> list[dict]:
    """
    Retrieve up to top_k questions most relevant to query, optionally filtered by sprint.
    Returns empty list if bank hasn't been loaded or FAISS unavailable.
    """
    if not _loaded:
        return []
    return faiss_store.search(query, sprint=sprint, top_k=top_k)
