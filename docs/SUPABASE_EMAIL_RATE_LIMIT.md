# Fix: "Email rate limit exceeded"

Supabase limits how many auth emails (sign-up confirmation, password reset) can be sent in a short time. On the free tier this is often **around 4 emails per hour**. Each sign-up in this app can send **2 emails** (confirmation + set-password link), so a few sign-ups quickly hit the limit.

---

## Option 1: Disable "Confirm email" (recommended for testing)

This reduces sign-up to **1 email per user** (only the set-password link).

1. Open **[Supabase Dashboard](https://supabase.com/dashboard)** → your project.
2. Go to **Authentication** → **Providers** → **Email**.
3. Turn **OFF** “Confirm email” (disable **Confirm email**).
4. Click **Save**.

New users will be created without a confirmation email; they will still receive the “set your password” email. If you hit the limit again, wait about an hour or use Option 2.

---

## Option 2: Wait and retry

Supabase rate limits reset over time (often within **about 1 hour**). Stop sending auth emails for a while, then try again.

---

## Option 3: Use existing test accounts

To avoid sending more emails:

- Use the test accounts from **`docs/TEST_CREDENTIALS.md`** and sign **in** (do not sign up).
- Create new users only when necessary, and space out sign-ups.

---

## Option 4: Custom SMTP (production)

On paid plans you can configure **Custom SMTP** (Authentication → Email Templates / SMTP). Your own SMTP provider may have higher or separate limits, which can reduce “email rate limit exceeded” in production.

---

## Summary

| Goal              | Action |
|-------------------|--------|
| Testing / dev     | Turn off **Confirm email** in Supabase Auth → Providers → Email. |
| Hit limit now     | Wait ~1 hour, then retry. |
| Fewer emails      | Sign in with existing test accounts; sign up only when needed. |
