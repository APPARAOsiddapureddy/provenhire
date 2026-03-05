 # ProvenHire

 ProvenHire is a skill-certified hiring network with a React/Vite frontend and a Node.js/Express backend.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express (TypeScript)
- Database: PostgreSQL + Prisma
- AI: Google Gemini API (free tier)

## Local development

### 1) Install frontend dependencies

```
npm install
```

### 2) Configure backend

Create `server/.env`:

```
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DBNAME"
JWT_SECRET="your-secret"
GEMINI_API_KEY="your-gemini-key"
PORT=5000
```

### 3) Start backend

```
cd server
npm install
npm run dev
```

### 4) Start frontend

```
npm run dev
```
