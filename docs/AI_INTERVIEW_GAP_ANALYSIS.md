# AI Interview System — Gap Analysis

Compare the [HireVue/Talview-style PRD](#) with ProvenHire's current implementation.

---

## Design Decision: Audio Only (No Video Storage)

**Storage constraint:** Video consumes 10–20× more storage than audio. ProvenHire stores **audio only** for interview answers.

| Stored | Purpose |
|--------|---------|
| **Audio** | Candidate answer; uploaded and stored for transcript/audit |
| **Transcript** | From Web Speech API (live) or future Whisper; used for LLM evaluation |
| **Video** | Not stored; used only for live proctoring (camera must be on) |

**Storage impact:** ~5–10 MB per 10-min answer vs ~100–200 MB for video.

---

## Executive Summary

| Aspect | Spec | ProvenHire Current | Gap |
|--------|------|-------------------|-----|
| **Question flow** | Admin creates → TTS → audio plays | LLM generates questions on-the-fly; no TTS | No admin question bank; no TTS |
| **Recording** | MediaRecorder (audio+video) | Audio-only recording + Web Speech API transcript | ✅ Audio stored; no video |
| **Storage** | S3 (audio/video) | Local uploads (audio only) | Audio in uploads/; no S3 |
| **STT** | OpenAI Whisper (post-upload) | Web Speech API (live) + stored audio for future Whisper | Transcript from live; audio for backup |
| **Evaluation** | LLM + communication + proctoring scores | LLM evaluation only | No communication analysis pipeline |
| **Proctoring** | Mediapipe, OpenCV, gaze, tab-switch | Tensorflow/risk scoring, sound detection | Partial; no face mesh/gaze |
| **Database** | MongoDB | PostgreSQL (Prisma) | Different schema |
| **Queue** | BullMQ + Redis | None (sync processing) | No async job pipeline |
| **Report** | Full dashboard with breakdown | Basic score + verdict in verification | Limited report UI |

---

## What ProvenHire Has Today

### ✅ Implemented

1. **Interview engine**
   - LLM-generated questions (Gemini) based on role
   - Multi-turn Q&A with follow-ups
   - `Interview` + `InterviewMessage` models (PostgreSQL)

2. **Recording & media**
   - MediaRecorder for audio/video
   - Web Speech API for live transcript
   - Camera/mic controls in `ExpertInterviewStage`

3. **Proctoring**
   - Tab switching (`document.visibilitychange`)
   - Sound detection (background voice)
   - Risk scoring (`useProctoringRiskMonitor`)
   - Proctoring events logged to DB

4. **AI evaluation**
   - `evaluateInterview(transcript)` via Gemini
   - Returns: concept_score, communication_score, reasoning_score, confidence_score, strengths, weaknesses, verdict

5. **Verification pipeline**
   - Profile → Aptitude → DSA → AI Expert Interview → Human (5+ yrs)
   - Integrated into job seeker flow

6. **Storage**
   - Local `server/uploads/` for resumes and **interview audio** (no video)
   - Daily.co for video calls (human interview; ephemeral, not stored)
   - Audio-only for AI interview answers (~5–10 MB per answer)

---

## What the Spec Requires vs Current State

### 1. Admin Question Bank + TTS

| Spec | Current |
|------|---------|
| Admin creates questions | No admin UI for questions |
| TTS (ElevenLabs/Polly/Google TTS) | No TTS; questions shown as text |
| Question audio played to candidate | Questions are text; candidate reads |

**Gap:** Need admin CRUD for questions, TTS integration, and question audio playback.

---

### 2. Speech-to-Text

| Spec | Current |
|------|---------|
| OpenAI Whisper on uploaded audio | Web Speech API (live in-browser only) |
| Transcript stored after recording | Live transcript sent with answer |
| Batch processing in worker | Sync processing in API |

**Gap:** Add Whisper (or similar) for uploaded audio; move to async worker for accuracy.

---

### 3. Storage (Audio Only)

| Spec | Current |
|------|---------|
| AWS S3 for audio/video | Local `uploads/` for **audio only** |
| Video storage | **Intentionally omitted** — saves 10–20× storage |

**Design:** Store only audio in `uploads/`. Video used for live proctoring only; not persisted. `InterviewMessage.audioUrl` stores path to uploaded audio.

---

### 4. Communication Analysis

| Spec | Current |
|------|---------|
| Speech rate, filler words, pauses, confidence | Not implemented |
| pyAudioAnalysis / SpeechBrain | N/A |
| fluency_score, clarity_score, confidence_score | LLM infers these; no audio metrics |

**Gap:** Add Python microservice or Node-based audio analysis for communication metrics.

---

### 5. Proctoring Enhancement

| Spec | Current |
|------|---------|
| Mediapipe Face Mesh (face detection) | Basic risk scoring; no face mesh |
| Eye tracking / gaze (OpenCV) | Not implemented |
| Multiple faces, face missing | Not implemented |
| Tab switching | ✅ Implemented |
| Noise / background speech | ✅ Sound detection |

**Gap:** Add face detection, gaze tracking, multi-face detection (Tensorflow.js / Mediapipe on frontend, or Python service).

---

### 6. Queue Architecture

| Spec | Current |
|------|---------|
| BullMQ + Redis | No queue; sync processing |
| Async: upload → job → STT → eval → report | All in request/response |
| Scalable for thousands of interviews | Single-instance processing |

**Gap:** Add Redis + BullMQ (or similar) for async job pipeline.

---

### 7. Database Schema

| Spec (MongoDB) | Current (PostgreSQL) |
|----------------|---------------------|
| questions | No dedicated table; questions from LLM |
| interviews | ✅ Interview (different shape) |
| answers | InterviewMessage (text; no audio_url, video_url) |
| reports | scoreBreakdown in Interview; no separate report |

**Gap:** Extend schema with `audio_url`, `video_url`, `transcript`, detailed scores; optional `questions` table.

---

### 8. Report Dashboard

| Spec | Current |
|------|---------|
| Overall, technical, communication, proctoring scores | Basic scoreBreakdown in Interview |
| Transcript + AI feedback | Partial in verification results |
| Full candidate report UI | Limited in job seeker/recruiter dashboards |

**Gap:** Dedicated report UI with full breakdown, transcript, feedback, and export.

---

## Recommended Implementation Order

### Phase 1 — Align with Spec (MVP)

1. **Question bank (admin)**
   - CRUD for questions (text, difficulty, skills)
   - Store in DB; optional TTS for playback later

2. **S3 (or compatible) storage**
   - Store candidate audio/video
   - Add `audio_url`, `video_url` to answers

3. **Whisper for STT**
   - Call Whisper API on uploaded audio
   - Store transcript in DB
   - Run in background (queue or fire-and-forget)

### Phase 2 — Async + Evaluation

4. **Redis + BullMQ**
   - Job: answer upload → STT → LLM eval → report
   - Decouple from HTTP request

5. **Scoring formula**
   - technical_score (50%) + communication_score (30%) + proctoring_score (20%)
   - Persist per-answer and aggregate

### Phase 3 — Advanced

6. **TTS for questions**
   - Integrate ElevenLabs/Polly/Google TTS
   - Generate and store question audio

7. **Communication analysis**
   - Python microservice or Node library for fluency/clarity from audio

8. **Proctoring upgrade**
   - Face detection (Mediapipe/Tensorflow.js)
   - Gaze tracking if feasible

9. **Report dashboard**
   - Full report UI for recruiters/admins

---

## Tech Stack Comparison

| Component | Spec | ProvenHire |
|-----------|------|------------|
| Frontend | Next.js/React | React (Vite) ✅ |
| Backend | NestJS | Express ✅ |
| DB | MongoDB | PostgreSQL ✅ |
| Storage | S3 | Local + Daily.co |
| Queue | BullMQ + Redis | None |
| STT | Whisper | Web Speech API |
| TTS | ElevenLabs/Polly/Google | None |
| LLM | OpenAI/Claude/Gemini | Gemini ✅ |
| Proctoring | Mediapipe, OpenCV | Risk scoring, sound detection |
| ML services | Python (OpenCV, etc.) | None |

---

## Conclusion

ProvenHire already has:
- LLM-driven interview flow
- Recording and live transcript
- Basic proctoring
- AI evaluation

To match the spec, the main gaps are:
1. **Admin question bank + TTS**
2. **Whisper-based STT** (vs live only)
3. **S3 (or similar) for audio/video**
4. **Redis + BullMQ** for async processing
5. **Communication analysis** microservice
6. **Stronger proctoring** (face/gaze)
7. **Report dashboard** with full breakdown

The current system works for an MVP; the spec describes a more scalable, HireVue-style platform.
