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
  inside an AsyncLocalStorage tenant context; `tenantDb` (Prisma, see
  "Prisma" below) forces `tenant_id` into every query and throws if used
  outside that context. No raw string-concatenated SQL — every raw query is
  parameterized (`$queryRawUnsafe` with `?` placeholders, never string
  interpolation).
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
  hardcoded. Dev (this machine) connects to the real database over
  Hostinger's **Remote MySQL** (`DB_HOST=srv1872.hstgr.io`, not `localhost`
  — Remote MySQL + this machine's IP are enabled/whitelisted on the
  Hostinger side). When the Node app is eventually deployed onto Hostinger
  itself, that deployment's own env vars can use `DB_HOST=localhost`
  instead — that's a property of *where the app runs*, not a fixed value.
  See `.env.example`.
- **Build order** (do not skip ahead) — **all 7 steps done as of
  2026-09-11**: 1. auth + RBAC + tenant scaffold. 1b. Tenant generalization
  (Tenant + type + tenant_modules, owner roles, print_branding). 2. Super
  Admin dashboard — tenants list, Create Tenant (provisions tenant +
  modules + owner with a shareable temp password), tenant detail (module
  toggles, staff list, suspend/reactivate), Module Registry (a read-only
  catalog, not a dynamic "add module" form — see "Super Admin" below for
  why). 3. PrintBranding. 4. Registration + OPD/Doctor + prescription
  print. 5. Pharmacy — full inventory lifecycle (stock-in, batch-wise
  inventory, low-stock + expiry alerts, FEFO dispense, logged manual
  adjustments — see "Pharmacy inventory" below); purchase orders to
  suppliers deliberately out of scope. 6. Lab — result entry + diagnostic
  report print. 7. Billing — OPD (aggregated at checkout) + IPD (a running
  bill, event-driven) + receipt print — see "Billing module" below.
  Also built out of the original numbered order, since the owner asked for
  them directly: the dashboard shell (registry-driven sidebar/topbar,
  `src/lib/navRegistry.js`), the patient-journey IPD branch, patient-safety/
  queue-display work, and a dedicated `NURSE` role + `patients.gender` — see
  "Patient journey model", "Patient safety & queue display", and "Role
  hierarchy" below. After each module: real-time check in two tabs, confirm
  a solo tenant sees only its one module's UI. All migrations through
  012 are applied (see "Database rule" for the current auto-apply flow).
- **Module isolation.** Each module is a genuinely separate slice: its own
  route group / folder under `(app)/dashboard/<module>`, its own API
  namespace `/api/<module>/*`, its own Socket.io sub-room
  `tenant:<id>:<module>`. A tenant renting only Doctor/OPD must never have
  Pharmacy / Lab / Billing code paths active — enforced by module gating on
  every route, not by hiding nav.

## Database rule (updated 2026-09-11 — supersedes the earlier manual-only policy)

There is **one database** (still no separate dev database, still effectively
production). Prisma may apply schema migrations directly via
`prisma migrate deploy` (or equivalent) — this reverses the project's
earlier manual-only policy. Before every auto-applied migration, take a
timestamped backup automatically first, unless explicitly told to skip it
for a specific change. Direct manual edits to production data outside
normal app CRUD or a proper migration remain forbidden — this rule change
concerns schema/migrations only, not ad-hoc data changes.

**What "equivalent" means in practice here:** `prisma/schema.prisma` is
introspected (`db pull`), not hand-authored, and there's no baselined
Prisma migration history — running literal `prisma migrate deploy` isn't
usable without first baselining every migration already applied by hand.
So the actual mechanism is `migrations/NNN_<desc>.sql` files (unchanged —
still hand-authored SQL, still numbered/ordered) applied by
`npm run db:migrate`, which now really connects:

