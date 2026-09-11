@AGENTS.md

# Design system — Kaizen BMS marketing site

Scoped to the `(company)` route group only (`src/app/(company)/`), via the
`.kbms-site` wrapper + `kaizen.css`. Never leaks into other routes.

- **Palette:** off-white `--kbms-bg`, near-black `--kbms-ink`, muted `--kbms-ink-soft`,
  hairline `--kbms-line`, cyan `#08DCDC` accent (used sparingly). All theme-aware
  (light/dark) except three deliberately-permanent near-black blocks: the final
  `CTA`, the Technology flow panel, and the `Footer`.
- **Type:** serif display (`font-display`) for statements/headlines, sans (`font-body`)
  for everything functional.
- **Layout language:** thin borders, editorial rows (not cards), restrained
  display type (hero caps ~64px, section titles ~44px — refined, not poster-scale),
  compact vertical rhythm, calm motion.
- **Custom SVG only:** the abstract graphic system lives in `src/components/graphics/`
  (`primitives.jsx`, `ServiceGlyph.jsx`) plus `OrbitalGraphic.jsx`. No icon libraries,
  no stock imagery.
- **Service catalogue** is single-sourced from `src/lib/services.js`.

## Content density rules
- No "Why Choose Kaizen" / standalone value-proposition section on any page.
- Display type stays restrained — see the size scale in `SectionHeading.jsx`. Never scale headlines back up to poster size.
- Every section's supporting copy is one short line (~15 words max). Service / industry / step descriptions are short phrases, not sentences.
- The homepage's sector deep-dives (Healthcare, Technology, Digital Growth, Consulting, Case Studies) are consolidated into one tabbed `HowWeWork.jsx` section — don't split them back into separate full-screen sections.
- Before adding any new homepage section, check whether it restates something already on the page — if so, don't add it.

## Services & cross-property navigation
- There is no on-page "Services" section. Services live in `ServiceRail.jsx` — a slim fixed icon rail on the right edge of every page (md+; hidden on mobile), mounted in `(company)/layout.js`. Click an icon → a panel slides out with the service name, one line, and "Explore →" (its own page, or the enquiry form).
- Cross-property navigation (between Home, Hospital Management, Placement Services) is handled by the rail (the two entries with dedicated pages link straight to them), the header Services dropdown, and the footer Services column. There is no separate "network"/switcher section or header launcher — don't add one back.

# HMS product security & real-time rules (app.kaizenbms.in)

The Hospital Management System is the logged-in product living in this same
repo under the `(app)` route group (`/login`, `/dashboard/*`) plus `/api/*`.
It runs on the custom server (`server.js` = Next.js + Socket.io in one Node
process; `npm run dev` / `npm start` go through it). Marketing site is
unaffected and still served by the same process.

- **Multi-tenant, tenant-scoped.** Every tenant-scoped table has a
  `tenant_id` FK + index. The tenant id comes only from the verified JWT —
  never from the client. `proxy.js` verifies the session cookie on every
  `/dashboard/*` and `/api/*` request (except `/api/auth/login`), strips any
  client-supplied `x-kaizen-*` headers, and re-sets them from the verified
  token. API handlers use `apiRoute(action, handler)` which runs the body
  inside an AsyncLocalStorage tenant context; the repo layer
  (`src/lib/repo/tenant.js`) forces `tenant_id` into every query and throws
  if used outside that context. No raw string-concatenated SQL — mysql2
  prepared statements only.
- **Auth.** Passwords bcrypt (cost 12), never logged, never stored plain.
  Session = HS256 JWT (`{uid, hid, role}`, 8h) in an httpOnly + secure +
  sameSite=strict cookie. Never localStorage. Login is rate-limited to 5
  attempts / email / 15 min and returns a generic error (no user
  enumeration).
- **RBAC + module gating.** `src/lib/rbac.js` maps role -> actions;
  `src/lib/modules.js` maps action -> required `TenantModule`. Every module
  route checks both and returns **403** if the role lacks the action or the
  tenant's module is inactive — never a silent no-op.
