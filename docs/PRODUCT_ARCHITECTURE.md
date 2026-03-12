# ProvenHire Product Architecture

> AI-powered talent verification and hiring platform — builds a trusted pool of verified candidates through automated assessment layers.

---

## 1. High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    CLIENT LAYER                                          │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │  Candidate App   │  │  Recruiter App    │  │   Admin Dashboard │  │  Interview UI   │ │
│  │  (Signup/Login)  │  │  (Talent Pool)    │  │  (Manage/Monitor) │  │  (Webcam + Mic) │ │
│  └────────┬─────────┘  └────────┬──────────┘  └────────┬──────────┘  └────────┬────────┘ │
└───────────┼────────────────────┼─────────────────────┼───────────────────────┼──────────┘
            │                    │                     │                       │
            ▼                    ▼                     ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               API GATEWAY / EDGE                                        │
│                    (Vercel / CloudFlare / Load Balancer)                                │
└─────────────────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND SERVICES                                           │
├────────────────────┬────────────────────┬────────────────────┬─────────────────────────┤
│  Auth Service      │  Interview Service  │  Verification       │  Proctoring Service     │
│  - JWT/Refresh     │  - Session Mgmt     │  - Aptitude        │  - Frame API            │
│  - Email OTP       │  - Question Fetch   │  - DSA Round       │  - Events API           │
│  - RBAC            │  - Timer/Submit     │  - AI Interview   │  - Socket.io Alerts     │
└────────────────────┴────────────────────┴────────────────────┴─────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              AI MICROSERVICES (Python)                                   │
├────────────────────┬────────────────────┬────────────────────┬─────────────────────────┤
│  AI Proctor        │  Speech-to-Text    │  AI Evaluation     │  LLM Orchestrator       │
│  (OpenCV + YOLO)   │  (Whisper)         │  (Gemini/OpenAI)    │  (Question Gen)         │
│  - Face/phone      │  - Transcript      │  - Answer scoring   │  - Job-fit analysis     │
│  - Gaze/spoof      │  - Diarization     │  - Feedback         │  - Report generation    │
└────────────────────┴────────────────────┴────────────────────┴─────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                                 │
├────────────────────┬────────────────────┬────────────────────┬─────────────────────────┤
│  PostgreSQL        │  Local Storage      │  (Future: S3)       │  (Future: Redis)        │
│  - Users, Auth     │  - Screenshots      │  - Media archive    │  - Session cache       │
│  - Interviews      │  - Temp recordings  │  - Reports          │  - Real-time state     │
└────────────────────┴────────────────────┴────────────────────┴─────────────────────────┘
```

---

## 2. Core Services / Modules

| Service | Responsibility | Tech |
|---------|----------------|------|
| **Auth** | Signup, login, email OTP, JWT, RBAC (jobseeker, recruiter, admin, expert) | Node.js + Express |
| **Interview Engine** | Session lifecycle, question delivery, timer, response submission | Node.js + Express |
| **Verification Pipeline** | Aptitude, DSA, AI Interview, Expert stages, scoring | Node.js + Express |
| **Proctoring** | Frame ingestion, AI analysis, violation storage, real-time alerts | Node.js + Python (FastAPI) |
| **Media Processing** | Upload, transcription, evaluation pipeline | Python + Whisper + LLM |
| **AI Evaluation** | Answer scoring, skill analysis, feedback, reports | Python + Gemini/OpenAI |
| **Admin** | Questions, monitoring, results, proctoring review, reports | Node.js + Express |

---

## 3. Data Flow Between Services

```
Candidate Signs Up
       │
       ▼
┌──────────────┐     email-verification/send      ┌──────────────┐
│   Frontend   │ ──────────────────────────────► │  Auth API    │
│   (Auth)     │                                   │              │
└──────────────┘                                   └──────┬───────┘
       │                                                    │
       │     devCode + message                              │ prisma.create
       │ ◄─────────────────────────────────────────         │ (EmailVerificationCode)
       │                                                    ▼
       │                                             ┌──────────────┐
       │     email-verification/verify                │  PostgreSQL  │
       │ ──────────────────────────────►             └──────────────┘
       │
       ▼
┌──────────────┐     POST /api/auth/register       ┌──────────────┐
│   Frontend   │ ──────────────────────────────►   │  Auth API    │
└──────────────┘                                   └──────┬───────┘
       │                                                    │
       │     JWT + user                                     │ create User + Profile
       │ ◄─────────────────────────────────────────         ▼
       │                                             ┌──────────────┐
       │                                             │  PostgreSQL  │
       └─────────────────────────────────────────────┴──────────────┘
