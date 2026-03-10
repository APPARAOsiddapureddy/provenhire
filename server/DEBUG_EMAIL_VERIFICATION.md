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

## 4. Production (Vercel + Render): Request succeeds but NO email arrives

**Symptom:** Network shows 200 OK, "Verification code sent" message appears, but inbox is empty (check spam too).

**Cause:** Render backend does not have email env vars, or Gmail blocks cloud IPs.

### Required: Add env vars to Render

1. Go to **Render Dashboard** → your backend service → **Environment**.
2. Add these variables (at least one provider):

| Variable | Where to get it | Required? |
|----------|-----------------|-----------|
| `RESEND_API_KEY` | [resend.com](https://resend.com) → API Keys → Create | **Recommended for production** |
| `GMAIL_USER` | Your Gmail address | Fallback (often blocked from Render) |
| `GMAIL_APP_PASSWORD` | Google Account → Security → App passwords | Fallback |
| `BASE_URL` | Your Vercel URL, e.g. `https://your-app.vercel.app` | For password reset links |

3. **Save** → **Manual Deploy** (env changes require a redeploy).
4. After deploy, verify: open `https://YOUR-RENDER-URL/diagnostic`. You should see:
   ```json
   "emailConfigured": true,
   "emailProviders": { "resend": "configured", "gmail": "missing" }
   ```
   If `emailConfigured` is `false`, env vars are not set correctly.

### Resend free tier: "You can only send testing emails to your own email address"

**Symptom:** Logs show `[Email] Resend failed: You can only send testing emails to your own email address...`

**Cause:** Resend's free tier with `onboarding@resend.dev` allows sending only to the email linked to your Resend account.

**Fix (choose one):**
1. **Add Gmail fallback** (easiest): Add `GMAIL_USER` and `GMAIL_APP_PASSWORD` to Render. When Resend rejects (recipient restriction), Gmail will send to any address.
2. **Verify a domain on Resend**: Go to [resend.com/domains](https://resend.com/domains), add and verify your domain, then set `EMAIL_FROM=ProvenHire <noreply@yourdomain.com>` in Render. Resend will then allow any recipient.

### Why Resend over Gmail for production?

- **Resend** (with verified domain) works reliably. Free tier without domain: only to your own email.
- **Gmail** works for any recipient but can be blocked/delayed from Render's IPs. Use as fallback when Resend restricts.

### Check Render Logs

After clicking "Send Verification Code", check **Render → Logs**. If you see:
- `[sendEmailVerificationCode] Email failed to send to user@example.com` → Email provider failed (Resend/Gmail).
- `[Email] Resend failed:` or `[Email] Gmail failed:` → See the actual error message.

## 5. Run migrations

```bash
cd server
npx prisma db push
npx prisma generate
```

Then restart the server.
