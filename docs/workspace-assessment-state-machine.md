# Workspace assessment state machine

This document is the cross-service contract for ProvenHire workspaces and the
Placement Readiness interview service. It defines the states that the UI, APIs,
workers, and operator tooling must agree on.

## Invariants

1. A workspace round is required because it is configured, not because a UI
   happens to know about a hard-coded module name.
2. A removed registration cannot start, continue, submit, or relaunch an
   assessment. Restoration is explicit and auditable.
3. Starting an external interview and completing its report are separate
   events. A completed conversation is not the same as a ready report.
4. Placement finalization has one owner: the durable worker. Request handlers
   enqueue work and return a bounded response; they do not race the worker.
5. Callback delivery uses an outbox and deterministic event IDs. Duplicate
   delivery is safe and callback ingestion is idempotent.
6. Raw, persisted assessment evidence is canonical. Generated reasoning is a
   versioned, regenerable projection and cannot replace missing evidence.
7. Hiring decisions require every configured round to have complete evidence,
   verified candidate/workspace/role binding, an employer rubric, and a named
   human reviewer.

## Workspace lifecycle

`draft -> published -> started -> ended -> archived`

- Drafts may be edited or deleted.
- Publishing validates dates, rubric, round ordering, total weight, and question
  availability.
- Only published workspaces may start. A workspace whose end time has passed is
  ended automatically.
- Ending closes new joins and new assessment starts but preserves reports.
- Archiving is a reversible presentation state over an ended workspace; it does
  not delete evidence.
- Deletion is limited to drafts with no registrations or attempts.

## Registration lifecycle

`invited -> registered -> removed -> registered (restored)`

- Public workspaces do not require an invitation. Invite-only workspaces require
  an active allow-list entry for the authenticated email.
- Removing a registration discards active local attempts and prevents external
  relaunch/continuation. Restoring does not resurrect discarded attempts.
- Invitation removal and member removal are different actions: revoking an
  unused invitation does not delete a registered member.

## Round attempt lifecycle

`active -> completed | auto_completed | discarded`

- The unique `(registration, round)` constraint makes start idempotent.
- Completed and auto-completed attempts are immutable evidence snapshots.
- An active attempt may continue only while the registration is registered and
  the workspace is started and within its time window.

## Placement handoff and report lifecycle

`created -> launched -> started -> processing -> completed | failed | expired`

- `created`: ProvenHire issued a short-lived opaque token.
- `launched`: Placement consumed the token.
- `started`: Placement persisted a session and acknowledged it by callback.
- `processing`: the interview ended and durable finalization is pending/running.
- `completed`: a validated report artifact was persisted in ProvenHire.
- `failed`: finalization exhausted retries and emitted a failure callback.
- `expired`: an unused launch token passed its expiry.

The candidate workspace must render all non-terminal states and provide a safe
retry for pre-start states. It must never claim that a report is ready until the
artifact exists.

## Report readiness

For each configured round, readiness is derived from the attempt plus its raw
evidence:

- `not_started`: no attempt exists.
- `in_progress`: attempt is active.
- `processing`: assessment is complete but its durable report projection is not.
- `ready`: required evidence exists and passes completeness checks.
- `failed`: a terminal generation or delivery failure is recorded.
- `discarded`: the attempt was invalidated by removal or policy.

The dossier exposes configured modules in round order. Supported module keys are
`aptitude`, `coding`, `sql`, and `interview`; repeated round types remain distinct
through their round and attempt IDs.

## Operational requirements

- Every worker claim, retry, terminal failure, outbox delivery, callback ingest,
  member removal/restoration, invitation change, and lifecycle transition emits
  structured logs with stable IDs.
- Operator tooling shows stale handoffs, blocked report jobs, undelivered outbox
  events, missing configuration, and the last actionable error.
- Production startup validates the Placement web URL, callback URL, and shared
  secrets. DNS is a deployment responsibility; code must expose misconfiguration
  instead of producing an unreachable launch URL silently.
