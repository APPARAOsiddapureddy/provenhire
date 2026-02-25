# Supabase Auth Setup (fix CORS / 521 after resume)

If you see **CORS** or **521** errors when signing up or signing in (especially after resuming a paused Supabase project), follow these steps.

---

## 1. Wait 2–3 minutes after resuming

After you click **Resume** on a paused project, Supabase can take a couple of minutes to come back. **521** usually means the origin is still starting.

- Wait 2–3 minutes.
- Try sign up / sign in again.

---

## 2. Add your app URL in Supabase Dashboard

Your app runs on **http://localhost:8080**. Supabase must allow this origin and redirect URL.

1. Open **[Supabase Dashboard](https://supabase.com/dashboard)** and select your project (`psjzzdycssokajbrhtol` or your project).
2. Go to **Authentication** (left sidebar) → **URL Configuration**.
3. Set or add:

   | Field | Value |
   |-------|--------|
   | **Site URL** | `http://localhost:8080` (for local dev) or your production URL, e.g. `https://yourdomain.com` |
   | **Redirect URLs** | Add these lines (one per line):<br>• `http://localhost:8080/**`<br>• `http://localhost:8080/auth**`<br>• If you use other ports (e.g. Vite 5173): `http://localhost:5173/**` |

4. Click **Save**.

---

## 3. Confirm project is running

1. In the Dashboard, check that the project status is **Active** (not Paused).
2. Open **Settings** → **API** and confirm:
   - **Project URL** is correct (e.g. `https://psjzzdycssokajbrhtol.supabase.co`).
   - **anon public** key matches what your app uses (e.g. in `.env` as `VITE_SUPABASE_PUBLISHABLE_KEY` or the fallback in code).

---

## 4. If you use a different port (e.g. 5173)

Add that origin too in **Redirect URLs**, for example:

- `http://localhost:5173/**`
- `http://127.0.0.1:5173/**`

Then save and try again.

---

## 5. Summary checklist

- [ ] Project is **Active** (not Paused).
- [ ] Waited 2–3 minutes after resuming.
- [ ] **Authentication** → **URL Configuration** → **Redirect URLs** includes `http://localhost:8080/**` (and your port if different).
- [ ] **Site URL** is set (e.g. `http://localhost:8080` for dev).
- [ ] Retry sign up / sign in.

If it still fails, check the browser Network tab: look at the failing request’s response status (521, 403, etc.) and response body for more detail.
