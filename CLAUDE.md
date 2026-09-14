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
   Cannot read properties of null (reading 'useContext')`) — **root cause
   found and fixed.** Real root cause (see below, found after several
   dead-end attempts — history kept so the same ones aren't retried):
   **Hostinger's build does a production-only install that skips
   `devDependencies` entirely** (confirmed locally: `npm install
   --omit=dev` here installs 137 packages vs 447 for a full install), and
   `@tailwindcss/postcss` + `tailwindcss` — required by `postcss.config.mjs`,
   which every `next build` runs — were sitting in `devDependencies`.
   **Fix**: moved `@tailwindcss/postcss`, `tailwindcss`, and
   `babel-plugin-react-compiler` into real `dependencies` — anything
   `next build` itself needs, not just local dev tooling, must live there
   on this platform. `eslint`/`eslint-config-next`/`mysqldump` correctly
   stay in `devDependencies` (never touched by `next build`).
   **Verified properly this time**: reproduced the actual failure mode
   locally for the first time in this whole saga (`rm -rf node_modules
   .next && npm install --omit=dev && npm run build`), confirmed it fails
   the same way without the fix and passes with it, then smoke-tested the
   resulting production server (`NODE_ENV=production node server.js`) —
   HTTP 200 on `/` and `/login`.
   **Working theory, not proven**: Turbopack likely handled the missing
   `@tailwindcss/postcss` more silently (partial/corrupted CSS handling
   that only surfaced later, specifically while rendering the internal
   `/_global-error` fallback path) where webpack fails loudly and
   immediately with a clear "missing module" error — which is *how this
   got found*: switching to webpack (see below) didn't fix the original
   symptom, it surfaced a clearer one. Since webpack is now confirmed
   working end-to-end, it stayed; nothing has re-confirmed whether
   Turbopack alone (with the dependency fix, no bundler change) would
   also have worked. Prior attempts, before this was found, for the
   record:
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
   - **Untried levers, if a `devDependencies`-shaped bug like this one
     ever resurfaces**: check `npm install --omit=dev` locally FIRST,
     before guessing at bundler/version/config changes — this is what
     should have been checked from the very first failure, and would have
     found the real cause in one step instead of five. Also on file if
     needed later: Next's `--debug-prerender` build flag, a newer
     16.3.x/16.4.x stable release, or pinning back to Next 15.5.6 (bigger
     change, `AGENTS.md` flags Next-16-specific conventions in use here).

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
visual flair. **Colors only** now match the marketing site's palette
(explicit owner directive, 2026-09-13 — supersedes the earlier "must never
appear in the product" rule for colors specifically); the *layout
language* stays deliberately different — no serif headline fonts, no
thin-border editorial rows, still real bordered cards/tables for data-entry
speed. Don't reintroduce the marketing site's editorial layout into the
product; that was explicitly scoped out when this was decided.

- **Palette + dark/light mode** (`(app)/app.css`): off-white bg (`#FAFAF7`)
  / near-black ink (`#080808`) in light, `#121212` bg / `#F5F5F2` ink in
  dark — identical hex values to `(company)/kaizen.css`. The mechanism:
  Tailwind v4 compiles `bg-slate-900`, `border-slate-200`, `bg-white`, etc.
  to `background-color: var(--color-slate-900)` (real, live CSS custom
  properties — verified against the compiled build output, not assumed),
  so redefining `--color-slate-*`/`--color-white` inside a `.hms-shell`
  wrapper class (applied once, in `(app)/layout.js`) retinted every
  already-built screen's already-written Tailwind classes for free — no
  component file needed a class-by-class rewrite for this. Dark mode
  follows the exact two-path pattern `kaizen.css` already used: an
  explicit `data-theme` attribute (set by `ThemeToggle.jsx` in the topbar,
  persisted to `localStorage` as `hms-theme`) always wins; with no choice
  made yet, `@media (prefers-color-scheme: dark)` decides. Both are scoped
  under `.hms-shell`, never `:root` — the marketing site's own theme
  system (`.kbms-site`) is completely untouched by any of this.
- **One deliberate exception, carried over from the marketing site's own
  precedent**: primary buttons and active-tab pills
  (`bg-[var(--hms-btn-bg)]` + `text-[var(--hms-btn-fg)]`, ~37 call sites
  converted from literal `bg-slate-900`) use **stable, non-flipping**
  near-black/white tokens, not the retinted (and therefore theme-flipping)
  `slate-900`/`white`. Reasoning: `slate-900` has to flip to a LIGHT color
  in dark mode so plain `text-slate-900` headings/labels stay readable —
  but a button styled `bg-slate-900 text-white` would then go
  light-bg-white-text and become unreadable. This mirrors the marketing
  site's own "deliberately-permanent near-black blocks" (the final CTA,
  the tech-flow panel, the footer) — same reasoning, same fix shape,
  applied to the product's buttons instead.
