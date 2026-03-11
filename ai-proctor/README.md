# ProvenHire AI Proctoring Service

Python FastAPI microservice for vision-based proctoring: face detection, phone detection, person count, gaze estimation.

## Setup

```bash
cd ai-proctor
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

First run downloads YOLOv8n (~6MB) from Ultralytics.

## Run

```bash
uvicorn api:app --host 0.0.0.0 --port 8001
```

## Endpoints

- `POST /vision/analyze` — accepts `{ "frame": "base64_image" }`, returns detection result
- `GET /health` — health check

## Response (POST /vision/analyze)

```json
{
  "face_detected": true,
  "person_count": 1,
  "phone_detected": false,
  "looking_direction": "CENTER",
  "mouth_open": false,
  "spoof_detected": false,
  "confidence": 0.85
}
```

## Environment

- No env vars required by default.
- Backend sets `AI_PROCTOR_URL` (default `http://127.0.0.1:8001`) to reach this service.