- **Validation.** Every API body is zod-validated before it touches the DB;
  invalid -> 400.
- **Transport.** HTTPS only in production + HSTS (`next.config.mjs` headers,
  plus X-Content-Type-Options / X-Frame-Options / Referrer-Policy /
  Permissions-Policy on all routes).
- **Real-time (zero delay, no polling).** On a write, the API route emits in
  the same request cycle: `io.to(\`tenant:${tenantId}\`).emit(event, record)`
  (or the `tenant:<id>:<module>` room) via `src/lib/realtime.js`. Payload is
  the changed record itself, not a refetch signal. Clients
  (`src/lib/socketClient.js`): one fetch on mount, join rooms (server does
  this from the cookie), then update from socket events only — never
  `setInterval`. Exactly one fresh fetch on reconnect to resync. No
  optimistic-then-wait lag. For >1 server instance later, add
  `@socket.io/redis-adapter`.
- **Secrets** live in `.env` (gitignored), read via `process.env`, never
  hardcoded. Production runs the Node app and MySQL on the **same Hostinger
  account** (Node.js hosting / VPS, not PHP shared hosting), so
  `DB_HOST=localhost` and no Remote MySQL / IP whitelist is needed. See
  `.env.example`.
- **Build order** (do not skip ahead): 1. auth + RBAC + tenant scaffold
  (done). 1b. Tenant generalization — Tenant + type + tenant_modules,
  owner roles, print_branding table, migration 003 (done; awaiting prod
  apply). 2. Super Admin dashboard (create tenant / module rentals /
  suspend) — **not built yet, deliberately deferred** in favour of 3+4
  below. 3. PrintBranding edit-permission logic + solo/hospital branding
  screens — **done**, see "Print branding" below. 4. Registration +
  OPD/Doctor (built) + prescription print template — **done**. 5. Pharmacy —
  **done**: full inventory lifecycle (stock-in, batch-wise inventory,
  low-stock + expiry alerts, FEFO dispense, logged manual adjustments — see
  "Pharmacy inventory" below), not just dispensing. Purchase orders to
  suppliers deliberately out of scope for now. 6. Lab — scaffold exists
  (`(app)/dashboard/lab`), result entry + diagnostic report print not built
  yet — **next**. 7. Billing — scaffold exists (`(app)/dashboard/billing`),
  aggregation + receipt print not built yet.
  Also built out of the original numbered order, since the owner asked for
  them directly: the dashboard shell (registry-driven sidebar/topbar,
  `src/lib/navRegistry.js`), patient-journey IPD branch (migration 004),
  patient-safety/queue-display work (migration 005), and a dedicated `NURSE`
  role + `patients.gender` (migration 006) — see "Patient journey model",
  "Patient safety & queue display", and "Role hierarchy" below. After each
  module: real-time check in two tabs, and confirm a solo tenant sees only
  its one module's UI. Migrations 004, 005, 006 and 007 are pending owner
  apply —
  see "Database rule".
- **Module isolation.** Each module is a genuinely separate slice: its own
  route group / folder under `(app)/dashboard/<module>`, its own API
  namespace `/api/<module>/*`, its own Socket.io sub-room
  `tenant:<id>:<module>`. A tenant renting only Doctor/OPD must never have
  Pharmacy / Lab / Billing code paths active — enforced by module gating on
  every route, not by hiding nav.

## Database rule

There is **exactly one database** for this project — the production database.
No separate local/dev database exists. It has no real hospital/patient data
yet (pre-launch) but is treated with production-level caution from now on.

- **Nothing in this repo ever applies a schema change or seeds data to it.**
  Not in dev, not at deploy. No auto-migrate, no `db push`, no seed script
  hitting the DB.
- When a schema change is needed: write `migrations/NNN_<desc>.sql` (hand-authored
  — this repo uses mysql2 + raw SQL, the installed Prisma is the incompatible
  v8 RC), then tell the owner verbatim: *"Schema change ready — migration file
  at `migrations/NNN_<desc>.sql`. Run this on the database yourself before I
  build anything that depends on it."* Wait for the owner to confirm they
  applied it.
