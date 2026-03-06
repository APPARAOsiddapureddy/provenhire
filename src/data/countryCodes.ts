/**
 * Country calling codes for phone input. E.164 format.
 * Scalable: add more codes as needed for international expansion.
 */
export const COUNTRY_CODES = [
  { code: "+91", country: "India", flag: "🇮🇳" },
  { code: "+1", country: "US/Canada", flag: "🇺🇸" },
  { code: "+44", country: "UK", flag: "🇬🇧" },
  { code: "+61", country: "Australia", flag: "🇦🇺" },
  { code: "+49", country: "Germany", flag: "🇩🇪" },
  { code: "+33", country: "France", flag: "🇫🇷" },
  { code: "+81", country: "Japan", flag: "🇯🇵" },
  { code: "+86", country: "China", flag: "🇨🇳" },
  { code: "+65", country: "Singapore", flag: "🇸🇬" },
  { code: "+971", country: "UAE", flag: "🇦🇪" },
  { code: "+966", country: "Saudi Arabia", flag: "🇸🇦" },
  { code: "+31", country: "Netherlands", flag: "🇳🇱" },
  { code: "+39", country: "Italy", flag: "🇮🇹" },
  { code: "+34", country: "Spain", flag: "🇪🇸" },
  { code: "+55", country: "Brazil", flag: "🇧🇷" },
  { code: "+52", country: "Mexico", flag: "🇲🇽" },
  { code: "+27", country: "South Africa", flag: "🇿🇦" },
  { code: "+82", country: "South Korea", flag: "🇰🇷" },
  { code: "+7", country: "Russia", flag: "🇷🇺" },
  { code: "+234", country: "Nigeria", flag: "🇳🇬" },
  { code: "+254", country: "Kenya", flag: "🇰🇪" },
  { code: "+92", country: "Pakistan", flag: "🇵🇰" },
  { code: "+880", country: "Bangladesh", flag: "🇧🇩" },
  { code: "+94", country: "Sri Lanka", flag: "🇱🇰" },
  { code: "+64", country: "New Zealand", flag: "🇳🇿" },
  { code: "+353", country: "Ireland", flag: "🇮🇪" },
  { code: "+358", country: "Finland", flag: "🇫🇮" },
  { code: "+46", country: "Sweden", flag: "🇸🇪" },
  { code: "+47", country: "Norway", flag: "🇳🇴" },
  { code: "+45", country: "Denmark", flag: "🇩🇰" },
] as const;

export const DEFAULT_COUNTRY_CODE = "+91";

/** Parse E.164 or legacy phone into { countryCode, number } */
export function parsePhone(value: string | null | undefined): { countryCode: string; number: string } {
  if (!value?.trim()) return { countryCode: DEFAULT_COUNTRY_CODE, number: "" };
  const v = value.trim();
  // Match known codes (longest first)
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const { code } of sorted) {
    if (v.startsWith(code)) {
      const num = v.slice(code.length).replace(/\D/g, "");
      return { countryCode: code, number: num };
    }
  }
  // No match: assume default, treat whole as number (legacy)
  const digits = v.replace(/\D/g, "");
  if (digits.length >= 10 && !v.startsWith("+")) {
    return { countryCode: DEFAULT_COUNTRY_CODE, number: digits };
  }
  return { countryCode: DEFAULT_COUNTRY_CODE, number: digits || v };
}

/** Build E.164 format: +919876543210 */
export function formatE164(countryCode: string, number: string): string {
  const digits = number.replace(/\D/g, "");
  if (!digits) return "";
  return `${countryCode}${digits}`;
}
