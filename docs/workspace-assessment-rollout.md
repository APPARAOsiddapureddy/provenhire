# Workspace assessment rollout

This release changes two independently deployed applications. Roll out in the
following order so every producer remains compatible with its consumer.

## 1. Preflight

- Confirm both repositories are built from `codex/workspace-report-pipeline`.
- Confirm the ProvenHire and Placement webhook secrets match on both services.
- Confirm `PROVENHIRE_API_URL` on Placement points to the live ProvenHire API.
- Keep `PLACEMENT_READINESS_CUSTOM_DOMAIN_READY=false` until DNS, Vercel domain
  binding, and TLS are all verified.
- Set `PLACEMENT_READINESS_FALLBACK_WEB_URL` to
  `https://provenhire-placement-ag-ui.vercel.app`.

## 2. Database and backend order

1. Apply the ProvenHire Prisma migration. The new audit table is additive.
2. Deploy the ProvenHire Render service.
3. Verify `/health` and confirm the assessment workflow worker starts without a
   Prisma or environment error.
4. Deploy the Placement Render service.
5. Verify its health endpoint and confirm finalization/outbox workers start.

The workers reconcile historical gaps automatically:

- Placement recreates a deterministic ready/failed callback when a persisted
  report or terminal finalization exists without an outbox event.
- ProvenHire creates a missing candidate-report workflow job for persisted
  Placement Readiness artifacts.

## 3. Frontends

1. Deploy the Placement AG-UI Vercel project.
2. Smoke test its current Vercel URL directly.
3. Deploy the ProvenHire Vercel project.
4. Smoke test a candidate workspace and an admin workspace.

## 4. Custom domain

`placement.provenhire.in` currently has no DNS record. Do not route candidates
to it yet.

1. Add the domain to the Placement Vercel project.
2. Add the exact DNS record Vercel requests at the authoritative DNS provider.
3. Wait until public DNS resolves and Vercel reports a valid certificate.
4. Verify `https://placement.provenhire.in/launch` reaches the Placement app.
5. Set `PLACEMENT_READINESS_WEB_URL=https://placement.provenhire.in` and
   `PLACEMENT_READINESS_CUSTOM_DOMAIN_READY=true` on ProvenHire, then redeploy
   the ProvenHire backend.

Until step 5, launch URLs intentionally use the known-good Vercel fallback.

## 5. Authenticated smoke test

Use a disposable invite-only workspace configured with MCQ, coding, SQL, and
interview rounds.

1. Invite one candidate directly and confirm the invitation and audit event.
2. Join as that candidate and complete MCQ, coding, and SQL.
3. Launch Placement Readiness from the workspace.
4. Finish the interview and confirm the completion screen returns to the
   workspace without waiting indefinitely.
5. Confirm the workspace first shows report processing, then a detailed report.
6. Confirm the admin dossier has four configured modules and the candidate view
   does not expose raw SQL judge diagnostics.
7. Remove the candidate, verify active local attempts are discarded, restore
   the candidate, and confirm the audit trail records both actions.
8. End the workspace, then archive it. Confirm a started workspace cannot be
   archived without the explicit end step.

## 6. Operational signals

Watch for these structured events during the smoke test:

- `placement_finalization_claimed`
- `placement_finalization_completed`
- `placement_callback_delivered`
- `placement_ready_callback_reconciled`
- `placement_callback_ingested`
- `placement_report_jobs_reconciled`
- `workspace_audit_event`

Use the workspace technical desk to inspect configuration health, handoffs,
workflow jobs, incidents, and the audit trail. Secrets are represented only as
configured/not-configured booleans.

## 7. Rollback

- Keep the additive database migration in place; old code safely ignores it.
- Roll back the frontends first, then the backends in reverse deployment order.
- Keep the fallback URL active if the custom domain fails.
- Do not delete artifacts, attempts, handoffs, workflow jobs, outbox rows, or
  audit events during rollback; they are the recovery evidence.