- **Bug found and fixed 2026-09-13**: the button-background fix above only
  covered half the conflict. `text-white` resolves to `--color-white`,
  which dark mode redefines to a DARK surface tone (`#191917`, so `bg-white`
  cards correctly become dark cards) — but that also makes `text-white`
  render as near-black, invisible against a permanently-dark button
  background (`--hms-btn-bg`) or badge (`--hms-accent`, `--hms-danger`).
  Reported by the owner as the Sign In button's label and the Print
  button's label both being unreadable in dark mode. Root cause was
  systemic, not a login-page-specific bug — every one of the ~37
  `text-white` call sites across the whole product had the same defect.
  Fixed the same way as the button-background conflict: added
  `--hms-btn-fg: #FFFFFF` (never flips) and swapped every `text-white`
  call site to `text-[var(--hms-btn-fg)]`. **Lesson for any future retint
  work**: a shared Tailwind color variable (`--color-white`, `--color-
  slate-900`, …) can only be redefined for ONE semantic use (surface OR
  text/foreground) at a time — the moment a component needs the variable's
  meaning to differ by which utility references it (`bg-*` vs `text-*`),
  it needs its own stable, non-flipping token instead, checked for both
  directions (bg conflicts AND text conflicts) before calling a retint
  done.
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
than one column per vital sign. The Bed Board (`BedBoardClient.jsx`) was
rebuilt 2026-09-13 after owner feedback that the original was confusing: it
now leads with a ward occupancy summary and an explicit status-color legend,
has a real "+ Add / manage beds" form (the API always supported adding a
bed and setting its `daily_rate`; there was previously no UI for either),
and moved admit/discharge into proper modals instead of inline widgets.

- **Ward/bed transfer** (`POST /api/ipd/admissions/[id]/transfer`, action
  `admission:update` — same clinical-decision weight, and the same
  permission, as discharge; NOT `bed:manage`'s day-to-day housekeeping
  grain): moves an active admission to a different vacant bed. The old bed
  goes CLEANING, the new bed goes OCCUPIED, `admissions.bed_id` is updated
  to the new bed (so "current bed" stays a plain lookup), and `bed_transfers`
  (migration 015) keeps the append-only audit trail (`from_bed_id`,
  `to_bed_id`, `reason`, `transferred_by`, `transferred_at`) — never edited,
  mirroring how `pharmacy_stock_movements` and `bed_transfers` are both
  "the log IS the audit trail," not a side effect of one. Rejects onto an
  already-discharged admission, the same bed, or a non-vacant target bed.
- **Bed maintenance**: `beds.status = MAINTENANCE` already existed
  (004_ipd.sql) but carried no reason — migration 015 added
  `maintenance_reason` (required by the API whenever a bed is set to
  MAINTENANCE) and an optional `maintenance_until` date. Both are cleared
  automatically the moment status moves off MAINTENANCE. Gated on
  `bed:manage`, same as "mark ready" — day-to-day ward housekeeping, not a
  clinical decision.
- **Occupancy reporting** (`GET /api/ipd/reports/occupancy`, action
  `bed:read`): per-ward bed-status counts, occupancy % (`occupied/total`),
  and average length of stay for discharged admissions. LOS is grouped by
  each admission's CURRENT bed (i.e. after any transfer) — a deliberate
  simplification; a mid-stay transfer attributes the whole stay to the ward
  the patient ended up in, not split proportionally across both. Feeds a
  toggleable panel on the Bed Board screen itself for now, ahead of a
  planned dedicated Reports & Analytics dashboard.
- **Deliberately not built** (explicit scope cut, matching the owner's own
  instruction): no housekeeping-staff-assignment workflow — the existing
  "mark ready" action on a CLEANING bed is enough; a full task-assignment
  system for that wasn't asked for and would be scope creep.

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

## Attendance — built

Staff self check-in/check-out, receptionist-proxy attendance (with a photo)
for employees who have no system login, and an intra-shift "stepped out"
break with a reason. Core feature — not module-gated (no `tenant_modules`
entry), `tenantTypes: ["HOSPITAL"]` only (a solo tenant has no staff
hierarchy to track). Migration 014.

- **Two kinds of people can have attendance**: a `users` row (self-service)
  or a `staff_members` row — a lightweight, tenant-owned directory (same
  "the system builds itself" philosophy as `referral_sources`: nothing
  pre-filled, a hospital adds its own sweepers/ward-staff/etc.,
  `staffmember:manage` to add/edit/deactivate, never hard-deleted).
- **`attendance_logs`** models "which person" as `(subject_type, subject_id)`
  — `USER` or `STAFF_MEMBER` — rather than two nullable FK columns: a real FK
  can't point at "users OR staff_members" conditionally, and two nullable FK
  columns can't be uniquely constrained together in MySQL (NULL is never
  equal to NULL in a unique index, so duplicate check-ins would slip
  through). One row per `(tenant_id, subject_type, subject_id, work_date)`,
  enforced by a genuine DB unique key. "Today" is decided by the DB server's
  `CURDATE()` (`src/lib/attendance.js`'s `serverToday()`), same convention as
  the OPD queue token's daily reset — never the JS process's clock.
- **`attendance_breaks`**: an intra-shift "stepped out" period
  (`out_at`/`in_at`, `in_at IS NULL` means still out), with a required
  `reason` and a `category` — `PERSONAL` or `HOSPITAL_WORK`. Worked minutes
  are always derived at read time (`computeWorkedMinutes`), never stored:
  elapsed check-in→check-out minus `PERSONAL` break time; `HOSPITAL_WORK`
  breaks are NOT deducted (the person is still on hospital business, just
  physically elsewhere). Checking out is blocked while a break is still
  open (`close_break_first`) — you can't clock out from an outing you never
  clocked back in from.
- **No file/blob storage exists in this project** — a proxy check-in/
  check-out's photo is required (it's the only identity check available for
  someone with no login of their own) and is captured client-side via
  `<input type="file" capture="environment">`, resized to ~480px and
  compressed to a JPEG data URL in-browser (`AttendanceClient.jsx`'s
  `compressPhoto()`), then stored directly in a `MEDIUMTEXT` column —
  deliberately not a reason to stand up upload/S3 infrastructure for this
  one feature.
