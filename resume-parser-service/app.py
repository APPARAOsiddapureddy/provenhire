"""
Resume Parser API - port 8000 (VITE_LOCAL_RESUME_PARSER_URL).
Optimized for diverse resumes (Indian names, CV/Resume formats, multi-section).
Accepts file upload (PDF/DOCX) or JSON { "resumeText": "..." }. Uses OpenAI.
"""
import os
import re
import json
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from PyPDF2 import PdfReader
except ImportError:
    PdfReader = None
try:
    import docx
except ImportError:
    docx = None

app = FastAPI(title="Resume Parser API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Reuse a single OpenAI client
_openai_client = None

def get_openai_client():
    global _openai_client
    if _openai_client is None and os.environ.get("OPENAI_API_KEY"):
        try:
            from openai import OpenAI
            _openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        except Exception:
            pass
    return _openai_client


class ParseBody(BaseModel):
    resumeText: str | None = None


class ContactInfo(BaseModel):
    location: str = ""
    phone_number: str = ""
    email_address: str = ""
    personal_urls: list[str] = []


class WorkExperience(BaseModel):
    company_name: str = ""
    job_title: str = ""
    start_date: str = ""
    end_date: str = ""
    description: str = ""


class Education(BaseModel):
    qualification: str = ""
    establishment: str = ""
    country: str = ""
    year: str = ""


class ParserOutput(BaseModel):
    candidate_name: str = ""
    job_title: str = ""
    bio: str = ""
    contact_info: ContactInfo = ContactInfo()
    work_output: list[WorkExperience] = []
    skills: list[str] = []
    education: list[Education] = []
    professional_development: list[str] = []
    other_info: list[str] = []


def normalize_resume_text(text: str) -> str:
    """Clean and normalize resume text for better extraction."""
    if not text or not text.strip():
        return ""
    # Normalize line breaks and collapse excessive spaces
    text = re.sub(r"\r\n|\r", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    return "\n".join(lines)


def extract_text_from_pdf(path: str) -> str:
    if not PdfReader:
        raise RuntimeError("PyPDF2 not installed")
    reader = PdfReader(path)
    parts = []
    for page in reader.pages:
        t = page.extract_text()
        if t:
            parts.append(t)
    return "\n".join(parts)


def extract_text_from_docx(path: str) -> str:
    if not docx:
        raise RuntimeError("python-docx not installed")
    doc = docx.Document(path)
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def extract_text_from_file(file_path: str, content_type: str = "") -> str:
    path = Path(file_path)
    suffix = path.suffix.lower()
    if suffix == ".pdf" or "pdf" in (content_type or ""):
        return extract_text_from_pdf(file_path)
    if suffix in (".docx", ".doc") or "word" in (content_type or ""):
        return extract_text_from_docx(file_path)
    if suffix == ".txt":
        return path.read_text(encoding="utf-8", errors="replace")
    return path.read_text(encoding="utf-8", errors="replace")


RESUME_EXTRACTION_PROMPT = """You are an expert resume parser. Extract structured data from the resume text below.

Rules:
- full_name: Use the candidate's full name as written (e.g. Sri Hari Charan Melam, Aakash Milind Mohikar, Venkata Siva Apparao). Ignore filename; use the name from the document.
- email: Any email address. Must be valid format.
- phone: Primary phone (with country code if present). Digits and + only, or as written.
- location: City, State/Country or full address if given.
- linkedin_url, portfolio_url: Full URLs from the resume (LinkedIn, GitHub, portfolio, etc.).
- bio: Short summary or objective (2-4 sentences). Empty if none.
- college: University/College/Institute name from Education.
- degree: Degree name (e.g. B.Tech, MCA, B.E., MBA).
- field_of_study: Branch/stream (e.g. Computer Science, ECE).
- graduation_year: Year of graduation (number or string).
- cgpa: GPA/CGPA/percentage if mentioned.
- experience_years: Total years of experience (number) if stated; else infer from work dates.
- current_company: Most recent employer name.
- current_role: Most recent job title.
- notice_period: If mentioned (e.g. "2 weeks", "Immediate").
- expected_salary: If mentioned; else empty.
- skills: List of technical and soft skills (technologies, tools, languages). Deduplicate.
- actively_looking_roles: Desired roles or job titles from resume; else use current_role.
- projects: Project names or short descriptions. Array of strings.
- hobbies: Only if clearly a hobby/interests section.
- certifications: Certifications, courses, awards. Array of strings.
- languages: Languages spoken (e.g. English, Hindi, Telugu). Array of strings.

Return a single JSON object with these exact keys. Use empty string "" or [] for missing values. No markdown, no comments."""


def sanitize_parsed(data: dict) -> dict:
    """Ensure types and strip strings."""
    out = {}
    for k, v in data.items():
        if v is None:
            out[k] = "" if k not in ("skills", "projects", "hobbies", "certifications", "languages", "actively_looking_roles") else []
        elif isinstance(v, str):
            out[k] = v.strip()
        elif isinstance(v, list):
            out[k] = [str(x).strip() for x in v if str(x).strip()]
        elif isinstance(v, (int, float)):
            if k in ("graduation_year", "experience_years"):
                out[k] = str(int(v)) if v == int(v) else str(v)
            else:
                out[k] = v
        else:
            out[k] = v
    return out


def openai_parse(resume_text: str) -> dict:
    """Extract structured resume data via OpenAI. Returns flat dict for ProvenHire form."""
    client = get_openai_client()
    if not client:
        return {}
    text = normalize_resume_text(resume_text)
    if len(text) < 30:
        return {}
    # Cap input to avoid token limits
    text_slice = text[:14000]
    prompt = RESUME_EXTRACTION_PROMPT + "\n\nResume text:\n" + text_slice + "\n\nJSON:"
    for attempt in range(2):
        try:
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
            )
            content = (resp.choices[0].message.content or "").strip()
            if not content:
                continue
            if content.startswith("```"):
                parts = content.split("```")
                for p in parts:
                    p = p.strip()
                    if p.lower().startswith("json"):
                        p = p[4:].strip()
                    if p.startswith("{"):
                        content = p
                        break
            if content.startswith("{"):
                data = json.loads(content)
                return sanitize_parsed(data)
        except json.JSONDecodeError:
            continue
        except Exception:
            if attempt == 1:
                return {}
            continue
    return {}


def parser_output_to_flat(output: ParserOutput) -> dict:
    """Map GitHub-style Pydantic output to ProvenHire flat form."""
    c = output.contact_info or ContactInfo()
    work = output.work_output or []
    edu = output.education or []
    flat = {
        "full_name": (output.candidate_name or "").strip(),
        "email": (c.email_address or "").strip(),
        "phone": (c.phone_number or "").strip(),
        "location": (c.location or "").strip(),
        "bio": (output.bio or "").strip(),
        "skills": list(output.skills) if output.skills else [],
        "certifications": list(output.professional_development) if output.professional_development else [],
        "languages": [],
        "hobbies": [],
        "projects": [],
        "actively_looking_roles": [output.job_title] if output.job_title else [],
        "college": "",
        "degree": "",
        "field_of_study": "",
        "graduation_year": "",
        "cgpa": "",
        "experience_years": "",
        "current_company": "",
        "current_role": "",
        "notice_period": "",
        "expected_salary": "",
        "linkedin_url": "",
        "portfolio_url": "",
    }
    if c.personal_urls:
        for u in c.personal_urls:
            u = (u or "").strip()
            if "linkedin" in u.lower():
                flat["linkedin_url"] = u
            elif u and not flat["portfolio_url"]:
                flat["portfolio_url"] = u
    if work:
        flat["current_company"] = work[0].company_name or ""
        flat["current_role"] = work[0].job_title or ""
    if edu:
        flat["college"] = edu[0].establishment or ""
        flat["degree"] = edu[0].qualification or ""
        flat["graduation_year"] = edu[0].year or ""
    if output.other_info:
        flat["hobbies"] = [s.strip() for s in output.other_info if s and s.strip()]
    return flat


@app.post("/parse")
async def parse_resume(
    file: UploadFile = File(None),
    body: ParseBody = Body(None),
):
    """Accept multipart file (PDF/DOCX) or JSON body { \"resumeText\": \"...\" }."""
    text = ""
    if file and file.filename:
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        try:
            text = extract_text_from_file(tmp_path, file.content_type or "")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not extract text from file: {e}")
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
    if (not text or len(text.strip()) < 20) and body and getattr(body, "resumeText", None):
        text = (body.resumeText or "").strip()
    if not text or len(text.strip()) < 20:
        raise HTTPException(status_code=400, detail="No resume text: upload a PDF/DOCX or send JSON body with resumeText.")
    text = normalize_resume_text(text)
    result = openai_parse(text)
    if not result:
        return {"data": parser_output_to_flat(ParserOutput())}
    return {"data": result}


@app.get("/health")
def health():
    return {"status": "ok", "service": "resume-parser"}
