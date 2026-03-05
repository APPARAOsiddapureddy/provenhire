 # PostgreSQL Setup

 This guide configures PostgreSQL for the new Node/Express + Prisma backend.

## 1) Create a database

Create a database locally or on a hosted provider (Neon, Railway, Render, etc.).

## 2) Configure backend env

Update `server/.env`:

```
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DBNAME"
JWT_SECRET="your-secret"
GEMINI_API_KEY="your-gemini-key"
PORT=5000
```

## 3) Run Prisma migrations

From `server/`:

```
npm install
npx prisma migrate dev
npx prisma generate
```

## 4) Start the backend

```
npm run dev
```

The API will be available at `http://localhost:5000`.