- Demo data: `npm run db:seed` writes `migrations/seed.sql` (no DB
  connection); the owner runs it by hand, once, on a fresh DB.
- `npm run db:migrate` only lists the migration files; it never connects.
  `scripts/dbApplyGuard.js` (`blockDbApply`) refuses **unconditionally** —
  it does not check DB_HOST or "is this local", because that distinction is
  gone.
- The app still needs a DB to run during development; whatever it connects to
  for `npm run dev` is kept schema-synced **by hand** with the migration
  files — never by a script.
- **Customizable form fields never trigger a migration** — that is the whole
  point of the `form_templates` + `custom_fields` pattern below.

## Role hierarchy

- **SUPER_ADMIN** (Kaizen platform team): `tenant_id = NULL` — not scoped to
  any tenant. Full platform control (see "Super Admin" section). A tenant
  owner can never become or impersonate one.
- **HOSPITAL_ADMIN** (hospital-type tenant owner): full control **within
  their own tenant only** — staff accounts, form customization, branding.
  Cannot enable a module Kaizen has not rented them (rental is SUPER_ADMIN's
  call). Cannot see or touch another tenant's data (tenant scoping, not UI
  hiding).
- **OWNER_DOCTOR / OWNER_PHARMACIST / OWNER_LAB_TECH** (solo-type tenant
  owner): combined owner + practitioner. Same tenant-scoped isolation; no
  staff hierarchy; edits own branding directly.
- **Staff** (DOCTOR, NURSE, PHARMACIST, LAB_TECH, BILLING_STAFF,
  RECEPTIONIST): scoped to their tenant **and** their module. A pharmacist
  hitting a consultation-write URL is rejected by the server-side RBAC check
  by role — not merely by a hidden button.
- **NURSE vs DOCTOR on IPD**: admitting/discharging (`admission:create`,
  `admission:update`) is a clinical decision — stays with `DOCTOR`. Day-to-day
  ward/bed status (`bed:manage` — mark a bed ready) and nursing notes
  (`nursingnote:create`) are nurse-run, not doctor-run — `DOCTOR` only has
  `nursingnote:read` (review vitals), not `create`. Both roles have
  `bed:read`.

`users.tenant_id` is **nullable** (NULL only for SUPER_ADMIN). The `role`
enum: SUPER_ADMIN, HOSPITAL_ADMIN, DOCTOR, NURSE, PHARMACIST, LAB_TECH,
BILLING_STAFF, RECEPTIONIST, OWNER_DOCTOR, OWNER_PHARMACIST, OWNER_LAB_TECH.

## Customizable forms

Tenant owners add/remove/reorder form fields themselves, with no schema
change and no deploy — via a template + flexible-storage pattern:

- **`form_templates`** — one row per (tenant, form_type). `form_type` ∈
  `PATIENT_REGISTRATION`, `CONSULTATION`, `LAB_ORDER`, `BILLING`. `fields` is
  JSON: `[{ fieldName, label, type, required, order, options }]`.
- Core entities (`patients`, `consultations`, …) keep their always-required,
  directly-queried columns as real typed columns (name, age, phone, …) **and**
  gain a `custom_fields` JSON column.
- Form-builder screen (HOSPITAL_ADMIN / solo owner, in their admin area)
  edits `form_templates.fields`. Code-defined core fields render as
  non-removable; the owner only manages the extra fields layered on top.
- On submit: core fields → typed columns; everything from the dynamic fields
  → `custom_fields` JSON. Zod validates the dynamic payload against **that
  tenant's current `form_templates.fields`** shape, not just the core fields.
- **Never model an owner's custom field as a real column** — that forces a
  migration per customization and breaks the production database rule.

## Per-module production-readiness checklist

Before any module is "done":
1. Tenant scoping — `tenant_id` from session, never client input.
2. Module gating — `tenant_modules.is_active` checked on every route.
3. RBAC matches the role hierarchy above.
4. Socket.io event fires in the same request cycle as the write.
5. Zod validation on every body, including custom fields vs the tenant's
   current `form_templates` shape.
