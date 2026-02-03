import json
import os
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Dict, List, Optional

from llama_cpp import Llama

MODEL_PATH = os.getenv(
    "RESUME_PARSER_MODEL",
    os.path.join(os.path.dirname(__file__), "models", "qwen2.5-1.5b-instruct-q4_k_m.gguf"),
)
CTX_SIZE = int(os.getenv("RESUME_PARSER_CTX", "2048"))
MAX_TOKENS = int(os.getenv("RESUME_PARSER_MAX_TOKENS", "900"))
THREADS = int(os.getenv("RESUME_PARSER_THREADS", "4"))
HOST = os.getenv("RESUME_PARSER_HOST", "127.0.0.1")
PORT = int(os.getenv("RESUME_PARSER_PORT", "8000"))

SYSTEM_PROMPT = (
    "You are a resume parser. Extract the fields exactly in JSON. "
    "Return only JSON, no markdown, no extra text."
)

USER_PROMPT = """Extract candidate data from the resume text below.
Return JSON with this exact schema and keys:
{
  "full_name": "",
  "email": "",
  "linkedin_url": "",
  "portfolio_url": "",
  "phone": "",
  "location": "",
  "skills": [],
  "college": "",
  "degree": "",
  "field_of_study": "",
  "graduation_year": 0,
  "cgpa": "",
  "experience_years": 0,
  "current_company": "",
  "current_role": "",
  "notice_period": "",
  "expected_salary": "",
  "actively_looking_roles": [],
  "projects": [{"name":"","description":"","link":"","technologies":[]}],
  "hobbies": [],
  "certifications": [],
  "languages": [],
  "bio": ""
}
Rules:
- Use empty strings or empty arrays when not found.
- graduation_year and experience_years must be numbers (0 if unknown).
- Only return valid JSON.

Resume text:
"""


_llm: Optional[Llama] = None


def get_llm() -> Llama:
    global _llm
    if _llm is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(
                f"Model not found at {MODEL_PATH}. Run download_model.py to fetch it."
            )
        _llm = Llama(
            model_path=MODEL_PATH,
            n_ctx=CTX_SIZE,
            n_threads=THREADS,
            n_gpu_layers=0,
            verbose=False,
        )
    return _llm


def _extract_json(text: str) -> Dict[str, Any]:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        raise ValueError("No JSON object found in model response")
    return json.loads(match.group(0))


def _coerce_list(value: Any) -> List[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        items = [v.strip() for v in re.split(r"[,;\n]", value) if v.strip()]
        return items
    return []


def _normalize_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    normalized = {**payload}
    for key in [
        "skills",
        "actively_looking_roles",
        "projects",
        "hobbies",
        "certifications",
        "languages",
    ]:
        normalized[key] = _coerce_list(normalized.get(key))

    if not isinstance(normalized.get("projects"), list):
        normalized["projects"] = []

    try:
        normalized["graduation_year"] = int(normalized.get("graduation_year") or 0)
    except (TypeError, ValueError):
        normalized["graduation_year"] = 0

    try:
        normalized["experience_years"] = int(normalized.get("experience_years") or 0)
    except (TypeError, ValueError):
        normalized["experience_years"] = 0

    for key in [
        "full_name",
        "email",
        "linkedin_url",
        "portfolio_url",
        "phone",
        "location",
        "college",
        "degree",
        "field_of_study",
        "cgpa",
        "current_company",
        "current_role",
        "notice_period",
        "expected_salary",
        "bio",
    ]:
        value = normalized.get(key)
        normalized[key] = value.strip() if isinstance(value, str) else ""

    return normalized


class ResumeParserHandler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: Dict[str, Any]) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.end_headers()

    def do_POST(self) -> None:
        if self.path != "/parse":
            self._send_json(404, {"error": "Not found"})
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length).decode("utf-8")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON"})
            return

        resume_text = payload.get("resumeText", "")
        if not isinstance(resume_text, str) or not resume_text.strip():
            self._send_json(400, {"error": "resumeText is required"})
            return

        llm = get_llm()
        prompt = USER_PROMPT + resume_text[:1500]
        response = llm.create_chat_completion(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=MAX_TOKENS,
        )
        content = response["choices"][0]["message"]["content"]
        extracted = _extract_json(content)
        normalized = _normalize_payload(extracted)
        self._send_json(200, {"data": normalized})


def run() -> None:
    server = HTTPServer((HOST, PORT), ResumeParserHandler)
    print(f"Local resume parser running at http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    run()
