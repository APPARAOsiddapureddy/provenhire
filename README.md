 # ProvenHire

 ProvenHire is a skill-certified hiring network with a React/Vite frontend and a Node.js/Express backend.

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