6. No migration was applied to production — state this explicitly.
7. Tenant-type check where it matters (a solo tenant is not a hospital).

## Tenant types and packaging

`Tenant` (renamed from the earlier hospital-only concept; table `tenants`,
was `hospitals`) has a `type`: `HOSPITAL`, `DOCTOR_SOLO`, `PHARMACY_SOLO`, or
`LAB_SOLO`. `hospital_modules` → `tenant_modules`; every `hospital_id` →
`tenant_id`, still sourced only from the verified session.

- **HOSPITAL** — multi-staff hierarchy: `HOSPITAL_ADMIN` + staff roles
  (`DOCTOR`, `PHARMACIST`, `LAB_TECH`, `BILLING_STAFF`, `RECEPTIONIST`). Any
  combination of the four modules the Super Admin has rented.
- **DOCTOR_SOLO / PHARMACY_SOLO / LAB_SOLO** — one combined owner+practitioner
  login: `OWNER_DOCTOR` / `OWNER_PHARMACIST` / `OWNER_LAB_TECH`. Exactly one
  module active (DOCTOR_OPD / PHARMACY / LAB). No staff-management screen.
- Every route and screen checks **both** active `tenant_modules` **and** the
  tenant type. A solo tenant's UI must feel like a purpose-built single-role
  app, not a hospital dashboard with everything else hidden.
- Packs: Full Hospital Suite (HOSPITAL), Solo Doctor Pack (DOCTOR_SOLO →
  DOCTOR_OPD), Solo Pharmacist Pack (PHARMACY_SOLO → PHARMACY), Solo Lab Pack
  (LAB_SOLO → LAB). Super Admin's Create Tenant flow provisions the tenant,
  its `tenant_modules`, and the initial owner account with a temp password.

## Super Admin

`SUPER_ADMIN` (`tenant_id = NULL`) owns platform control: create tenants
(any type + pack), tenant list/detail (type, modules, staff count, created),
toggle any `tenant_modules.is_active` (rent / un-rent), deactivate /
reactivate a whole tenant (`tenants.active` — suspends all its logins,
keeps data). Platform-wide counts only — **no "view as tenant" browser into
a tenant's clinical data** (compliance decision, flag separately if needed).

## Print branding — built

`print_branding` (schema from 003) drives the header/footer on printed
prescriptions, lab reports, and receipts. `scope` ∈ `TENANT` | `DOCTOR` (the
latter carries `doctor_user_id`). `src/lib/branding.js` `resolveBranding(tenantId,
doctorUserId)` returns `{ header, signature }` — `header` is the tenant's own
row (or `{header_name: tenant.name}` if none set yet); `signature` is the
doctor's own row *only* when `tenants.allow_doctor_branding` is true and that
doctor has one, else the caller falls back to the plain staff name.

- **Solo tenants** (DOCTOR_SOLO / PHARMACY_SOLO / LAB_SOLO): the owner edits
  their own `scope=TENANT` branding directly (`PUT /api/branding/tenant`,
  action `branding:manage_tenant`, which `OWNER_*` roles carry) — it is their
  practice, no permission gate. For a solo doctor the TENANT row's
  `qualifications` field doubles as their own.
- **Hospital tenants**: default `scope=TENANT` branding, editable only by
  `HOSPITAL_ADMIN` (`branding:manage_tenant`). If `tenants.allow_doctor_branding`
  is true (toggled via `PATCH /api/branding/settings`), each staff doctor
  additionally gets a `scope=DOCTOR` editor (`PUT /api/branding/doctor`,
  action `branding:manage_own`) that layers their name/qualifications on top
  of the hospital header at the signature line — not a replacement. Settings
  screen: `(app)/dashboard/branding` (deliberately **not** under
  `dashboard/admin/` — that layout is HOSPITAL_ADMIN-only and would block a
  staff doctor from reaching their own branding screen; fine-grained
  tenant-vs-own visibility is driven by `GET /api/branding`'s
  `canManageTenant`/`canManageOwn`). That screen only shows the personal
  section when both conditions hold — never a screen that does nothing.
