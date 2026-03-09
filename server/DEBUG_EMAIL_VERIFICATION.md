# Debug Email Verification 500 Error

## 1. Check diagnostic endpoint

With the server running, open:

```
http://localhost:8080/diagnostic
```

(or `http://localhost:10000/diagnostic` if hitting the backend directly)

- If `emailVerificationTableOk` is `false`, run:
  ```bash
  cd server && npx prisma db push && npx prisma generate
  ```
- If `database` is `unavailable`, check your `DATABASE_URL` in `.env`

## 2. Ensure proxy port matches server (common cause of 500/502)

- Vite proxy targets `http://localhost:10000` (see vite.config.ts)
- Your server **must** listen on **10000**. In `server/.env`:
  ```
  PORT=10000
  ```
- If your server used `PORT=5001` or another port, API requests from the frontend will fail.

## 3. Check server console

When you click "Send Verification Code", watch the **server terminal**. You should see either:
- `[sendEmailVerificationCode]` followed by an error (Prisma, DB, etc.)
- `[Email]` messages if Resend or Gmail failed

## 4. Run migrations

```bash
cd server
npx prisma db push
npx prisma generate
```

Then restart the server.
