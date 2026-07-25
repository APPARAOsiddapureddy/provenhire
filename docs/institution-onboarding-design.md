# Institution (Campus) Onboarding Portal — Design

Status: in progress, started 2026-07-23.

The product already supports **recruiters** hiring and **candidates** getting verified.
This adds a third entry point: a **college / institution** onboarding itself to run
campus placement-readiness drives (Aptitude, Coding/DSA, SQL, AI Placement Interview)
for its own students.

## Decisions taken with the product owner

| Question | Decision |
| --- | --- |
| Where it lives | Routes on `provenhire.in` (`/campus`, `/campus/login`, `/campus/...`) inside the existing React app. Own login, own shell, own nav — reads as a separate portal without a second codebase or a new DNS/TLS dependency. |
| Access gate | **Instant** access on signup. An institution can explore and build a drive in **draft** immediately; **publishing a live drive to real students requires platform approval**. |
| Student onboarding | All three: (1) bulk email upload to the existing allowlist + join-by-code, (2) automatic invite emails, (3) pre-created student accounts. |
| Structure | Institution is the **tenant**; it runs **many drives** (one `Workspace` each), so batches roll over year to year and analytics can aggregate across drives. |

### Two safety constraints the owner agreed to

- **Pre-created student accounts carry no passwords.** Each student gets a
  single-use activation link and sets their own password. The institution never
  receives or distributes a credential.
- **Bulk invite email is built and tested, but a real send to real student
  addresses requires explicit per-send confirmation from the owner.** Test
  addresses only until then.

## Why a distinct `institution` role is mandatory

`UserRole.admin` is the **platform superadmin**, not a customer role:

- Every workspace admin screen is gated `allowedRole="admin"` (`src/App.tsx`).
- `assertCanManageWorkspace` early-returns for *any* `role === "admin"`
  (`server/src/services/workspaceRegistration.service.ts:746`).

So onboarding a college as `admin` would let every college read every other
college's drives, candidates and reports. Institutions therefore get their own
`UserRole.institution`, and isolation then holds by construction: the early
return doesn't apply to them, and the fallthrough only grants access via
`Workspace.ownerUserId` or a `WorkspaceMember` row.

The one deliberate addition is an **institution-scoped** branch so that placement-cell
staff can manage *all* drives owned by their own institution without a
per-drive membership row — scoped by joining `Workspace.institutionId` to the
actor's institution, never by role alone.

## Data model (additive)

```
Institution
  id, name, slug (unique), contactEmail, status: pending|approved|suspended
  # supplementary, all optional, filled later in Settings
  website, addressLine, city, state, country, pincode,
  affiliation, aicteCode, naacGrade, studentCount, placementCellHead, phone, logoUrl
  createdAt, updatedAt

InstitutionMember          # placement-cell staff at tenant level
  institutionId, userId, role: owner|manager|reviewer, invitedByUserId,
  removedAt, removedByUserId
  @@unique([institutionId, userId])

User.role                  += institution
Workspace.ownerRole        += institution
Workspace.institutionId    -> Institution?   (null for recruiter/admin-owned workspaces)
```

`Workspace` keeps working exactly as it does today for recruiters and platform
admins; `institutionId` is simply null for those.

## Onboarding page — UX principles applied

Grounded in current B2B SaaS guidance (single-CTA pages convert ~13.5% vs ~10.5%
for five-plus CTAs; value prop must land in under 5 seconds; progressive
disclosure over dumping the whole system; executives specifically need
*reporting visibility* as their activation signal).

Concretely, for this audience (placement officers / TPOs / deans — senior, not
detail-readers):

1. **One focal point per viewport.** Each screenful has exactly one thing the eye
   should land on first. No competing CTAs.
2. **Under-5-second value prop.** One headline that says what this does for
   *their* placement season, not what the platform is.
3. **The four rounds as a horizontal numbered step diagram** — icon + stage name
   + one line each. This is the single highest-value graphic on the page: it
   answers "what will my students actually do" without a paragraph.
4. **Lead with the outcome, not the mechanism.** Show a compact preview of the
   readiness read they get (batch strength → placement-ready count), because
   reporting visibility is what actually converts this buyer.
5. **Signup is 3 fields.** Institution name, email, password. Everything else is
   deferred to Settings and explicitly labelled as optional/later.
6. **Text budget.** Every block gets a heading and at most one sentence. If a
   sentence isn't load-bearing, it's cut — density is the failure mode here, not
   sparseness.

## Build order

1. `Institution` + `InstitutionMember` models, `institution` role, additive migration.
2. Institution-scoped authorization (+ tests proving cross-tenant denial).
3. Backend: signup/login, own-institution read/update, drives CRUD scoped to tenant, roll-up analytics.
4. Student roster: bulk allowlist upload, activation-link account creation, invite path.
5. Public `/campus` onboarding + 3-field signup.
6. Portal UI: dashboard, drives, staff, students, settings.
7. End-to-end test with disposable institution + students, verify isolation, then deploy.
