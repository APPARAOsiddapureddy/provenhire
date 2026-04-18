from backend.models.llm_router import LLMRouter
import re


PROMPT = """You are a resume parser.

Your job is to extract not just technologies, but ownership and level signals that help calibrate interview pressure fairly.

Extract:
- skills (list[str])
- tools (list[str])
- projects (list[object]) with:
  - name
  - description
  - technologies
  - ownership_level: "primary | shared | supporting"
  - contribution_type: "led | built | contributed | assisted"
- experiences (list[object]) with:
  - title
  - company
  - duration
  - contribution_type: "led | built | contributed | assisted"
- claims (list[object]) with:
  - text
  - project
  - strength: "modest | strong | flagship"
  - contribution_type: "led | built | contributed | assisted"
- years of experience per domain
- experience_tier: "junior | mid | senior"

Return JSON:
{
  "skills": [...],
  "projects": [
    {
      "name": "...",
      "description": "...",
      "technologies": ["..."],
      "ownership_level": "primary | shared | supporting",
      "contribution_type": "led | built | contributed | assisted"
    }
  ],
  "claims": [
    {
      "text": "...",
      "project": "...",
      "strength": "modest | strong | flagship",
      "contribution_type": "led | built | contributed | assisted"
    }
  ],
  "tools": [...],
  "experiences": [
    {
      "title": "...",
      "company": "...",
      "duration": "...",
      "contribution_type": "led | built | contributed | assisted"
    }
  ],
  "experience": {"ml": 0, "swe": 0, "data_eng": 0},
  "experience_tier": "junior | mid | senior"
}
"""


class ResumeAgent:
    """
    Parses resume at session start.
    Extracted data feeds into discrepancy detection and question personalization.
    """

    def __init__(self):
        self.llm = LLMRouter(tier="small")

    def _heuristic_parse(
        self,
        resume_text: str,
        years_experience: str = "",
    ) -> dict:
        lines = [line.strip() for line in resume_text.splitlines() if line.strip()]
        skills: list[str] = []
        tools: list[str] = []
        experiences: list[dict] = []
        projects: list[dict] = []
        claims: list[dict] = []

        current_project = ""
        current_contribution = "contributed"

        def _split_tokens(text: str) -> list[str]:
            return [
                token.strip(" .:-")
                for token in re.split(r"[,\u2022|/]+", text)
                if token.strip(" .:-")
            ]

        for index, line in enumerate(lines):
            lower = line.lower()
            if "top skills:" in lower or lower.startswith("skills:") or lower.startswith("technical skills"):
                payload = line.split(":", 1)[1] if ":" in line else line
                if index + 1 < len(lines) and ":" in lines[index + 1] and "skills" in lower:
                    payload = f"{payload}, {lines[index + 1]}"
                tokens = _split_tokens(payload)
                for token in tokens:
                    if len(token) > 1 and token not in skills:
                        skills.append(token)
                continue

            if any(keyword in lower for keyword in ("aws", "docker", "linux", "gcp", "git", "deployment")):
                for token in _split_tokens(line):
                    if token not in tools and len(token) > 1:
                        tools.append(token)

            if not line.startswith(("•", "-", "*")) and (
                "@" in line or "intern" in lower or "research assistant" in lower or "engineer" in lower
            ):
                company_match = re.search(r"@([^@]+?)(?:\s+\d{4}|\s+Jan|\s+Feb|\s+Mar|\s+Apr|\s+May|\s+Jun|\s+Jul|\s+Aug|\s+Sep|\s+Oct|\s+Nov|\s+Dec|$)", line)
                company = company_match.group(1).strip(" -:") if company_match else ""
                title_part = line.split("@")[0].strip(" :-") if "@" in line else line
                title = re.sub(r"\s{2,}", " ", title_part)
                duration_match = re.search(r"((?:19|20)\d{2}[^@]*)$", line)
                duration = duration_match.group(1).strip() if duration_match else ""
                contribution = "assisted" if "assistant" in lower else "built" if "engineer" in lower else "contributed"
                current_project = company or title
                current_contribution = contribution
                experiences.append({
                    "title": title[:120],
                    "company": company[:120],
                    "duration": duration[:80],
                    "contribution_type": contribution,
                })
                projects.append({
                    "name": current_project[:120] or title[:120],
                    "description": title[:200],
                    "technologies": [],
                    "ownership_level": "supporting" if contribution == "assisted" else "shared",
                    "contribution_type": contribution,
                })
                continue

            if line.startswith(("•", "-", "*")):
                bullet = line.lstrip("•-* ").strip()
                if not bullet:
                    continue
                claims.append({
                    "text": bullet[:240],
                    "project": current_project[:120],
                    "strength": "flagship" if any(sym in bullet for sym in ("%", "×", "x", "95", "200+", "12,")) else "strong",
                    "contribution_type": current_contribution,
                })
                if projects:
                    tech_hits = [
                        token for token in _split_tokens(bullet)
                        if any(ch.isupper() for ch in token) or token.lower() in {"python", "c++", "sql", "docker", "linux", "tensorflow", "mediapipe"}
                    ]
                    if tech_hits:
                        existing = projects[-1].setdefault("technologies", [])
                        for tech in tech_hits[:8]:
                            if tech not in existing:
                                existing.append(tech)

        tier = "junior"
        years_lower = years_experience.lower()
        if any(token in years_lower for token in ("4", "5", "senior", "staff")):
            tier = "senior"
        elif any(token in years_lower for token in ("2", "3", "mid")):
            tier = "mid"
        elif any("intern" in exp.get("title", "").lower() for exp in experiences):
            tier = "junior"

        return {
            "skills": skills[:20],
            "tools": tools[:15],
            "projects": projects[:6],
            "claims": claims[:10],
            "experiences": experiences[:6],
            "experience": {"ml": 0, "swe": 0, "data_eng": 0},
            "experience_tier": tier,
        }

    def _merge_with_fallback(self, parsed: dict, fallback: dict) -> dict:
        merged = dict(parsed or {})
        for key, fallback_value in fallback.items():
            current_value = merged.get(key)
            if isinstance(fallback_value, list):
                merged[key] = current_value if isinstance(current_value, list) and current_value else fallback_value
            elif isinstance(fallback_value, dict):
                merged[key] = current_value if isinstance(current_value, dict) and current_value else fallback_value
            else:
                merged[key] = current_value or fallback_value
        return merged

    async def parse(
        self,
        resume_text: str,
        target_role: str = "",
        years_experience: str = "",
    ) -> dict:
        result = await self.llm.call(
            system=PROMPT,
            user=(
                f"Target role: {target_role or 'not provided'}\n"
                f"Expected years of experience: {years_experience or 'not provided'}\n\n"
                f"Resume:\n{resume_text}"
            ),
        )
        fallback = self._heuristic_parse(resume_text, years_experience=years_experience)
        if not isinstance(result, dict):
            return fallback
        return self._merge_with_fallback(result, fallback)