1. `scripts/dbApplyGuard.js` backs up the whole database first
   (`backupDatabase()` — pure-JS `mysqldump` npm package, no CLI binary
   needed/available on this machine) to `backups/<timestamp>__<label>.sql`
   (gitignored — never committed, it's a full data dump), unless
   `skipBackup`/`--skip-backup` was explicitly requested for that change.
2. Applies every `migrations/*.sql` file not yet recorded in the
   `_kaizen_schema_migrations` tracking table, in order, stopping at the
   first failure.
3. The first-ever run baselines every migration file already in the repo
   as applied (they already are, by hand, from before this policy changed)
   without re-executing them — only files added after that point actually
   run.
4. After a successful apply, run `npx prisma db pull` so
   `prisma/schema.prisma` stays in sync with what just changed.

- Demo data stays manual: `npm run db:seed` only writes `migrations/seed.sql`
  (no DB connection); the owner still runs it by hand, once, on a fresh DB —
  this policy change is schema/migrations only, seeding is unaffected.
- **Customizable form fields never trigger a migration** — that is the whole
  point of the `form_templates` + `custom_fields` pattern below.

## Prisma

The originally-installed `prisma@8.0.0-rc` ("Prisma Next", data-contracts
CLI) was incompatible with the standard workflow and is **replaced** with
stable, pinned **`prisma@6.19.3` / `@prisma/client@6.19.3`** — a normal
Prisma, normal `schema.prisma`, normal CLI. `prisma/schema.prisma` was
generated by introspecting the live production database —
`npx prisma db pull` — not hand-written; re-run that after every migration
the owner confirms applied, to keep it in sync. `npx prisma studio` is the
project's day-to-day **database GUI** (browse/edit rows) — genuinely useful
right now, independent of anything below.

**Deployment gotchas found and fixed 2026-09-12 — two SEPARATE bugs, not
one masking the other:**

1. **Missing generated Prisma Client.** `@prisma/client`'s actual client
   code is *generated* (`prisma generate`, from `schema.prisma`) into
   `node_modules/@prisma/client` — a fresh `npm install` alone does not run
   it. Locally this went unnoticed because `node_modules` had already been
   generated once and kept getting reused; a deploy platform's fresh
   `npm install` doesn't have that head start, so the build failed with
   `@prisma/client did not initialize yet`. **Fixed twice over**, since a
   `postinstall` script alone isn't safe against a platform that skips
   lifecycle scripts on install: `package.json` has both
   `"postinstall": "prisma generate"` **and** `"build": "prisma generate &&
   next build"`. Verified against the worst case — `npm install
   --ignore-scripts` (postinstall never runs) followed by plain
   `npm run build` — succeeds.
2. **Next.js 16.x internal `/_global-error` prerender crash** (`TypeError:
   Cannot read properties of null (reading 'useContext')`), still
   UNRESOLVED as of the last redeploy attempt — this has taken multiple
   rounds and needs a clear head next time, not more one-off guesses:
   - **This bug never reproduces on this dev machine**, only on the deploy
     platform, on every attempt — so nothing below could be locally
     verified to actually fix it, only verified not to break the local
     build. Treat any future fix attempt here the same way: honest with the
     owner that a real redeploy is the only test that counts.
   - Traced into Next's own built-in error component
     (`node_modules/next/dist/.../client/components/builtin/global-error.js`
     → `DefaultGlobalError`) — not this app's code. Confirmed: no custom
     `global-error.js` exists in this repo, and no `createContext()` call
     exists anywhere in `src/` — rules out the "app's own Context has no
     default value" variant of this bug class (vercel/next.js#94667)
     described for some other projects hitting the same symptom.
   - **Tried, on the real deploy, confirmed NOT sufficient on their own**:
     `experimental.cpus: 1` (ruling out build-worker parallelism —
     vercel/next.js#86178/#95741 — as sufficient alone) and bumping
     `next`/`eslint-config-next` to the latest stable patch (16.3.5) at the
     time. Removed the `cpus: 1` workaround afterward since it only cost
     build time with no benefit shown.
   - **Tried and also confirmed NOT sufficient**: `reactCompiler: true`
     removed (commented out, not deleted, in `next.config.mjs`) — still
     crashed on a real redeploy, same digest.
   - **Tried and also confirmed NOT sufficient**: a custom, deliberately
     minimal `src/app/global-error.js` (no imports beyond React, no
     hooks) to fully replace Next's built-in `DefaultGlobalError` —
     **still crashed, identical error digest (`2519078630`) as earlier
     attempts.** This is the most important negative result so far: it
     proves the crash isn't in global-error component code at all (ours
     or Next's default) — it happens in Next's rendering/prerendering
     machinery *around* whatever component sits at that route, before
     that component's own code runs. Left the file in place regardless
     (harmless, and a reasonable component to own long-term either way).
   - Also ruled out **Node.js version**: deploy platform reports Node
     22.x vs this machine's 24.11.1 — downloaded a standalone Node
     v22.11.0 binary and ran the build directly under it here; passed
     identically to every other local attempt. Not the differentiator.
   - **Currently trying**: switched the production build from Turbopack
     (Next 16's default) to webpack — `"build": "prisma generate && next
     build --webpack"` in `package.json`. The specific upstream GitHub
     issues for this exact crash (vercel/next.js#86178, #95741) both
     involve Turbopack; webpack is Next's official, fully-supported
     fallback bundler, not a hack. Verified locally: builds clean, and
     the resulting production server actually serves pages correctly
     (`next start`-equivalent smoke test, HTTP 200 on `/` and `/login`)
     — stronger verification than prior attempts, though still not proof
     it fixes the real deploy, since the crash still doesn't reproduce
     here under Turbopack either.
   - Deploy platform is **Hostinger** (their own Node.js app hosting,
     same account as the production MySQL database) — not Vercel/Netlify/
     Render. Worth remembering: Hostinger's Node hosting is less
     battle-tested for cutting-edge Next.js/Turbopack combinations than a
     JS-specialist platform would be.
   - **If webpack also fails**, remaining untried levers in rough order:
     Next's `--debug-prerender` build flag (one report said it "avoids
     the bug" by changing render scheduling — worth a shot even though
     it's documented as debug-only, not for production use); a newer
     16.3.x/16.4.x stable release if one lands; and, as the last resort,
     pinning back to Next 15.5.6 (confirmed by the community not to have
     this regression) — a bigger change since this project's `AGENTS.md`
     explicitly flags it was built against Next 16-specific conventions,
     so that would need real regression testing, not just "does it build."

**Status: migration complete, mysql2 removed.** Every route reads/writes
through `tenantDb`/`prisma`. `src/lib/db.js` and `src/lib/repo/tenant.js`
(mysql2) were deleted 2026-09-11 once the full cross-tenant raw-query audit
(every `$queryRawUnsafe` call site, including the 2 IPD ones that needed a
second IPD-active tenant to test — unblocked by the Super Admin dashboard)
came back fully green. Complex joins / `CURDATE()`-dependent /
`FOR UPDATE`-locked queries stayed as `$queryRawUnsafe`/`tx.$queryRawUnsafe`
with an explicit `tenant_id = ?` (the tenant-scoping extension does not
intercept raw queries); everything else uses `tenantDb.<model>.<method>()`.

- **`src/lib/prismaClient.js`** exports `prisma` (raw client — only for
  genuinely cross-tenant work: SUPER_ADMIN platform screens, login's
  pre-session lookup) and `tenantDb` (the one route code should use). `tenantDb`
  is `prisma.$extends(...)` with a query extension that auto-injects
  `tenant_id` into every read/write `where` and every `create`'s `data`, for
  every model in `TENANT_SCOPED_MODELS` — sourced from the same
  AsyncLocalStorage context `src/lib/requestContext.js` already provides (via
  `requireTenantId()`) — "physically cannot forget the tenant filter" by
  construction. Verified: a no-context call throws; tenant 2's
  `findUnique` on tenant 1's row returns `null`, not the row; `create` in a
  tenant-2 context is auto-stamped `tenant_id: 2`.
- **Interactive-transaction timeout, raised and still watch carefully**:
  this DB is remote (Hostinger, not same-host) with observed per-query
  latency of 300ms-3.5s and at least one outlier past 80s. Prisma's default
  transaction timeout (5s) is nowhere near enough — `makeClient()` sets
  `transactionOptions: { maxWait: 10_000, timeout: 30_000 }`. Found and
  fixed the hard way (a real 500 on the prescription-override flow); see
  "Billing module" below for the more serious follow-on finding (a timed-out
  transaction's write is not guaranteed rolled back before the connection
  is reused — mitigated with idempotency keys on money-movement writes, not
  just a bigger timeout number).
- `bill_items` is deliberately excluded from `TENANT_SCOPED_MODELS` (it has
  no `tenant_id` column, only `bill_id` — scoped transitively through
  `bills`); so are `tenants`, `users` (nullable `tenant_id`, needs
  case-by-case handling), and `migrations`.
- **Gotcha, verified the hard way:** the tenant context only survives into
  Prisma's query engine if the `runWithContext(ctx, fn)` callback is an
  `async` function that itself `await`s the Prisma call
  (`async () => { return await tenantDb.x.findMany(); }`) — a bare
  `() => tenantDb.x.findMany()` loses the AsyncLocalStorage context crossing
  Prisma's native query-engine boundary and the call throws "no tenant
  context." `apiRoute()`'s handler wrapper already awaits internally, so any
  route written the normal way (awaiting its DB calls) is safe by
  construction — this is only a trap for code written outside that wrapper.

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

## Super Admin — built

`SUPER_ADMIN` (`tenant_id = NULL`) owns platform control at
`(app)/dashboard/platform/*`, `/api/admin/*`. Every route there uses the
raw `prisma` client, never `tenantDb` — `apiRoute()` runs a SUPER_ADMIN
request with `tenantId: null`, so `tenantDb`'s `requireTenantId()` would
throw; there is no single tenant to scope these routes by, they operate
*across* tenants by design. Gated by a `tenant:read`/`tenant:manage` action
pair that only `SUPER_ADMIN`'s `["*"]` wildcard satisfies — no other role's
permission list names them, so nothing else needs to change in rbac.js.

- **Tenants list** (`GET /api/admin/tenants`) — name/type/active
  modules/staff count/created/status, client-side search.
- **Create Tenant** (`POST /api/admin/tenants`) — provisions the tenant row,
  its `tenant_modules` (a solo type always gets exactly
  `SOLO_TYPE_MODULE[type]`, ignoring any client-supplied list — the "exactly
  one module" invariant is enforced server-side, not just by the form UI),
  and the owner account (`HOSPITAL_ADMIN` or the type's `SOLO_TYPE_OWNER_ROLE`)
  with a random temp password. **The temp password is returned once, in
  that response only** — never logged, never stored anywhere but its bcrypt
  hash; the Super Admin copies it out to share with the owner.
- **Tenant detail** (`GET`/`PATCH /api/admin/tenants/[id]`, `PATCH
  .../modules`) — per-module rent/un-rent toggle, staff list, suspend/
  reactivate (`tenants.active` — blocks every login for that tenant
  immediately; found and fixed a real gap here, see below). Platform-wide
  counts only — **no "view as tenant" browser into a tenant's clinical
  data** (compliance decision, flag separately if needed).
- **Module Registry** (`GET /api/admin/modules`, `src/lib/moduleRegistry.js`)
  — **a static, code-defined, read-only catalog, not a form that creates new
  module types.** `tenant_modules.module_name` is a fixed MySQL ENUM, and a
  genuinely new module needs real routes/RBAC/room wiring regardless of any
  registry row — a "Module Registry" that let you type in a new module name
  would imply capabilities that don't exist. Lists what's rentable today
  (`DOCTOR_OPD`/`PHARMACY`/`LAB`/`IPD`/`BILLING`) vs. planned
  (`RADIOLOGY`/`APPOINTMENTS`, already stubbed `status:"soon"` in
  `navRegistry.js`).
- **Bug found and fixed while building this**: `POST /api/auth/login`
  never checked `tenants.active` — a suspended tenant's user could still log
  in and receive a valid session cookie (only rejected on their *next*
  request, by `apiRoute()`/`guardPage()`). Login now checks it directly and
  returns `403 tenant_suspended` immediately.

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

## Billing module

Two distinct flows: OPD billing (one-time, settled at checkout) and IPD
billing (a running `Bill` that accumulates `bill_items` throughout an
admission via the existing event system, finalized at discharge). Discounts
always require a reason and `authorized_by` — never anonymous. Payments
support multiple modes and partial payment. Package billing is explicitly
out of scope until a later phase.

- **Schema**: `bills` (one per OPD visit or per IPD admission;
  `bill_type` OPD/IPD, `status` OPEN/PARTIALLY_PAID/PAID/REFUNDED,
  `total_amount` always derived, never hand-set), `bill_items` (no
  `tenant_id` — scoped transitively through `bills`, same as the existing
  `bill_items` pattern already documented for the Prisma extension;
  `reference_type`/`reference_id` point back at the source row so the IPD
  event-driven accrual is idempotent), `payments`, `discounts`
  (`authorized_by` required), `refunds` (its own action, never a silent
  negative payment — optionally tied to the `payment_id` it reverses).
  `src/lib/billing.js`'s `recomputeBillStatus(db, billId)` is the one place
  `total_amount`/`status` get written — every route that touches a child row
  calls it afterward (inside the same transaction) instead of computing
  status inline.
- **`bills`/`bill_items` pre-existed** as a bare placeholder scaffold from
  001_init.sql (`hospital_id`, no `visit_id`/`bill_type`, a different status
  enum) — migration 009's `CREATE TABLE IF NOT EXISTS` silently no-op'd on
  both (both were empty, 0 rows — confirmed before correcting, no data was
  at risk). Migration 010 `ALTER`s them into the real shape. Worth
  remembering for the *next* new table too: **check `SHOW TABLES`/`SHOW
  COLUMNS` for a name before assuming `CREATE TABLE IF NOT EXISTS` will
  actually create it** — this project has scaffold tables from early
  migrations that predate a feature's real design.
- **OPD flow** (`POST /api/billing/opd`, action `bill:create`): given a
  `visitId`, aggregates what already happened on that visit into line items
  — one `CONSULTATION` item per consultation (amount = `consultations.fee`,
  known exactly), one `PHARMACY` item per prescription item with
  `dispensed_quantity > 0`, one `LAB` item per lab order. **Pharmacy/lab
  item amounts start at 0** — there is no medicine/test price catalog
  anywhere in this system, so billing staff price them via
  `PATCH /api/billing/[id]/items/[itemId]` before checkout. Calling the
  create endpoint twice for the same visit returns the existing bill rather
  than duplicating it.
- **IPD flow**: a `Bill(IPD, OPEN)` is created automatically when an
  admission is created, and a room-charge `IPD_ROOM` item is added
  automatically at discharge (nights stayed × the admitted bed's
  `daily_rate` — added to `beds` by migration 009, since nothing in the
  schema had a room rate before). Both happen via `src/lib/billingEvents.js`
  subscribing to `admission:created`/`admission:discharged`/
  `dispense:created`/`lab:result` on `realtime.js`'s new in-process
  `serverEvents` bus — **billing never imports IPD/Pharmacy/Lab route code
  directly**, it only reacts to the same events those modules already emit
  for Socket.io clients. `finalized_at` is set at discharge; the event
  listeners skip appending further items to a bill once it's finalized.
  Payment collection still happens as its own step (billing counter),
  independent of the finalize.
- **`serverEvents` (in `src/lib/realtime.js`)**: every `emitToTenant`/
  `emitToModule` call also fires the same event on this in-process
  `EventEmitter`, synchronously, from inside the write's own
  AsyncLocalStorage tenant context. A listener registered here is NOT
  awaited by the emitter (fire-and-forget) but still correctly sees that
  request's tenant context for its own Prisma calls, **as long as the
  listener itself is `async` and directly `await`s the Prisma call** — same
  rule as `prismaClient.js`'s context-propagation note, because that rule
  is about the direct awaiting function, not about who invoked it or
  whether they awaited it. Verified empirically (two concurrent "requests"
  for different tenants, real Prisma calls from inside each one's listener,
  zero cross-tenant bleed) before anything was built on top of this.
- **GSTIN**: `print_branding.gstin` (migration 011), optional, shown on the
  receipt header when set. **The receipt is GST-formatted, not
  GST-tax-computed** — there is no HSN/tax-rate catalog in this system and
  healthcare GST rates are exemption/category-dependent, so no tax amount
  is calculated or charged; the receipt just carries the fields a real GST
  invoice needs (seller GSTIN, itemization, an invoice number derived as
  `INV-<tenantId>-<billId>`, no separate DB column for it).
- **RBAC** (already scaffolded, unchanged by this module):
  `BILLING_STAFF`/`HOSPITAL_ADMIN` get `bill:create`/`bill:read`/
  `bill:update` (the last one covers editing item prices, recording
  payments/discounts/refunds — same action grain as the rest of this
  project, not a separate action per sub-write); `DOCTOR`/`PHARMACIST` get
  `bill:read` only (can see status, cannot edit).
- **Print**: `(app)/print/receipt/[billId]`, same `PrintBranding` system and
  route-tree pattern as prescription/lab-report print (authenticated,
  tenant-scoped, no dashboard chrome).

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
