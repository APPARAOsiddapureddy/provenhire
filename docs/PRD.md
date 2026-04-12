# ProvenHire — Product requirements (index)

**Version:** 6.9 · **April 2026** (living docs — see **IMPLEMENTATION_CHANGELOG.md** for doc/code sync notes)

The product PRD is **split into four files** so engineers, PMs, and tools (e.g. Cursor) can open **only** the section they need. Use this page as the table of contents.

**April 2026 updates (captured in linked PRDs):** Software **system design** session shipped (LLD/HLD, camera, proctoring, shared TTS); **employer-chosen** next interview after AI Expert (**[PRD_RECRUITER.md](PRD_RECRUITER.md)** §7.6); verification **`expert_interview`** completes when the AI session ends; Human Expert unlock via recruiter selection or admin queue approve; **`JobApplication`** stores `recruiterNextInterviewMode`; admin queue may be **`recruiter_redirected`** when the employer picks a non–Human-Expert path.

| Document | Contents |
|----------|----------|
| **[PRD_CANDIDATE.md](PRD_CANDIDATE.md)** | Candidate platform: verification (**all tracks** — software, data, non-technical), scoring, routes, human expert interviewer module |
| **[PRD_RECRUITER.md](PRD_RECRUITER.md)** | Recruiter product: discovery, jobs, subscriptions, employer flows |
| **[PRD_BUSINESS.md](PRD_BUSINESS.md)** | Revenue, retakes, limits, engineering backlog |
| **[PRD_AI_INTERVIEW.md](PRD_AI_INTERVIEW.md)** | AI Expert Interview: adversarial v2 engine, voice/STT/TTS, APIs, §16 implementation status |

**Also:** [IMPLEMENTATION_CHANGELOG.md](IMPLEMENTATION_CHANGELOG.md) · [DEPLOYMENT_COMPLETE.md](DEPLOYMENT_COMPLETE.md) (ops, env, QA accounts) · [README.md](README.md)

**History:** Parts B–D were merged into one file for a period (v6.7–v6.8); **v6.9** restores separate files for navigation. The **canonical** specs live in the four linked documents above — not in a single monolith.
