"""
FAISS-backed question retrieval.
Embeds questions with sentence-transformers (all-MiniLM-L6-v2 — ~80MB, CPU-friendly).
Built at startup. search() returns nearest questions by cosine similarity.
"""
import json
import os
from typing import Any

try:
    import numpy as np
except ImportError:
    np = None  # Mocked out for lightweight Vercel Serverless deployments

_index = None           # faiss.IndexFlatIP (inner product = cosine on normalised vectors)
_questions: list[dict] = []
_embeddings: Any = None


def _get_model():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer("all-MiniLM-L6-v2")


def build_index(questions: list[dict]) -> None:
    """Embed all questions and build the FAISS index. Called once at startup."""
    global _index, _questions, _embeddings
    import faiss

    _questions = questions
    texts = [q["text"] for q in questions]

    model = _get_model()
    vecs = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    _embeddings = vecs.astype("float32")

    dim = _embeddings.shape[1]
    _index = faiss.IndexFlatIP(dim)   # inner product on L2-normalised = cosine similarity
    _index.add(_embeddings)


def search(query: str, sprint: int | None = None, top_k: int = 3) -> list[dict]:
    """
    Return top_k questions most similar to query.
    If sprint is given, filters candidates to that sprint before ranking.
    Falls back gracefully to empty list if index isn't built yet.
    """
    if _index is None or not _questions:
        return []

    model = _get_model()
    q_vec = model.encode([query], normalize_embeddings=True, show_progress_bar=False).astype("float32")

    # Search over full index, fetch more than top_k to allow sprint filtering
    fetch_k = min(len(_questions), top_k * 4)
    distances, indices = _index.search(q_vec, fetch_k)

    results = []
    for idx in indices[0]:
        if idx == -1:
            continue
        q = _questions[idx]
        if sprint is not None and q.get("sprint") != sprint:
            continue
        results.append(q)
        if len(results) >= top_k:
            break

    return results
