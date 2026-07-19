# Antigravity report persistence and workspace dossier

## Production data path

1. ProvenHire creates an `Interview` and `AntigravityHandoff`, then sends the candidate to the standalone Antigravity frontend.
2. Antigravity owns the live voice session in Redis, while every telemetry event is also appended to its Postgres `interview_events` table.
3. Finalization builds one `final_report_v2` artifact containing the normalized report, `final_evidence_packet`, transcript/history, per-answer scores, telemetry summary, and telemetry events.
4. Antigravity first upserts the artifact into its own Postgres `sessions` row and enqueues the signed `handoff_complete` payload in `delivery_outbox`.
5. ProvenHire verifies the HMAC signature, idempotently upserts `AntigravityReport`, inserts append-only `AntigravityTelemetryEvent` rows, and completes the related `Interview`.
6. The Antigravity outbox retries failed callbacks with bounded exponential backoff. ProvenHire polling/manual sync remains an idempotent reconciliation path.

Redis is live state, not the durable record. ProvenHire Postgres is the system of record for candidate-facing/recruiter-facing assessment history.

## Required deployment configuration

Antigravity Render service:

- `DATABASE_URL`: Antigravity Postgres.
- `ANTIGRAVITY_REQUIRE_POSTGRES=1`: makes readiness fail if durable storage is unavailable.
- `PROVENHIRE_API_URL`: canonical ProvenHire Render backend URL.
- `ANTIGRAVITY_WEBHOOK_SECRET`: same long random value as ProvenHire.

ProvenHire Render service:

- `DATABASE_URL`: ProvenHire Postgres.
- `ANTIGRAVITY_API_URL`: canonical Antigravity FastAPI URL.
- `ANTIGRAVITY_FRONTEND_URL`: canonical Antigravity Next.js URL.
- `ANTIGRAVITY_WEBHOOK_SECRET`: same value as Antigravity.

## Database rollout

Deploy the ProvenHire migration `20260715120000_antigravity_reports_and_telemetry` before accepting new completion callbacks. Render's `npm start` already runs the migration retry script.

The Antigravity service creates/extends its own persistence tables idempotently during lifespan startup. `/readinessz` must show Postgres as healthy in production.

## Workspace API

`GET /api/workspaces/:workspaceId/registrations/:userId/dossier` is restricted to a workspace manager/admin. It returns:

- workspace round attempts and weighted scores;
- latest/history aptitude results;
- latest/history DSA results;
- latest/history Antigravity reports, evidence, transcript, and telemetry counts.

The admin workspace registration table exposes this response through the **Reports** action.

## Idempotency and recovery

- Antigravity outbox uniqueness: `(session_id, destination, event_type)`.
- ProvenHire report uniqueness: `interviewId` and `antigravitySessionId`.
- Telemetry event identity: Antigravity `event_id` is the ProvenHire primary key.
- Duplicate callbacks update the same report and skip duplicate telemetry events.
- If the callback is unavailable, Antigravity retries; the ProvenHire `/status`, `/finalize`, and `/handoff-sync` paths can reconcile from `/report/:sessionId`.