- **RBAC**: `attendance:self` (check in/out, start/end own break) — every
  staff role (`RECEPTIONIST`/`DOCTOR`/`NURSE`/`PHARMACIST`/`LAB_TECH`/
  `BILLING_STAFF`) plus `HOSPITAL_ADMIN`'s wildcard; deliberately NOT given
  to `OWNER_*` (solo tenants aren't hospitals with staff to track — the
  `tenantTypes` nav/page gate already excludes them, this is belt-and-
  braces). `attendance:proxy` (mark a no-login staff member, photo
  required) and `staffmember:read` (see the roster to mark against) —
  `RECEPTIONIST` + `HOSPITAL_ADMIN`. `staffmember:manage` (add/edit/
  deactivate the roster) — `HOSPITAL_ADMIN` only.
- **Verified 2026-09-13** against the real demo tenant (`Demo Hospital`,
  id 1) via curl, not just code review: self check-in → double check-in
  rejected (409 `already_checked_in`) → break start → check-out blocked
  while on a break (409 `close_break_first`) → double break-start rejected
  (409 `already_out`) → break end → check-out succeeds. Proxy flow: check-in
  without a photo rejected (400, zod) → check-in with a photo succeeds →
  double check-in rejected (409) → `HOSPITAL_WORK` break → proxy check-out
  blocked while on that break (409) → break end → check-out succeeds.
  Cross-tenant/nonexistent `staffMemberId` → 404, not a leak. RBAC: no
  cookie → 401; receptionist attempting `staffmember:manage` (create a
  staff member) → 403; receptionist's own `staffmember:read` → 200.
- **Deliberately not built in this pass** (flagged separately, tracked as
  future work): a historical/reporting view (attendance % over a date
  range, leave tracking) — that's the "Reports" half of the planned Staff
  Management module and would duplicate scope; today's screen only shows
  the current day.

## Appointment Scheduling — base system built (Patient Portal below is done too)

New rentable module `APPOINTMENTS` (migration 016). Built from an owner-
supplied external spec modeled on Apollo/KIMS's real apps — field names
were translated to this project's own convention (BigInt-unsigned ids,
snake_case columns) rather than the spec's Int/camelCase sketch, per the
Prisma section's rule that schema is introspected, never hand-authored to
match an external draft verbatim. **All 6 steps of the build order are
done** — base scheduling, Patient Portal read-only access, and the
patient-facing privacy-restricted calendar + booking + cancellation +
feedback submission (see "Patient Portal" below for the last three).

- **`doctor_slots`**: a doctor's recurring WEEKLY availability template
  (`day_of_week` 0=Sunday..6=Saturday, `start_time`/`end_time`, `slot_minutes`
  default 15) — not actual booked instances. A doctor manages only their
  own (`doctorslot:manage`, self-scoped, same "manage_own" shape as
  branding) via a "Manage my availability" panel on the calendar screen.
- **`appointments`**: real booked instances. **Double-booking prevention is
  NOT a manual `FOR UPDATE` lock** like Pharmacy's FEFO dispense — that
  pattern locks an EXISTING row to serialize depletion; here, before the
  first booking, there is no row yet to lock, so a plain
  check-then-insert always has a phantom-read race window no amount of
  application-level locking closes. The correct mechanism for "prevent two
  people booking the same brand-new slot" is a real unique constraint that
  makes the second concurrent INSERT fail atomically at the storage engine
  — `uq_appointments_doctor_active_slot` on `(tenant_id, doctor_user_id,
  active_slot_time)`, where `active_slot_time` is a **generated column**
  (`CASE WHEN status = 'CANCELLED' THEN NULL ELSE slot_time END`). MySQL/
  MariaDB unique indexes never treat two NULLs as duplicates, so: a clean
  CANCELLED frees the slot for a real rebooking (`active_slot_time` goes
  NULL), while BOOKED/CONFIRMED/COMPLETED/NO_SHOW all continue to occupy
  it — matching the product rule that a no-show is recorded but does NOT
  reopen the slot. The API (`POST /api/appointments`) attempts the insert
  inside a transaction and translates a Prisma `P2002` violation to a clean
  409 `slot_taken`.
- **Verified under genuine concurrency, 2026-09-13**: 10 truly simultaneous
  `POST /api/appointments` requests at the exact same doctor+slot_time —
  exactly 1 returned 201, the other 9 returned 409 `slot_taken`, and the
  database confirmed exactly one row exists for that slot (not code review
  — a real race fired via 10 backgrounded curl processes). Also verified:
  cancelling reopens a slot for a genuine rebooking; a no-show'd slot
  rejects a rebooking attempt (`slot_taken`); an already-finalized
  appointment rejects a further status change (409 `already_finalized`);
  a slot_time not aligned to the doctor's actual template (wrong minute
  offset) is rejected server-side (400) even though the UI would never
  generate one — never trust a bare client-supplied datetime.
