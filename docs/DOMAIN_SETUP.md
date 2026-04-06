# Custom domain (`provenhire.in`) on Vercel

**Last updated:** April 2026  

**Team index:** [docs/README.md](README.md)

---

## Canonical host

- **SEO and user-facing primary URL:** **`https://provenhire.in`** (apex).
- **`https://www.provenhire.in`** **301 redirects** to the same path on apex (see **`vercel.json`** `redirects` and **`index.html`** inline script for consistency + service worker handling).
- **Canonical link, Open Graph `og:url`, `sitemap.xml`, and `robots.txt`** in this repo use **apex**. Keep them aligned so search engines see one primary host.

---

## Vercel Dashboard

1. [Vercel](https://vercel.com) → your project → **Settings** → **Domains**.
2. Add both **`provenhire.in`** and **`www.provenhire.in`** if missing; follow DNS instructions (A/AAAA or CNAME per Vercel).
3. Do **not** configure an extra redirect that fights the repo (e.g. forcing apex → `*.vercel.app`). Traffic should stay on your custom domain.

---

## What this repo configures

| Piece | Behavior |
|--------|----------|
| **`vercel.json`** | Permanent redirect **www → apex** for all paths. Rewrites `/api`, `/uploads`, `/health`, `/diagnostic` to the Render backend URL (update host if your service name changes). |
| **`index.html`** | Redirects **www** → **apex** before the app bundle loads; tears down legacy service workers. |
| **API (Render)** | `server/src/app.ts` allows `https://provenhire.in` and `https://www.provenhire.in` for CORS. |

---

## After DNS changes

- Verify **https://provenhire.in** and **https://www.provenhire.in** both load; www should land on apex.
- **Firebase:** add both hosts under Authentication → **Authorized domains** if you use Google sign-in.