- The branding-update API enforces this server-side, re-checked independent
  of what the UI shows: a `TENANT` edit requires `branding:manage_tenant`; a
  `DOCTOR` edit requires `branding:manage_own` **and** `allow_doctor_branding`
  currently true (`/api/branding/doctor` throws 403
  `doctor_branding_not_enabled` otherwise).
- **Print views** are a separate authenticated route tree,
  `(app)/print/<doc-type>/[id]`, proxy-protected (`proxy.js` matcher includes
  `/print/:path*`) and tenant-scoped like everything else, but rendered
  through `(app)/layout.js` only — **not** `dashboard/layout.js` — so there is
  no sidebar/topbar, just the document + an on-screen `print:hidden` Print
  button. Prescription print
  (`(app)/print/prescription/[prescriptionId]`) is built: patient
  name/age/gender, date, diagnosis, medicine list (dosage field carries
  frequency+duration together, e.g. "1-0-1 × 5 days" — no separate columns
  for those), resolved branding header, and doctor name+qualifications at the
  signature line. Lab report (full diagnostic structure — results table with
  reference intervals, signing pathologist, clinical-correlation disclaimer)
  and billing receipt are **not built yet**.

## Pharmacy inventory

`(app)/dashboard/pharmacy` (module `PHARMACY`) is two tabs: the prescription
queue (dispense) and Inventory. Full lifecycle, not just dispensing —
purchase orders to suppliers are the one deliberate scope cut, for later.

- **`pharmacy_stock`** is batch-level (medicine × batch × expiry × quantity),
  unique per `(tenant_id, medicine_name, batch_number)` — stocking in an
  already-known batch increments it rather than creating a duplicate row.
- **`pharmacy_stock_movements`** is a single append-only ledger for the whole
  lifecycle (`type` ∈ `IN` / `DISPENSE` / `ADJUSTMENT`) — this *is* the audit
  trail: every manual adjustment carries a `reason` and `performed_by`, every
  dispense links back to the `prescription_item_id` and the batch(es) it drew
  from.
- **`pharmacy_thresholds`** — per-medicine low-stock threshold (`stock:adjust`
  to change it), default 10. Inventory aggregates quantity across a
  medicine's batches and flags `lowStock` when the total is at/under it.
- **Expiry alerts**: a batch within `EXPIRY_WARNING_DAYS` (30,
  `src/lib/pharmacyConstants.js`) of its `expiry_date` is flagged
  "expiring soon"; past it, "expired". Expired stock stays visible (frozen)
  until written off via a manual adjustment — never auto-removed.
- **FEFO dispensing** (`POST /api/pharmacy/dispense/[itemId]`, action
  `dispense:create`): consumes a prescription line's outstanding quantity
  from non-expired batches ordered by `expiry_date ASC` (row-locked
  `FOR UPDATE` inside a transaction), oldest expiry first, spanning as many
  batches as needed. **Partial dispensing is allowed** — if stock falls
  short, dispenses what's available and leaves the rest outstanding
  (`prescription_items.status` stays `PENDING` with partial
  `dispensed_quantity`, or flips to `OUT_OF_STOCK` if nothing was available
  at all). The prescription header status is recomputed from all its items:
  `FULFILLED` only when every item is fully dispensed, `PARTIALLY_FULFILLED`
  if any progress was made, else `PENDING`.
- Actions: `stock:read` (view), `stock:create` (stock-in), `stock:adjust`
  (manual correction + set thresholds), `dispense:create`/`dispense:read` —
  all `PHARMACIST` / `OWNER_PHARMACIST`, all module-gated on `PHARMACY`.

## Product UI

The HMS product uses **shadcn/ui + Tailwind** in a plain, fast, functional
dashboard style — optimised for data-entry speed under time pressure, not
visual flair. The marketing site's black/off-white/cyan editorial system is
scoped to `(company)` only and must never appear in the product.

- Sidebar nav scoped to the user's role + active modules + tenant type.
- Every list screen is a real data table: sortable, searchable, paginated.
- Forms use the dynamic `form_templates` + `custom_fields` pattern.
- Live-arriving rows get a brief highlight so staff notice them
  (`hms-flash` in `(app)/app.css`).