```

```
Interview Session Start
       │
       ▼
┌──────────────┐     POST /api/proctor/frame      ┌──────────────┐
│  Webcam      │ ─────────────────────────────►  │  Proctor API │
│  (1 fps)     │     base64 image                 │              │
└──────────────┘                                   └──────┬───────┘
       │                                                    │
       │                                                    │ POST /vision/analyze
       │                                                    ▼
       │                                             ┌──────────────┐
       │                                             │  AI Proctor │
       │                                             │  (Python)   │
       │                                             └──────┬──────┘
       │                                                    │
       │                                                    │ face, phone, gaze...
       │                                                    ▼
       │                                             ┌──────────────┐
       │     Socket.io proctor:event                 │  Save frame  │
       │ ◄───────────────────────────────────────────│  if violation│
       │                                             └──────┬──────┘
       │                                                    │
       │                                                    ▼
       │                                             ┌──────────────┐
       │                                             │  PostgreSQL  │
       │                                             │  ProctoringEvent
       └─────────────────────────────────────────────┴──────────────┘
```

---

## 4. AI Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                          AI PROCESSING PIPELINE                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────┐
  │  Raw Input  │  Video (webcam) + Audio (mic)
  └──────┬──────┘
         │
         ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  STAGE 1: INGESTION                                              │
  │  - Frame capture (1 fps, 320x240)                                │
  │  - Audio recording (MediaRecorder / WebRTC)                      │
  │  - Local temp storage → base64 / Blob                             │
  └──────┬──────────────────────────────────────────────────────────┘
         │
         ├─────────────────────────────────┬─────────────────────────────────┐
         ▼                                 ▼                                 ▼
  ┌──────────────────┐           ┌──────────────────┐           ┌──────────────────┐
  │  PROCTOR VISION  │           │  SPEECH-TO-TEXT   │           │  LLM EVALUATION  │
  │  - OpenCV faces  │           │  - Whisper API    │           │  - Gemini API    │
  │  - YOLO phone    │           │  - Transcript    │           │  - Answer scoring │
  │  - Gaze estimate │           │  - Diarization   │           │  - Skill tags     │
  │  - Spoof detect  │           │  - Timestamps    │           │  - Feedback text  │
  └────────┬─────────┘           └────────┬─────────┘           └────────┬─────────┘
           │                              │                              │
           ▼                              ▼                              ▼
  ┌──────────────────┐           ┌──────────────────┐           ┌──────────────────┐
  │  Violation Rules │           │  Transcript JSON  │           │  Score + Feedback │
  │  - LOOKING_AWAY  │           │  - Segments       │           │  - Confidence      │
  │  - PHONE_DETECTED│           │  - Speaker labels │           │  - Report          │
  │  - MULTIPLE_     │           └───────────────────┘           └───────────────────┘
  │    PERSONS       │
  └──────────────────┘
```

---

## 5. Proctoring System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        PROCTORING DETECTION ARCHITECTURE                                 │
└─────────────────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────────────────────┐
  │  FRONTEND (React)                                                                        │
  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
  │  │ useProctorFrame  │  │ useProctoring   │  │ useSound        │  │ useAntiCheat    │   │
  │  │ Capture (1 fps)  │  │ RiskMonitor     │  │ Detection       │  │ (tab/focus/keys)│   │
  │  │ 320x240 base64  │  │ (face-api.js)   │  │ (audio level)   │  │                 │   │
  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘   │
  └───────────┼────────────────────┼────────────────────┼────────────────────┼─────────────┘
              │                    │                    │                    │
              │ POST /api/proctor/ │ POST /api/         │ (local)             │ (local)
              │ frame              │ proctoring/alerts  │                     │
              ▼                    ▼                    ▼                    ▼
  ┌─────────────────────────────────────────────────────────────────────────────────────────┐
  │  BACKEND (Node.js + Express)                                                             │
  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                          │
  │  │ POST /proctor/   │  │ Proctor Service │  │ Socket.io       │                          │
  │  │ frame            │  │ - Call AI       │  │ - proctor:event │                          │
  │  │ GET /proctor/    │  │ - Save screenshot│  │ - recruiter     │                          │
  │  │ events/:id       │  │ - Emit events   │  │   room          │                          │
  │  └────────┬────────┘  └────────┬────────┘  └─────────────────┘                          │
  └───────────┼────────────────────┼─────────────────────────────────────────────────────────┘
              │                    │
              │ POST /vision/      │
              │ analyze            │
              ▼                    │
  ┌─────────────────────────────────────────────────────────────────────────────────────────┐
  │  AI PROCTOR (Python FastAPI + OpenCV + YOLO)                                             │
  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
  │  │ Face Detection   │  │ Phone Detection │  │ Gaze Estimate   │  │ Spoof Check      │   │
  │  │ Haar / dlib      │  │ YOLO COCO       │  │ Face region     │  │ Laplacian var    │   │
  │  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘   │
  │  Response: face_detected, person_count, phone_detected, looking_direction, mouth_open     │
  └─────────────────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
  ┌─────────────────────────────────────────────────────────────────────────────────────────┐
  │  STORAGE                                                                                 │
  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                          │
  │  │ proctoring/      │  │ ProctoringEvent │  │ Recruiter UI    │                          │
  │  │ screenshots/     │  │ (DB)            │  │ (Socket.io)     │                          │
  │  │ session_<id>/    │  │                 │  │ Live alerts     │                          │
  │  └─────────────────┘  └─────────────────┘  └─────────────────┘                          │
  └─────────────────────────────────────────────────────────────────────────────────────────┘
