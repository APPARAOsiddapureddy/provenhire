# Custom domain (www.provenhire.in) on Vercel

## Keep users on the custom domain

If visitors to **https://www.provenhire.in** are being sent to the Vercel URL (*.vercel.app), that is controlled in the **Vercel Dashboard**, not in this repo.

### 1. Set the primary domain in Vercel

1. Open [Vercel Dashboard](https://vercel.com) → your project → **Settings** → **Domains**.
2. Add **www.provenhire.in** and **provenhire.in** if they are not already there.
3. Set **www.provenhire.in** as the **primary** domain (so links and redirects use it).
4. Do **not** enable any option that “Redirect to Vercel deployment URL” or similar; the site should be served from your custom domain only.

### 2. What this repo does

- **vercel.json**  
  - Redirects **provenhire.in** → **https://www.provenhire.in** (bare domain to www).  
  - There are **no** redirects to `*.vercel.app` in this file.
- **Canonical and SEO**  
  - All canonical URLs, Open Graph, sitemap, and robots use **https://www.provenhire.in**.
- **Backend (Render)**  
  - CORS and email links use **https://www.provenhire.in** (and **https://provenhire.in**) so the API and emails work with your custom domain.

After setting www as primary and disabling “redirect to Vercel URL”, traffic to **https://www.provenhire.in** should stay on that domain.