## Patient journey model

Every clinical interaction hangs off a `Visit`, not directly off a
`Patient` — this is what distinguishes two separate visits by the same
patient. `visits.entry_type` ∈ `OPD`, `EMERGENCY`, `DIRECT_ADMISSION`.
`visits.status` carries both the original OPD granularity
(`REGISTERED`/`WITH_DOCTOR`/`PHARMACY`/`LAB`/`BILLING`/`DISCHARGED`/
`CANCELLED`, unchanged so already-built screens keep working) and the IPD
additions `TRIAGE` and `ADMITTED`. A visit may lead to an `Admission` (IPD:
`beds` + `admissions` + `consent_forms` + `nursing_notes`) or go straight to
discharge. Four discharge types: `ROUTINE`, `TRANSFER`,
`AGAINST_MEDICAL_ADVICE`, `DEATH`.

**IPD / beds** (`(app)/dashboard/ipd`, `/api/ipd/*`, module `IPD`,
`tenantTypes: ["HOSPITAL"]` only): `beds` is a per-tenant master list
(`ward_type` × `bed_number`, `status` VACANT/OCCUPIED/CLEANING/MAINTENANCE).
Admitting sets the bed OCCUPIED and the visit ADMITTED; discharging sets the
bed CLEANING (a manual "mark ready" action — `bed:manage` — moves it back to
VACANT; no full housekeeping workflow) and the visit DISCHARGED. Nursing
notes carry free text + a flexible `vitals` JSON (bp/pulse/temp/spo2) rather
than one column per vital sign.

## Event taxonomy — the module connection mechanism

Modules react to the same shared event stream instead of calling each
other's code or querying each other's tables directly — that discipline is
what makes a module work identically whether it's one of several active
modules in a hospital or the only module in a solo pack. Existing events use
`resource:verb` room-scoped names (`prescription:created`,
`bed:updated`, …) emitted via `emitToTenant` / `emitToModule` in
`src/lib/realtime.js`. `visit.called` (dot-style, the waiting-room "Call
Next" announcement) is the first event following the ADT/ORM/ORU-style
taxonomy named in the product spec; a full rename pass across every emit
site is deferred, tracked as future step 4 of the patient-journey work —
don't invent further one-off event-name conventions in the meantime.

## Patient safety & queue display

- **Allergies** (`patients.allergies` JSON): a chip/tag input, never a
  free-text paragraph. Shown as a persistent red badge
  (`AllergyBadge`) next to the patient's name everywhere they appear —
  never behind a click or a tab. `src/lib/allergyCheck.js` does
  allergy-**name** matching only (a small drug-alias table) when a doctor
  adds a prescription line — **not** a drug-drug interaction checker, which
  needs a licensed clinical database and would be a separate, larger piece
  of work. A match blocks saving until the doctor ticks an explicit
  acknowledgement; the override is logged to `prescription_item_acks`
  (who, when) and re-verified server-side — the client's warning is a UX
  convenience, never the authority.
- **ABHA ID** (`patients.abha_id`): plain optional text capture only. No
  ABDM API integration (no health ID creation, no consent manager, no FHIR)
  — the column just avoids a future migration when that integration lands.
- **Queue token** (`visits.token_number`): sequential per tenant per day,
  assigned at check-in. "Call Next" (`/api/opd/queue/call-next`) advances
  the oldest waiting token and emits `visit.called`.
- **Waiting-room display** (`/display/queue/<tenant-slug>`): deliberately
  outside `(app)`/`(company)` and unauthenticated — a physical TV has no
  login. `proxy.js` `PUBLIC_API_PREFIXES` exempts `/api/display/*`. The
  socket connection presents `displayTenant=<slug>` instead of a session
  cookie (see `server.js`) and is granted **only** the tenant's `:display`
  room — never the full tenant room or any module room. Every payload sent
  to that room is sanitized (token numbers only, e.g. `visit.called` carries
  `{tokenNumber, room}`) — never a patient name or other clinical data.