```

**Violation Rules:**

| Rule | Trigger | Severity |
|------|---------|----------|
| `PHONE_DETECTED` | YOLO detects cell phone | High |
| `MULTIPLE_PERSONS` | `person_count > 1` | High |
| `FACE_MISSING` | No face detected | Medium |
| `LOOKING_AWAY` | Gaze away > 5 seconds | Medium |
| `MOUTH_OPEN` | Sustained (talking when not expected) | Low |
| `SPOOF_DETECTED` | Photo/screen reflection heuristic | High |
| `TAB_SWITCH` | `document.visibilityState` | Medium |

---

## 6. Database Schema

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              CORE ENTITIES                                              │
└─────────────────────────────────────────────────────────────────────────────────────────┘

  User                    JobSeekerProfile           RecruiterProfile
  ┌─────────────────┐    ┌─────────────────┐       ┌─────────────────┐
  │ id (PK)         │───►│ userId (FK)     │       │ userId (FK)     │◄───
  │ email           │    │ fullName        │       │ companyName     │
  │ passwordHash    │    │ resumeUrl       │       │ designation     │
  │ role            │    │ skills (JSON)   │       └─────────────────┘
  │ emailVerified   │    │ education       │
  └────────┬────────┘    └─────────────────┘
           │
           │ 1:N
           ▼
  ┌─────────────────┐    ┌─────────────────┐       ┌─────────────────┐
  │ Interview       │    │ AptitudeSession  │       │ DsaRoundResult  │
  │ id (PK)         │    │ id (PK)          │       │ id (PK)         │
  │ userId (FK)     │    │ userId (FK)      │       │ userId (FK)     │
  │ status          │    │ answers (JSON)   │       │ answers (JSON)  │
  │ totalScore      │    │ score           │       │ score           │
  │ scoreBreakdown  │    └─────────────────┘       └─────────────────┘
  └────────┬────────┘
           │
           │ 1:N
           ▼
  ┌─────────────────┐    ┌─────────────────┐       ┌─────────────────┐
  │ InterviewMessage│    │ ProctoringEvent  │       │ EmailVerification│
  │ id (PK)         │    │ id (PK)         │       │ Code             │
  │ interviewId(FK) │    │ sessionId       │       │ id (PK)          │
  │ role            │    │ userId (FK)     │       │ email            │
  │ content         │    │ type            │       │ codeHash         │
  │ audioUrl        │    │ screenshotPath  │       │ expiresAt        │
  └─────────────────┘    │ confidence      │       └─────────────────┘
                         └─────────────────┘

  Question (AI / Aptitude / DSA)
  ┌─────────────────┐
  │ id (PK)         │
  │ type            │  aptitude | dsa | ai_interview
  │ content         │
  │ topic           │
  │ difficulty      │
  │ options (JSON)   │  for MCQ
  └─────────────────┘
```

**Key Tables:**

