# ProvenHire SEO implementation

**Last updated:** April 2026  

Production SEO targets **`https://provenhire.in`** (apex). **`www.provenhire.in`** redirects to apex via inline script in `index.html` (service worker teardown + redirect). Canonicals, Open Graph `og:url`, Twitter images, JSON-LD, and `public/sitemap.xml` use **apex** so crawlers see one primary URL.

---

## 1. Default meta (`index.html`)

- **`charset`**, **`viewport`** (`width=device-width, initial-scale=1.0`).
- **Primary SEO:** `title`, `description`, expanded **`keywords`** (ProvenHire / Proven Hire / India hiring combinations).
- **`author`**, **`robots`**, **`googlebot`** (`index, follow`).
- **`link rel="canonical"`** → `https://provenhire.in`.
- **`google-site-verification`** placeholder: replace **`ADD_VERIFICATION_CODE`** in Search Console.
- **Open Graph:** `og:type`, `og:site_name`, `og:title`, `og:description`, `og:url`, `og:image` → `https://provenhire.in/og-image.png` (1200×630), dimensions, `og:locale` `en_IN`.
- **Twitter Card:** `summary_large_image`, title, description, image (same OG asset).
- **`application-name`**, **`apple-mobile-web-app-title`**, **`meta name="alternate-name"`** content `Proven Hire` (brand synonym).
- **Favicon bundle:** `/favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `favicon.svg`, `apple-touch-icon.png`, **`/site.webmanifest`**.
- **JSON-LD:** `Organization` (alternateName, logo, contact, sameAs) and **`WebSite`** with **`SearchAction`** (`/jobs?q={search_term_string}`).
- **Performance:** `preconnect` to Google Fonts + **Manrope / Bebas / IBM Plex Mono** stylesheet.
- **Preserved technical tags:** `Cross-Origin-Opener-Policy: same-origin-allow-popups` (Firebase popups); inline **service worker unregister** script before the rest of the head.

---

## 2. Per-route SEO (`src/components/SEO.tsx`)

On navigation, updates:

- `document.title`
- `meta name="description"`
- `meta name="robots"` (supports `noIndex`)
- **`meta name="alternate-name"`** → `Proven Hire`
- `link rel="canonical"` (per path; site base `https://provenhire.in`)
- `og:title`, `og:description`, `og:url`

Use `<SEO />` on public marketing pages as today.

---

## 3. `public/sitemap.xml`

Curated list including `/`, `/jobs`, `/for-employers`, `/about`, `/auth`, `/careers/interviewer`, `/verification`. **Update `lastmod`** when you ship meaningful content changes. Submit in Google Search Console: **`https://provenhire.in/sitemap.xml`**.

---

## 4. `public/robots.txt`

- **Allow** public marketing paths; **Disallow** `/dashboard/`, `/admin/`, `/interview/`, `/api/`.
- **Sitemap** line points to apex.
- **`Crawl-delay: 1`** — honored by some bots; **Google ignores crawl-delay** (harmless to leave).

---

## 5. Favicon & social assets

| File | Source |
|------|--------|
| `public/favicon.svg` | Vector mark (PH). |
| `favicon.ico`, PNG sizes, `apple-touch-icon.png`, `logo.png`, `og-image.png` | Regenerate from SVGs via **`npm run generate:favicons`** (repo root; uses **sharp** + **png-to-ico**). |

`og-image.png` is rasterized from **`public/og-image.svg`** (1200×630 layout).

---

## 6. Operator checklist

1. Replace **`ADD_VERIFICATION_CODE`** in `index.html`.
2. Confirm **`sameAs`** URLs in JSON-LD (LinkedIn / X) or update/remove.
3. Deploy frontend; verify **`/favicon.ico`**, **`/og-image.png`**, **`/sitemap.xml`**, **`/robots.txt`** return 200.
4. Search Console: add property **provenhire.in**, verify, submit sitemap, request indexing for homepage.

---

## 7. Optional follow-ups

- Lighthouse SEO + Performance passes; fix any regressions.
- Add **`og-image.png`** branding polish beyond SVG raster if marketing provides a designed 1200×630 asset.
