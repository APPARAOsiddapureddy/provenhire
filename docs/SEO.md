# ProvenHire SEO Implementation

Production SEO is implemented for **provenhire.in**. This doc summarizes what’s in place and optional follow-ups.

## Implemented

### 1. Page title and meta tags
- **index.html**: Default `<title>`, `<meta name="description">`, `<meta name="keywords">`, `<meta name="author">`, `<meta name="robots" content="index, follow">`, `<meta name="viewport">`.
- **Per-page**: `src/components/SEO.tsx` updates `document.title`, meta description, canonical, and robots on route change. Used on Home, Auth, Jobs, For Employers, About.

### 2. Open Graph and Twitter Cards
- **index.html**: `og:title`, `og:description`, `og:url`, `og:type`, `og:image` (https://provenhire.in/og-image.png), `og:image:width/height`, `og:site_name`, `og:locale`.
- **Twitter**: `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`.
- **SEO component**: Updates `og:title`, `og:description`, `og:url` on client for the current page.

### 3. Structured data (JSON-LD)
- **Organization** and **WebSite** schemas in `index.html` (name, url, logo, description).

### 4. robots.txt
- **public/robots.txt**: `User-agent: *` → `Allow: /`, plus `Sitemap: https://provenhire.in/sitemap.xml`.

### 5. Sitemap
- **public/sitemap.xml**: Entries for `/`, `/auth`, `/login`, `/signup`, `/jobs`, `/for-employers`, `/verification`, `/about`, `/careers/interviewer`. Update this file when adding new public routes.

### 6. Heading structure
- **Landing (Index)**:
  - One **H1**: “Hire Verified Talent with ProvenHire”.
  - **H2**s: Skill Verified Hiring, Live Coding Verification, Structured Interview Scoring, Why Companies Trust ProvenHire, plus How Verification Works, What You Unlock, Verification Pipeline, Why Companies Trust ProvenHire (features), Ready to Get Skill-Certified.
- Other pages keep a single H1 per page.

### 7. Image SEO
- No raw `<img>` tags in `src`; assets are SVGs/icons. For any new images, use `alt` and `loading="lazy"`.

### 8. Performance and caching
- **Vite**: Code splitting via `lazy()` for dashboards and heavy routes.
- **index.html**: Font preconnect + single stylesheet link.
- **vercel.json**: Cache headers for `/assets/*` (long-lived) and for favicon, og-image, logo, sitemap, robots (1 day).

### 9. Canonical URL
- **index.html**: `<link rel="canonical" href="https://provenhire.in">`.
- **SEO component**: Sets canonical per page (e.g. `https://provenhire.in/jobs`).

### 10. Google Search Console
- **index.html**: `<meta name="google-site-verification" content="ADD_VERIFICATION_CODE">`. Replace `ADD_VERIFICATION_CODE` with the code from Search Console.

### 11. Keywords
- Target terms (ProvenHire, Proven Hire, verified hiring platform, skill verification hiring, coding verification, AI hiring platform) are used in:
  - Default title and meta description.
  - H1 and H2 on the landing page.
  - SEO content section and internal links.

### 12. Landing page SEO content
- New section with ~600+ words: Skill Verified Hiring, Live Coding Verification, Structured Interview Scoring, Why Companies Trust ProvenHire. Internal links to `/jobs`, `/for-employers`, `/verification`, `/about`.

### 13. Internal linking
- Navbar: Find Jobs → `/jobs`, For Employers → `/for-employers`, About → `/about`, Get Verified → `/auth`.
- Footer: Find Jobs, Get Verified, For Employers, Post a Job, Careers, About.
- Landing: CTA and SEO section link to `/auth`, `/for-employers`, `/jobs`, `/verification`, `/about`.

### 14. URLs
- Clean routes: `/`, `/auth`, `/login`, `/signup`, `/jobs`, `/for-employers`, `/verification`, `/about`, `/careers/interviewer`. `/login` and `/signup` redirect to `/auth?mode=login` and `/auth?mode=signup`.

### 15. Favicon
- **index.html**: `<link rel="icon" href="/favicon.ico">` and `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`. `public/favicon.svg` exists.

## Optional follow-ups

1. **favicon.ico**: Add `public/favicon.ico` for older browsers (e.g. export from favicon.svg).
2. **og-image.png**: Add `public/og-image.png` (1200×630) for social sharing; meta already points to `https://provenhire.in/og-image.png`.
3. **logo.png**: Add `public/logo.png` if you want the Organization schema logo to resolve (currently `https://provenhire.in/logo.png`).
4. **Google Search Console**: Replace `ADD_VERIFICATION_CODE` and submit sitemap.
5. **Lighthouse**: Run Lighthouse (SEO and Performance) and fix any remaining issues to reach 90+ SEO score.
