# Resume Parser Service (port 8000)

Runs on **port 8000** (same as `VITE_LOCAL_RESUME_PARSER_URL`). You do **not** need to use the GitHub repo’s Streamlit port (8501).

- Accepts **file upload** (PDF/DOCX) or JSON `{ "resumeText": "..." }`.
- Uses **OpenAI** to extract structured fields (compatible with the idea of [Resume-Parser](https://github.com/Sajjad-Amjad/Resume-Parser)).
- Returns JSON that the ProvenHire profile form uses for auto-fill.

## Setup

```bash
cd resume-parser-service
pip install -r requirements.txt
```

Create a `.env` in this folder (or export):

```env
OPENAI_API_KEY=your_openai_api_key_here
```

## Run

```bash
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

Then in the ProvenHire app `.env`:

```env
VITE_LOCAL_RESUME_PARSER_URL=http://127.0.0.1:8000
```

## API

- **POST /parse**
  - **Multipart:** `file` = PDF or DOCX → server extracts text and calls OpenAI.
  - **JSON:** `{ "resumeText": "..." }` → server calls OpenAI on that text.
- **GET /health** → `{ "status": "ok" }`

## Using the GitHub Resume-Parser repo instead

If you prefer to run [Sajjad-Amjad/Resume-Parser](https://github.com/Sajjad-Amjad/Resume-Parser):

1. Clone that repo and run their parser (CLI or add a small API that returns JSON).
2. Expose an HTTP endpoint (e.g. on port 8000) that accepts a file or `resumeText` and returns the same JSON shape (or their Pydantic shape; the frontend maps it).
3. Set `VITE_LOCAL_RESUME_PARSER_URL` to that base URL.

The ProvenHire frontend supports both the flat shape (`full_name`, `email`, …) and the GitHub-style shape (`candidate_name`, `contact_info`, `work_output`, `skills`, `education`, `professional_development`, `other_info`) and maps them to the form.