- **No timezone conversion anywhere** (`src/lib/appointments.js`) — every
  `slot_time`/booking moment uses plain local `Date` arithmetic, the exact
  same "naive wall clock, whatever timezone the app/DB server share"
  convention already used for every other timestamp in this project
  (`visits.created_at`, `admissions.admitted_at`, etc. — none of them do
  timezone conversion either). Introducing UTC-strict handling only for
  Appointments would be a one-off inconsistency, not a real improvement,
  for a single-country deployment. `doctor_slots.start_time`/`end_time`
  (`TIME` columns, no date) are the one place UTC IS used, but only as an
  arbitrary, self-consistent anchor (Prisma round-trips `TIME` through
  1970-01-01 UTC) — unrelated to any real timezone.
- **Staff calendar UI** (`(app)/dashboard/appointments`): Month/Week/Day
  toggle, Today/prev/next navigation, a status-color legend, click an empty
  cell to book (patient search-or-create + reason, reusing the same
  find-or-create pattern as the IPD admit modal), click a booked cell for
  details + status actions (Confirm/Complete/No-show/Cancel). Rendered as a
  genuine time-grid table (rows = each distinct slot start-time, columns =
  days in Week view or doctors in Day view) rather than pixel-positioned
  floating blocks — matches this product's stated "plain, fast, functional,
  not visual flair" philosophy, and is far more robust to get right without
  a live browser to pixel-check. **Multi-doctor side-by-side is a Day-view
  feature** (matching Google Calendar's own convention for comparing several
  calendars at once); Week/Month view always show one doctor at a time.
  Drag-to-reschedule is explicitly out of scope for this pass (per the
  original spec) — reschedule is cancel-then-rebook using the existing
  primitives, not a dedicated endpoint.
- **One naming deviation from the pasted spec, deliberate**: events are
  `appointment:booked`/`appointment:cancelled` (colon), not
  `appointment.booked`/`.cancelled` (dot) as the spec literally said.
  CLAUDE.md's event-taxonomy section already flags `visit.called` as "the
  first" dot-style event and explicitly warns against inventing further
  one-off conventions in the meantime — so the colon form was used to stay
  consistent with the dominant, already-documented taxonomy instead.