| Table | Purpose |
|-------|---------|
| `User` | Auth, roles (jobseeker, recruiter, admin, expert) |
| `JobSeekerProfile` | Resume, skills, education, experience |
| `Interview` | AI interview sessions, scores |
| `InterviewMessage` | Q&A with optional audio URLs |
| `AptitudeTestResult` | Aptitude answers and score |
| `DsaRoundResult` | DSA code + score |
| `ProctoringEvent` | Violation events with screenshot path |
| `EmailVerificationCode` | OTP for signup |
| `VerificationStage` | Stage progress (aptitude, dsa, ai_interview, etc.) |

---

## 7. Real-Time Monitoring Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        REAL-TIME MONITORING                                              │
└─────────────────────────────────────────────────────────────────────────────────────────┘

  Candidate (Browser)                    Backend                          Recruiter (Browser)
  ┌─────────────────────┐                ┌─────────────────────┐          ┌─────────────────────┐
  │ Webcam stream       │                │ HTTP Server         │          │ Admin Dashboard     │
  │ MediaStream         │                │ (Express)           │          │ RealtimeProctoring  │
  │                     │   POST /frame  │                     │          │ Alerts              │
  │ Canvas capture      │ ─────────────► │ Proctor controller  │          │                     │
  │ 1 fps, 320x240      │                │         │           │          │                     │
  │ base64              │                │         ▼           │   emit   │                     │
  │                     │                │ Socket.io server    │ ────────►│ proctor:event       │
  │                     │                │ proctor:recruiters  │          │                     │
  │                     │                │ proctor:<sessionId> │          │ Live violation list │
  └─────────────────────┘                └─────────────────────┘          └─────────────────────┘

  Socket.io Events:
  - proctor:subscribe(sessionId)
  - proctor:recruiter_join
  - proctor:event { sessionId, event, timestamp, screenshotPath }
```

---

## 8. Infrastructure Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        CURRENT (MVP)                                                     │
└─────────────────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
  │  Vercel          │         │  Render          │         │  PostgreSQL      │
  │  - Frontend (SPA)│         │  - Node.js API   │         │  (Neon/Supabase/ │
  │  - Static assets │         │  - Socket.io     │         │   Render)        │
  │  - /api rewrites │         │  - Free tier     │         │                  │
  └────────┬─────────┘         └────────┬─────────┘         └────────┬─────────┘
           │                            │                            │
           └────────────────────────────┴────────────────────────────┘
                                         │
                           ┌─────────────┴─────────────┐
                           │  Render / Local         │
                           │  - AI Proctor (Python)  │
                           │  - Port 8001            │
                           └─────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        FUTURE (Scalable)                                                 │
└─────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
  │  CDN / Edge      │     │  API Gateway     │     │  Kubernetes      │
  │  CloudFlare      │     │  Kong / AWS      │     │  - Auth pod       │
  │  Static + cache  │     │  Rate limit      │     │  - Interview pod  │
  └────────┬─────────┘     └────────┬─────────┘     │  - Proctor pod    │
           │                        │               └────────┬─────────┘
           │                        │                        │
           │                        ▼                        ▼
  ┌─────────────────────────────────────────────────────────────────────────────────────────┐
  │  Kubernetes Cluster                                                                      │
  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐         │
  │  │ Auth        │ │ Interview  │ │ Proctor    │ │ AI Eval     │ │ Media       │         │
  │  │ (Node)      │ │ (Node)     │ │ (Python)   │ │ (Python)    │ │ (Python)    │         │
  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘         │
  └─────────────────────────────────────────────────────────────────────────────────────────┘
           │                        │                        │
           ▼                        ▼                        ▼
  ┌─────────────┐           ┌─────────────┐           ┌─────────────┐
  │ PostgreSQL  │           │ Redis       │           │ S3 / GCS    │
  │ (RDS)      │           │ (ElastiCache)│          │ Media store │
  └─────────────┘           └─────────────┘           └─────────────┘
```

---

