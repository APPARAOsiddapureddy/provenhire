 # ProvenHire

 ProvenHire is a skill-certified hiring network with a React/Vite frontend and a Node.js/Express backend.

## Documentation (share with your team)

All documentation lives under **[docs/README.md](docs/README.md)** — start there for the map.

- **Product PRD (index + four parts):** [docs/PRD.md](docs/PRD.md) → [PRD_CANDIDATE.md](docs/PRD_CANDIDATE.md), [PRD_RECRUITER.md](docs/PRD_RECRUITER.md), [PRD_BUSINESS.md](docs/PRD_BUSINESS.md), [PRD_AI_INTERVIEW.md](docs/PRD_AI_INTERVIEW.md)
- **Recent code/UI changes:** [docs/IMPLEMENTATION_CHANGELOG.md](docs/IMPLEMENTATION_CHANGELOG.md)
- **Deploy (Vercel + Render):** [docs/DEPLOYMENT_COMPLETE.md](docs/DEPLOYMENT_COMPLETE.md)

## Stack

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express (TypeScript)
- Database: PostgreSQL + Prisma
- AI: Google Gemini API (free tier)

## Local development

### Quick start (recommended)

```bash
npm install
cd server && npm install && cd ..
npm run start
```

Then open **http://localhost:8080**. This starts both frontend (8080) and backend (10000).

### Manual start

**Terminal 1 – backend:**
```bash
cd server
npm install
npm run dev
```

**Terminal 2 – frontend:**
```bash
npm install
npm run dev
```

### Configure backend

Create `server/.env`:

```
PORT=10000
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DBNAME"
JWT_SECRET="your-secret"
GEMINI_API_KEY="your-gemini-key"
```

> **Note:** `PORT=10000` must match the Vite proxy target in `vite.config.ts`.