- **RBAC**: `appointment:create`/`appointment:read`/`appointment:update` —
  `RECEPTIONIST` and `DOCTOR` (+ `HOSPITAL_ADMIN` wildcard).
  `doctorslot:manage` — `DOCTOR` only, self-scoped (a 403 if a doctor tries
  to edit another doctor's template via a guessed id). `feedback:read` is
  wired into module gating but has no route yet (Patient Portal work).
- **Also discovered while building this**: the live database is actually
  **MariaDB 11.8**, not MySQL as CLAUDE.md has called it throughout (still
  wire-compatible enough that nothing else needed to change) — confirmed
  via `SELECT VERSION()` while checking generated-column/CHECK-constraint
  support before writing migration 016. Both features work correctly on
  it (verified: the migration applied cleanly, the generated column
  computes correctly under real concurrency).

## Patient Portal — fully built (auth, read screens, booking, feedback)

Patients authenticate separately from staff — phone+OTP, not the staff
role/password system (`patients.otp_code_hash`/`otp_expires_at`/
`otp_requested_at`/`otp_attempts`, migration 016). **Per-tenant login**, an
explicit owner decision over a unified cross-tenant identity spanning every
Kaizen hospital a phone number has visited (asked via AskUserQuestion given
the spec's wording leaned the other way) — the latter would have needed a
new non-tenant-scoped identity layer and created a real cross-tenant
data-leak vector (two unrelated patients at two different hospitals sharing
one phone number), conflicting with this project's core tenant-isolation
guarantee. **All 6 build-order steps are done**: OTP auth, the separate
session type, every read-only screen, the privacy-restricted patient
calendar, self-service booking/cancellation, and feedback submission.

- **A genuinely separate session, verified two-way**: `src/lib/patientAuth.js`
  signs a JWT shaped `{ typ: "patient", tid, phone }` — no `uid`/`role`, so
  staff's `verifySession()` rejects it outright (it requires both); the
  reverse holds too (`verifyPatientSession` requires `typ === "patient"`).
  Different cookie name (`kaizen_patient_session` vs `kaizen_session`),
  30-day TTL vs staff's 8-hour shift session (a consumer portal shouldn't
  force a fresh OTP every 8 hours). `proxy.js` gained a dedicated branch for
  `/patient/:path*` and `/api/patient/*` — verifies the patient cookie, not
  the staff one, and never runs staff RBAC. **Verified live, not just by
  code review**: a patient session hitting a staff API → 401; hitting the
  staff dashboard page → redirected to `/login`; a staff session hitting a
  patient API → 401; hitting the patient dashboard page → redirected away.
- **Scoped to (tenantId, phone), not one patientId** — `patients.phone` was
  never unique (family members sharing a household number, duplicate
  front-desk registrations are both normal), so a session covers every
  `patients` row at that tenant matching the phone. `GET /api/patient/
  profiles` lists them; the dashboard shows a picker when there's more than
  one. Every other patient route accepts an optional `?patientId=`,
  re-verified against the session's own phone before use
  (`src/lib/patientPortal.js`'s `resolvePatientIdFilter` — a 403
  `not_your_profile` if it doesn't belong to this session, never trusted
  bare) — **verified live**: a session tried another real patient's id and
  got 403; its own id succeeded.
- **OTP mechanics**: 6-digit code, bcrypt-hashed, 5-minute expiry, 30-second
  resend cooldown, 5 verify attempts before requiring a fresh code, single-
  use (cleared on success). No SMS provider is chosen yet, so delivery is
  by **email** (Gmail SMTP via nodemailer, `src/lib/mailer.js`), added
  2026-09-14 — replaces the earlier `console.log` stub. Request-OTP
  returns the **byte-for-byte identical response** for all three possible
  states — unregistered phone, registered with no email on any matching
  patient, and registered with an email — **no exceptions**, same
  no-enumeration principle as staff login.
- **A "no email on file" distinct response was tried first and reverted
  the same day** — worth remembering as a concrete example of how an
  enumeration leak can look like reasonable UX in isolation: the first
  version returned a distinct 422 `no_email_on_file` so a real patient
  without an email wouldn't be left confused. That message itself was the
  bug — anyone could learn "this phone has an account" just by seeing
  which response came back, defeating the whole point of the generic
  response. **Fixed**: a registered phone with no email on any matching
  patient now falls through to the exact same generic response as an
  unregistered one — verified with a real curl comparison, identical
  status (200), identical body bytes, identical `Content-Type`. The UX
  need is solved a different way instead: a static, always-visible help
  line under the phone field on the login screen itself ("Don't have an
  account, or haven't added your email yet? Visit the front desk.") —
  shown unconditionally, never a function of what any lookup found, so it
  cannot itself become a signal.
- **`patients.email` (migration 020) is optional, not required** —
  `patients` had NO email column at all until this; adding it as required
  would have broken every walk-in front-desk registration flow overnight
  for a field that didn't previously exist. A patient with no email on
  file simply can't use OTP login yet — handled via the static help line
  above, never a distinguishable API response. Front desk adds an email
  to an existing patient via `PATCH /api/registration/patients/[id]`
  (`email` field, alongside the existing allergies/ABHA/referral-source
  edits) — no re-registration needed. New registrations capture it as an
  optional core field (`forms.js` `PATIENT_REGISTRATION`, order 4,
  `required: false`).
- **A genuine send failure is still its own distinct error**:
  `email_send_failed` (502) — this is NOT an enumeration leak the way
  `no_email_on_file` was, because it only ever fires for a phone that
  ALREADY has a known email (an attacker enumerating random phone numbers
  essentially never reaches this path; it's an infrastructure-failure
  signal, not a registration-status signal), so hiding it behind the
  generic response would only cost a real patient a clear explanation for
  no benefit. **The OTP is only persisted (hash/expiry/cooldown) AFTER
  `sendOtpEmail()` succeeds** — a failed send never starts the 30-second
  resend cooldown for a code the patient never received. Credentials
  (`EMAIL_USER`/`EMAIL_APP_PASSWORD`, `.env`, a real Gmail **App
  Password** — Gmail rejects plain-password SMTP auth entirely, requires
  2-Step Verification on that account first) are never hardcoded and
  never logged — a send failure logs only the error message, never
  anything that touched the credential values.
- **Verified live before real credentials existed**: registered a patient
  with no email and compared its request-otp response against a genuinely
  unregistered phone — identical status, identical body, identical
  relevant headers; registered one with an email → attempted a real send,
  got a clean 502 `email_send_failed` (credentials genuinely weren't
  configured yet) with the exact "not configured" reason logged, confirmed
  nothing was persisted (an immediate retry failed the identical way, not
  `too_soon`), and confirmed adding an email to an EXISTING historical
  patient via the PATCH route immediately made their phone number attempt
  a real send too. **The real-send-arrives-in-a-real-inbox verification is
  still pending** — deliberately deferred until the owner adds real Gmail
  App Password credentials to `.env` themselves (not shared in chat); do
  that verification then, not before.
- **Read screens are module-aware per the product rule** ("a patient
  shouldn't see a Lab Reports section for a tenant that never had Lab
  active"): each route checks `isModuleActive` for its own module
  (APPOINTMENTS/DOCTOR_OPD/LAB/IPD/BILLING) and returns `{moduleActive:
  false}` rather than an error, so the dashboard can just hide that tab.
  Bills show status + balance only, always `payAtHospital: true` when a
  balance is outstanding — no online payment (needs a real payment gateway,
  a business decision, not wired up silently here). "Active medications" is
  honestly just the most recent prescription's items — there's no
  structured expiry/duration anywhere in this schema (dosage is freeform
  text like "1-0-1 x 5 days") to compute a real still-taking-it distinction
  from.
- **Verified against real historical data, not fixtures**: logged in as an
  actual previously-admitted/discharged/billed test patient and confirmed
  their discharge summary and receipt balance matched exactly what earlier
  IPD/Billing testing had produced for them.
- **URL canonicalization, not a security boundary**: `/patient/
  <tenantSlug>/dashboard` re-derives the tenant from the verified session,
  never the URL segment, and redirects to the session's real tenant's slug
  if they don't match — every actual query is already scoped by session,
  so a mismatched slug was only ever a confusing display bug, never a data
  leak, but it's still handled correctly rather than left showing the wrong
  hospital's name.
- **Patient calendar enforces privacy server-side, not just in the UI**
  (`GET /api/patient/calendar`): the handler never even SELECTs a patient/
  appointment column for the booked-slot check — it queries only
  `slot_time` for non-cancelled appointments in range and returns
  `{ slotTime, available }`, nothing else, for every slot including the
  viewer's OWN booking (their own appointments are the separate, already-
  built read screen, not this grid). **Verified live with two real,
  different patients**: patient A booked a slot; patient B's calendar
  response for that exact slot was `{"slotTime":"...","available":false}`
  — no id, name, reason, or status of any kind — while the staff calendar
  for the same slot correctly showed the full detail. There is no code
  path in this handler capable of leaking more than that boolean, by
  construction, not by discipline.
- **Booking and feedback require an explicit `patientId`, matching the read
  screens' pattern exactly** — a session can cover several family profiles
  sharing one phone, so both `POST /api/patient/appointments/book` and
  `POST /api/patient/feedback` take a required `patientId`, re-verified via
  `ownsPatient()` before use (403 `not_your_profile` otherwise) — never
  defaulted to "the session's patient" the way a 1:1 mapping would allow.
  Booking has no "new patient" option unlike the staff booking route — a
  self-service booking can only target a profile that already exists under
  this session's own phone (see `/api/patient/profiles`), never an
  arbitrary name. Cancelling is different: it targets one specific,
  already-patient-owned appointment by id, so there's no "which patient"
  ambiguity to resolve — the check there is ownership (the appointment's
  `patient_id` must be one of this session's own), not selection.
- **Double-booking prevention is shared, not duplicated**: the booking
  logic (transaction + unique-constraint P2002→409 translation) was
  factored out of the staff route into `bookAppointment()` in
  `src/lib/appointments.js`, used by both the staff and patient booking
  routes — one place this mechanism can possibly drift, not two copies
  that could disagree. It returns a result object rather than throwing,
  since staff (`apiRoute.js`) and patient (`patientApiRoute.js`) routes
  each define their own separate `HttpError` class.
- **Two real bugs found and fixed while building this, both by testing
  against the live server rather than trusting the code**:
  1. `validate.js`'s `parseBody()` always throws the STAFF module's
     `HttpError` class regardless of which route calls it. Every patient
     route's `catch (err) { if (err instanceof HttpError) ... }` used
     PATIENT's own separate `HttpError` class, so a validation failure on
     any patient route (missing/invalid body field) fell through to a raw
     500 instead of the intended 400 — caught by literally testing an
     invalid booking request and seeing `500 internal_error` instead of
     `400`. Fixed by changing both `apiRoute.js` and `patientApiRoute.js`'s
     catch blocks from `instanceof HttpError` to duck-typing
     (`typeof err.status === "number"`) — the real shared contract every
     clean thrown error in this codebase follows, regardless of which
     module's `HttpError` class constructed it.
  2. `book/page.js` called `runWithContext(ctx, () => tenantDb.patients.
     findMany(...))` — a bare non-async callback, exactly the documented
     AsyncLocalStorage gotcha in this file's Prisma section ("a bare
     `() => tenantDb.x.findMany()` loses the tenant context"). Caught by
     loading the actual page and getting a 500 ("No tenant context").
     Fixed to `async () => { return await tenantDb.patients.findMany(...); }`.
     While fixing it, also hardened `dashboard/page.js`'s analogous call —
     it happened to work (`async () => Promise.all([...])`, verified
     empirically before this fix), but it wasn't the textbook-safe form
     either (returning a promise chain without awaiting inside the async
     function), so it was rewritten to explicitly await each call in turn
     rather than rely on timing that happened to work in testing.
- Files: `src/lib/patientAuth.js`, `patientAuthConstants.js`,
  `patientSession.js`, `patientApiRoute.js`, `patientPortal.js`,
  `appointments.js` (shared `bookAppointment`); `src/app/api/patient-auth/*`,
  `src/app/api/patient/*` (profiles, doctors, calendar, appointments/book,
  appointments/[id]/cancel, prescriptions, medications, lab-reports,
  discharge-summaries, bills, visits, feedback); `src/app/api/feedback`
  (staff-side view, `feedback:read`); UI at
  `src/app/(patient)/patient/[tenantSlug]/{login,dashboard,book}` — its own
  route group, plain Tailwind (no `.hms-shell` retint, no dark mode) since
  this is a lightweight mobile-first consumer surface, not the staff
  product.

## Appointment enhancements — built

Two additions on top of the base Appointment Scheduling + Patient Portal
system (migration 017), both depending on it being fully built first.

- **Receptionist manual token override**: the walk-in OPD queue's
  auto-assigned sequential daily token (`SELECT COUNT(*)+1 ... WHERE
  DATE(created_at) = CURDATE()`) can be explicitly overridden — a
  priority/emergency walk-in, or correcting a numbering mistake.
  `src/lib/tokenOverride.js`'s `resolveTokenNumber()` is the one place both
  visit-creation routes (`registration/patients`, `registration/visits`)
  get a token number from — with no `manualToken` supplied, unchanged
  auto-increment behavior; with one supplied, it requires
  `visit:override_token` (`RECEPTIONIST` + `HOSPITAL_ADMIN` wildcard) and a
  non-empty `reason`, and logs to `token_overrides` (`reason` +
  `overridden_by` — same accountable, never-silent audit shape as Billing's
  discounts).
- **The override's uniqueness is a real DB constraint, not just an
  app-level check** (migration 018, added after review — the first version
  of this shipped with only the pre-check, reasoning it could match the
  pre-existing unlocked auto-increment path's rigor; that reasoning didn't
  hold once pointed out: an override is specifically for priority/emergency
  situations, which is exactly when two receptionists on different
  terminals are most likely to race for the same "obviously correct"
  number, and a silent duplicate at that exact moment is the worst possible
  time for it to happen). `visits` gained a generated `visit_date DATE
  GENERATED ALWAYS AS (DATE(created_at)) STORED` column (`created_at` is a
  DATETIME, so "same day" can't be expressed directly in a UNIQUE key
  without materializing it first — same technique as `appointments.
  active_slot_time`) plus `uq_visits_tenant_date_token (tenant_id,
  visit_date, token_number)`. `NULL` `token_number` (DIRECT_ADMISSION/
  EMERGENCY visits never get a walk-in token) never collides with itself,
  by the same NULL-≠-NULL unique-index behavior used elsewhere — only
  visits that actually have a token are constrained. The app-level
  pre-check stays as the fast path (a clean message without round-tripping
  through a failed INSERT); `createVisitWithToken()` is what turns an
  actual constraint violation on the INSERT into the same 409 — the real
  guarantee under a genuine race, not the pre-check alone.
- **A second real bug found while verifying the fix above**: the first
  concurrency test (10 simultaneous override attempts at one token number)
  passed correctly — exactly 1 success, 9 clean 409s — but checking the
  database after showed **9 orphaned `patients` rows with no visit**.
  `registration/patients` created the patient and the visit as two
  separate, non-transactional writes; once the new DB constraint made
  visit-creation failure a realistic outcome (previously near-impossible
  against the unprotected auto-increment path), a lost race left a
  brand-new patient record behind with nothing attached to it. Fixed by
  wrapping patient creation + token resolution + visit creation in one
  `tenantDb.$transaction()` when `openVisit` is true — re-ran the same
  10-way race afterward and confirmed exactly 1 patient row and 1 visit
  row exist, not 10 patients and 1 visit.
- **Verified live**: a role without `visit:override_token` → 403; an
  override without a reason → 400; a successful override with its audit
  row correctly recorded; **10 truly simultaneous override requests at the
  same token number — exactly 1 succeeded, 9 got a clean 409, and the
  database confirmed exactly one matching row exists** (same style of test
  as Pharmacy's FEFO concurrency test and Appointment double-booking's,
  fired via backgrounded curl processes, not assumed from the code).
- **Doctor-initiated follow-up scheduling**: a "Schedule follow-up" button
  on the consultation screen (visible only once a consultation is recorded,
  and only to the `DOCTOR` role — `ConsultationClient.jsx` receives
  `doctorUserId` from the page only when `session.role === "DOCTOR"`) opens
  `src/components/hms/DoctorSlotPicker.jsx` — a compact single-doctor Week
  time-grid. **Not a second booking mechanism**: it calls the exact same
  `GET /api/appointments/calendar` and `POST /api/appointments` the full
  staff Appointments screen uses, so the same `bookAppointment()`
  double-booking-prevention logic applies unchanged, and the resulting
  `Appointment` row (`booked_by: "staff"`) is immediately visible in both
  the staff calendar and the patient's own portal — **verified live**: a
  doctor booked a follow-up for a real patient via this exact endpoint
  sequence, and it appeared correctly in both
  `GET /api/appointments/calendar` (staff) and `GET /api/patient/
  appointments` (that same patient's own portal session).

## Staff Management — built

`(app)/dashboard/staff`, migration 019. Staff directory, duty roster,
leave requests, and staff-focused reports for staff WITH a login
(`users`) — distinct from `staff_members` (migration 014), the no-login
employee directory used only for Attendance proxy check-in. Core feature,
not module-gated, `tenantTypes: ["HOSPITAL"]` only (a solo tenant has no
staff hierarchy). One coherent tabbed page — Directory / Duty Roster /
Leave Requests / **Attendance** (the exact same already-built
`AttendanceClient` component, imported and reused, not rebuilt) / Reports
— per the explicit instruction that this shouldn't be two disconnected
screens.

- **`staff_profiles`**: supplementary join-date/phone/designation data for
  a `users` row, one-to-one (`@unique` on `user_id`). Most staff won't have
  one until an admin fills it in — the directory GET left-joins it, never
  requires it to exist.
- **`duty_shifts`**: a concrete shift assignment for one user on one date
  (not a recurring template like `doctor_slots`) — `staff:manage`
  (`HOSPITAL_ADMIN`) assigns/removes them; every staff role can just view
  the roster (`staffroster:read`) for shift-coordination awareness.
- **`leave_requests`**: `status` PENDING/APPROVED/REJECTED, `approved_by`
  + `decided_at` set together on decision. **The reason field is a real
  privacy boundary, enforced in the API response itself, not the UI**:
  `GET /api/staff/leave-requests` strips `reason` to `null` for every row
  that isn't the caller's own and isn't visible to someone with
  `staff:manage` — dates and status stay visible to everyone (so a
  colleague can see who's out and when, for scheduling), but the reason
  text never leaves the server for anyone else. **Verified live**: a
  receptionist viewing a doctor's leave request saw `"reason":null`; the
  doctor themself and the admin both saw the real text; approving an
  already-decided request → 409 `already_decided`.
- **`staffroster:read` + `leaverequest:create`** are granted to every staff
  role (not `OWNER_*` — a solo tenant has no staff hierarchy) — this is
  self-service: see the roster, see who's on leave when, submit your own
  leave request. `staff:manage` (assign shifts, approve/reject leave, edit
  the directory, view reports) is `HOSPITAL_ADMIN` only. **The same RBAC-
  inheritance quirk already present for `attendance:self`** applies here
  too: because `STAFF_SELF_SERVICE` is spread into the `DOCTOR`/
  `PHARMACIST`/`LAB_TECH` arrays, `OWNER_DOCTOR`/`OWNER_PHARMACIST`/
  `OWNER_LAB_TECH` technically inherit these two actions — belt-and-braces
  closed the same way Attendance's page already does: `page.js` explicitly
  redirects unless `tenant.type === "HOSPITAL"`, so a solo owner can never
  actually reach the page regardless of what the raw permission check
  would allow.
- **Reports** (staff-focused, distinct from a future hospital-wide Reports
  & Analytics dashboard): attendance % per staff over a date range
  (`attendance_logs`, reused from the Attendance system, never duplicated),
  and a roster coverage view flagging shifts with zero doctors scheduled
  (`GROUP BY shift_date, start_time, end_time HAVING SUM(role='DOCTOR')=0`
  — verified live: assigning only a nurse to a fresh shift slot correctly
  flagged it). **"Leave taken" is reported, "vs. remaining" deliberately is
  not** — there is no leave-quota/entitlement concept anywhere in this
  schema or spec, so a "remaining" number would have to be invented from
  nothing; the report says so explicitly in the UI rather than fabricating
  a policy that was never decided, same honesty precedent as Patient
  Portal's "active medications."

## Referral sources — built

Tracks where a patient came from — RMP/local doctors, health camps,
insurance companies, health-card schemes — per an explicit product
directive: "keep in mind the patient referral system by RMP, local doctors,
camps, insurance, health cards etc." **Data capture + reporting only for
this step — deliberately no billing/commission integration** (that's a
real, separate scope: referring-doctor payouts, insurance/TPA claim
tracking — flag separately if/when asked for).

- **Same self-configuring philosophy as `form_templates`**: only the
  `type` category (`RMP`/`LOCAL_DOCTOR`/`CAMP`/`INSURANCE`/`HEALTH_CARD`/
  `OTHER`) is code-defined; the actual list of named sources is entirely
  tenant-owned data (`referral_sources` table, migration 013) — a
  hospital adds its own referring doctors/camps/insurers on
  `(app)/dashboard/admin/referral-sources`, nothing pre-filled or
  hardcoded, same "the system builds itself, not each outcome" principle.
- **Attached per-PATIENT** (`patients.referral_source_id`, nullable FK),
  set once at registration, editable later — not per-visit (explicit
  choice: simpler, and a patient's original referral doesn't usually
  change across follow-up visits).
- Never hard-deleted — `active: false` retires a source from the
  registration dropdown without breaking any patient record that already
  references it (`ON DELETE SET NULL` if a source ever is removed).
- Read access (`GET /api/referral-sources`, for the dropdown) is gated on
  `patient:create` — anyone who can register a patient can see the list.
  Managing the list itself (`POST`/`PATCH`) is `referral:manage`
  (`HOSPITAL_ADMIN` wildcard + `OWNER_*` via `OWNER_EXTRAS` — same group
  as `formtemplate:manage`, under the existing HOSPITAL_ADMIN-only
  `dashboard/admin` layout gate).
- **Explicit cross-tenant check on attach**, not just reliance on the FK:
  `registration/patients` (create) and `.../[id]` (edit) both verify the
  given `referralSourceId` resolves under `tenantDb` (i.e. belongs to the
  caller's own tenant) before writing it — the DB-level FK alone only
  guarantees the id exists *somewhere*, not that it's this tenant's row.

## Dashboard overview — improved

`(app)/dashboard` (the landing page after login) went from a near-empty
placeholder to real at-a-glance stat cards, module-aware — a card only
appears if that module is active for the tenant. Server component, raw
`prisma` throughout (no request/AsyncLocalStorage context here, same
reasoning as `dashboard/layout.js`), every query explicitly
`tenant_id`-scoped.

- **Every tenant**: patients registered today, open visits today, patients
  referred today (a `referral_sources` reporting payoff, not just data
  capture).
- **PHARMACY active**: low-stock medicine count (same threshold rule as
  the Pharmacy inventory screen), prescriptions pending dispense.
- **LAB active**: lab orders pending (ordered/in-progress).
- **IPD active**: beds occupied / total.
- **BILLING active**: open bills (OPEN/PARTIALLY_PAID).
- **SUPER_ADMIN**: platform-wide counts (total tenants, active tenants,
  staff accounts across all tenants) instead of the old static "next
  build step" placeholder text, which was stale — Super Admin has been
  built since.

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
