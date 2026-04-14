# AI interview production notes

Short runbook for the interview HTTP surface: rate limits, telemetry, and idempotent turns.

## Environment

| Variable | Purpose |
|----------|---------|
| `INTERVIEW_TELEMETRY` | When `false` / `0` / `off`, disables structured `interview_telemetry` logs. Default: enabled. |
| `LOG_LEVEL` | Pino level for the telemetry logger (default `info`). |

Telemetry events include hashed `userRef` (SHA-256 prefix of `userId`), route, status, timings, and sizes. They do **not** include answer text or transcripts.

## Rate limits

Defined in `server/src/middleware/interviewRateLimit.ts`. Keys prefer authenticated `user.id`, else client IP.

- Start endpoints (including legacy `POST /api/interview/start`): burst protection per user/IP.
- Turn / transcribe / TTS / partial transcript: separate buckets.

Tune limits there if you see 429s in legitimate traffic.

## Turn idempotency

`POST /api/interview/v2/turn` and `POST /api/interview/ai-skills/turn` accept optional `turnId` (stable per submission). When present and at least 8 characters, duplicate requests within the TTL return the cached JSON instead of re-running the model. Clients should send a UUID per turn (see `ExpertInterviewStage` and `AISkillsInterviewStage`).

Dedup is **in-memory** per server process. Multiple app instances do not share dedup state unless you add Redis (or similar) later.

## Operations

- Ship stdout JSON logs to your aggregator and filter on `name: "interview_telemetry"` or `event` prefixes like `interview_`.
- For multi-dyno deployments, treat rate limits and dedup as best-effort per instance unless you centralize them.

## Additional telemetry events

| Event prefix | Routes |
|--------------|--------|
| `interview_data_sd_turn` / `_error` | Data SD `POST .../data-system-design/turn` |
| `interview_data_sd_status` / `_error` | Data SD `GET .../data-system-design/status` |
| `interview_software_sd_turn` / `_error` | Software SD `POST .../system-design/turn` |
| `interview_software_sd_status` / `_error` | Software SD `GET .../system-design/status` |
| `interview_tts_filler` / `_error` | `GET .../tts-filler` (optional `index`, precached vs live TTS; no filler text) |
| `interview_deepgram_token` | `GET .../deepgram-token` (`deepgramAuth`: bearer, token fallback, or none; never logs the secret) |