## 9. Interview Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        INTERVIEW WORKFLOW                                                │
└─────────────────────────────────────────────────────────────────────────────────────────┘

  Candidate                    System                                    AI / DB

     │                            │                                          │
     │  Start Interview            │                                          │
     │ ─────────────────────────►  │                                          │
     │                            │  Create session                           │
     │                            │  Start proctoring                         │
     │                            │  Load questions                           │
     │                            │ ─────────────────────────────────────────►
     │                            │                                          │
     │  Question 1 (audio/text)    │                                          │
     │ ◄───────────────────────── │                                          │
     │                            │                                          │
     │  Answer (webcam + mic)      │                                          │
     │ ─────────────────────────► │  Record video/audio                       │
     │                            │  Proctor frames (1 fps)                   │
     │                            │ ─────────────────────────────────────────►
     │                            │                                          │
     │                            │  [After answer]                           │
     │                            │  Upload media                             │
     │                            │  STT (Whisper)                            │
     │                            │  LLM evaluation                           │
     │                            │ ◄─────────────────────────────────────────
     │                            │                                          │
     │  Question 2...              │                                          │
     │ ◄───────────────────────── │                                          │
     │        ...                 │        ...                               │
     │                            │                                          │
     │  Submit final               │                                          │
     │ ─────────────────────────►  │  Aggregate scores                        │
     │                            │  Generate report                         │
     │                            │  Store result                            │
     │                            │ ─────────────────────────────────────────►
     │                            │                                          │
     │  Score + Report             │                                          │
     │ ◄───────────────────────── │                                          │
```

---

## 10. Folder / Service Structure

```
provenhire/
├── src/                          # Frontend (React + Vite)
│   ├── components/
│   │   ├── ProctoringSetupGate.tsx
│   │   ├── LiveProctoringPreview.tsx
│   │   ├── TestProctoringBar.tsx
│   │   └── admin/
│   │       ├── RealtimeProctoringAlerts.tsx
│   │       └── ProctoringAnalytics.tsx
│   ├── hooks/
│   │   ├── useProctorFrameCapture.ts
│   │   ├── useProctorSocket.ts
│   │   ├── useProctoringRiskMonitor.ts
│   │   └── useSoundDetection.ts
│   ├── pages/
│   │   ├── Auth.tsx
│   │   ├── verification/
│   │   │   ├── VerificationFlow.tsx
│   │   │   └── stages/
│   │   │       ├── AptitudeTestStage.tsx
│   │   │       ├── DSARoundStage.tsx
│   │   │       └── ExpertInterviewStage.tsx
│   │   └── admin/
│   ├── lib/
│   └── contexts/
│
├── server/                       # Backend (Node.js + Express)
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── proctor.ts
│   │   │   ├── proctoring.ts
│   │   │   ├── verification.ts
│   │   │   └── interview.ts
│   │   ├── controllers/
│   │   ├── services/
│   │   │   ├── proctor.service.ts
│   │   │   └── ai.service.ts
│   │   ├── socket/
│   │   │   └── proctor-socket.ts
│   │   ├── middleware/
│   │   └── config/
│   └── prisma/
│       ├── schema.prisma
│       └── migrations/
│
├── ai-proctor/                   # AI Proctoring (Python FastAPI)
│   ├── api.py                    # POST /vision/analyze
│   └── requirements.txt
│
├── proctoring/
│   └── screenshots/              # Local violation screenshots
│       └── session_<id>/
│
├── docs/
│   └── PRODUCT_ARCHITECTURE.md
│
├── vercel.json                   # Rewrites for API, health
└── package.json
```

---

## 11. Service Breakdown

| Service | Endpoints | Dependencies |
|---------|-----------|--------------|
| **Auth** | `/api/auth/login`, `/register`, `/email-verification/send`, `/verify`, `/refresh` | Prisma, JWT, Resend/Gmail |
| **Proctor** | `POST /api/proctor/frame`, `GET /api/proctor/events/:sessionId` | AI Proctor (Python), Prisma, Socket.io |
| **Proctoring (alerts)** | `POST /api/proctoring/alerts`, `GET /api/proctoring/alerts` | Prisma |
| **Verification** | `/api/verification/aptitude`, `/dsa`, `/stages/update` | Prisma, Judge0 (DSA) |
| **Interview** | `/api/interview/*` | Prisma, Gemini (AI) |
| **AI Proctor** | `POST /vision/analyze` | OpenCV, YOLO |

---

## 12. Scalability Considerations

| Area | Current | Scale-Up |
|------|---------|----------|
| **API** | Single Render instance | K8s pods, horizontal scaling |
| **AI Proctor** | Single Python process | Queue (Redis/RabbitMQ) + worker pool |
| **Media** | Local / temp | S3 + signed URLs |
| **Real-time** | Single Socket.io | Redis adapter, multiple nodes |
| **DB** | Single PostgreSQL | Read replicas, connection pooling |
| **Proctoring screenshots** | Local filesystem | S3 bucket |

---

*Document version: 1.0 — aligned with current ProvenHire implementation*
