/**
 * Per-page SEO: document title, meta description, canonical URL.
 * Updates on route change so every page has correct metadata for indexing and sharing.
 */
import { useEffect } from "react";

const SITE_URL = "https://www.provenhire.in";

export interface SEOProps {
  title: string;
  description: string;
  path?: string;
  noIndex?: boolean;
}

export default function SEO({ title, description, path = "", noIndex = false }: SEOProps) {
  const fullTitle = title.includes("ProvenHire") ? title : `${title} | ProvenHire`;
  const canonical = path ? `${SITE_URL}/${path.replace(/^\//, "")}` : SITE_URL;

  useEffect(() => {
    document.title = fullTitle;

    const setMeta = (name: string, content: string, isProperty = false) => {
      const attr = isProperty ? "property" : "name";
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    setMeta("description", description);
    setMeta("robots", noIndex ? "noindex, nofollow" : "index, follow");

    let canonicalEl = document.querySelector('link[rel="canonical"]');
    if (!canonicalEl) {
      canonicalEl = document.createElement("link");
      canonicalEl.setAttribute("rel", "canonical");
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.setAttribute("href", canonical);

    setMeta("og:title", fullTitle, true);
    setMeta("og:description", description, true);
    setMeta("og:url", canonical, true);

    return () => {
      // Restore default on unmount (e.g. back to home)
      document.title = "ProvenHire – Hire Verified Talent with Skill Validation";
      const defCanonical = document.querySelector('link[rel="canonical"]');
      if (defCanonical) defCanonical.setAttribute("href", SITE_URL);
    };
  }, [fullTitle, description, canonical, noIndex]);

  return null;
}
