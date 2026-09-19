# Kaizen HMS — Complete Manual Testing Guide

**This is an audit document only.** Every fact below was read directly from
the running code, the live database, or a real login attempt made while
writing this guide — nothing was invented. Where something could not be
verified, it says so explicitly (search this file for **"NO VERIFIED TEST
ACCOUNT FOUND"** and **"CANNOT BE VERIFIED FROM UI"**).

All 8 demo-account passwords below were tested live against the running
server on 2026-09-18, not copied from a comment and assumed correct.

---

## PART 1 — APPLICATION STARTUP

Kaizen HMS is **one Next.js application on one custom Node server**
(`server.js` = Next.js + Socket.io in a single process) — there is no
separate frontend/backend to start, and no separate API URL; the API lives
at `/api/*` on the same origin as the UI.

```
START APPLICATION
1. Run:      npm run dev
2. Open:     http://localhost:3000/login   (staff)
             http://localhost:3000/patient/demo/login   (patient portal, Demo Hospital)
3. Verify:   curl http://localhost:3000/api/health
4. Expected result:
             {"ok":true,"checkedAt":"...","tcp":{"reachable":true,...},"database":{"reachable":true,...}}
```

- **Database requirement**: there is no local/dev database — this project
  connects to one real remote MariaDB (Hostinger, `DB_HOST=srv1872.hstgr.io`)
  from `.env`. It must be reachable (Remote MySQL enabled + this machine's
  IP whitelisted on the Hostinger side) before the app will do anything
  useful.
- **Environment requirements** (`.env`, copied from `.env.example`):
  `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`, `DATABASE_URL`,
  `JWT_SECRET`, `EXTERNAL_INTEGRATION_KEY` (32-byte base64 — required for
  the External Integration module to start at all; `src/lib/crypto.js`
  throws if missing). `EMAIL_USER`/`EMAIL_APP_PASSWORD` are for Patient
  Portal OTP delivery — **confirmed NOT set in this environment's `.env`**
  (see Part 25/Part 7 — Patient Portal login cannot complete end-to-end
  here as a result, a genuine environment gap, not a bug).
- **Health-check URL**: `GET /api/health` — deliberately public (no login
  needed), checks a raw TCP connection to the DB host/port AND a real
  `SELECT 1` query, independently, and returns both. This is the fastest
  way to confirm "is the app actually able to reach the database" before
  testing anything else.
- **How to verify the server is running**: the terminal running `npm run
  dev` prints `> kaizenbms ready on http://localhost:3000 (development)`;
  independently, `/api/health` returning `"ok":true` confirms both the HTTP
  server and the database connection are alive.
- **Build/lint** (not needed to just run the app, but relevant if you
  change code): `npm run build` (`prisma generate && next build --webpack`),
  `npm run lint`.

---

## PART 2 — ALL AVAILABLE TEST USERS

Source of truth: `migrations/seed.sql` (comment: *"All demo passwords:
Passw0rd!"*) — but seed.sql is only ever run **once by hand** on a fresh
database (per `scripts/seed.js`); it is **not** re-run automatically. So
the seed FILE is not proof these accounts exist right now — I queried the
live `users`/`tenants` tables directly, and then **logged in as every
single one of the 12 real users with `Passw0rd!` over a live HTTP request**
to confirm the password actually works, not just that the row exists.

| Role | Login ID | Password | Tenant | Purpose |
|---|---|---|---|---|
| SUPER_ADMIN | `super@kaizen.platform` | `Passw0rd!` | — (platform, no tenant) | Platform control: tenants, module registry, platform analytics |
| HOSPITAL_ADMIN | `admin@demo.hms` | `Passw0rd!` | Demo Hospital (id 1, `demo`) | Full control of Demo Hospital — the main test tenant |
| RECEPTIONIST | `reception@demo.hms` | `Passw0rd!` | Demo Hospital | Registration, appointments, attendance proxy |
| DOCTOR | `doctor@demo.hms` | `Passw0rd!` | Demo Hospital | OPD queue, consultations, prescriptions, lab/radiology orders |
| NURSE | `nurse@demo.hms` | `Passw0rd!` | Demo Hospital | IPD bed board, nursing notes, vitals |
| PHARMACIST | `pharmacist@demo.hms` | `Passw0rd!` | Demo Hospital | Pharmacy queue, inventory, dispensing |
| LAB_TECH | `lab@demo.hms` | `Passw0rd!` | Demo Hospital | Lab queue, collect/receive/result entry |
| BILLING_STAFF | `billing@demo.hms` | `Passw0rd!` | Demo Hospital | Billing, payments, reports |
| OWNER_DOCTOR | `owner@drmehra.clinic` | `Passw0rd!` | Dr. Mehra's Clinic (id 2, `drmehra`, **DOCTOR_SOLO**) | Solo-doctor tenant — one login, no staff hierarchy |
| OWNER_PHARMACIST | `owner@citychemist.shop` | `Passw0rd!` | City Chemist (id 3, `citychemist`, **PHARMACY_SOLO**) | Solo-pharmacy tenant |
| OWNER_LAB_TECH | `owner@prabhatlab.co` | `Passw0rd!` | Prabhat Diagnostic Lab (id 4, `prabhatlab`, **LAB_SOLO**) | Solo-lab tenant |
| HOSPITAL_ADMIN (2nd tenant) | `owner@testsecondhosp.test` | `Passw0rd!` | TEST Second Hospital (id 5, `test-second-hosp`, **HOSPITAL**) | A genuine **second** hospital tenant — use this for real multi-tenant isolation testing (Part 5) |

**RADIOLOGY_STAFF — NO VERIFIED TEST ACCOUNT FOUND.** The role exists in
`src/lib/rbac.js` (`radiology:read`/`radiology:manage`/`radiology:report`)
and Radiology is fully implemented and active on Demo Hospital
(`tenant_modules` confirms `RADIOLOGY: is_active = true` for tenant 1), but
no `users` row anywhere in the live database has this role — Radiology
shipped after `seed.sql` was written and no seed entry was ever added for
it. **To create one**: log in as `admin@demo.hms` (HOSPITAL_ADMIN) — there
is currently no self-service "add staff with login" screen in the product
(Staff Management's Directory tab manages *profile* data for existing
logins, not account creation), so the only way to add a new login today is
a direct database insert (`users` table: `tenant_id=1`,
`role='RADIOLOGY_STAFF'`, `password_hash` = a real bcrypt hash of a chosen
password, cost 12 — e.g. `node -e "console.log(require('bcryptjs').hashSync('YourPassword!', 12))"`).
This is a genuine gap worth flagging, not something to guess around.

**"SOLO_DOCTOR" / "SOLO_PHARMACY" / "SOLO_LAB"** from the task's checklist
are not separate roles — they are **tenant types** (`DOCTOR_SOLO`/
`PHARMACY_SOLO`/`LAB_SOLO`); the actual login role in each case is
`OWNER_DOCTOR`/`OWNER_PHARMACIST`/`OWNER_LAB_TECH` above, which do exist
and were verified.

**Resetting a password**: there is no "forgot password" flow anywhere in
this product for staff logins. The only way to change one is a direct
database update to `users.password_hash` with a freshly bcrypt-hashed
value (cost 12, matching `src/lib/auth.js`'s own hashing).

---

## PART 3 — LOGIN / AUTHENTICATION

━━━━━━━━━━━━━━━━━━━━━━
**FEATURE: Staff login**
━━━━━━━━━━━━━━━━━━━━━━
**LOGIN:** any role from Part 2
**LOGIN ID:** e.g. `admin@demo.hms`
**PASSWORD:** `Passw0rd!`
**URL:** `http://localhost:3000/login`

**STEP 1:** Open `/login`.
**STEP 2:** Enter the email and password.
**STEP 3:** Click the sign-in button.

**EXPECTED RESULT:** Redirected to `/dashboard`. The sidebar shows only
the sections/links this role is allowed to see (built from
`src/lib/navRegistry.js`'s `visibleNav()` — role + active module + tenant
type, all three checked server-side, not just hidden in the UI).

**DATABASE EFFECT:** none written on login itself (a session cookie is
issued, not a DB row). A JWT (`{uid, hid, role}`, 8h expiry) is set as an
httpOnly, secure, `sameSite=strict` cookie — never in `localStorage`.

**HOW TO VERIFY:** open DevTools → Application → Cookies — confirm the
session cookie is `HttpOnly` (JavaScript cannot read it — try
`document.cookie` in the console and confirm the session value is absent).

**HOW TO EXPLAIN:** "Logging in checks the password against a bcrypt hash
(never stored in plain text) and, if it matches, issues a signed token
that says who you are and what hospital you belong to. Every single page
and API call after that re-checks this token — nothing is trusted from
the browser itself."

**NEGATIVE TEST 1 — wrong password:** same email, wrong password.
**EXPECTED:** a generic error (no "user not found" vs "wrong password"
distinction — this prevents an attacker from learning which emails are
registered). Login is also rate-limited to 5 attempts per email per 15
minutes.

**NEGATIVE TEST 2 — invalid/unregistered user:** `nobody@demo.hms` / any
password.
**EXPECTED:** the exact same generic error as above.

**NEGATIVE TEST 3 — protected page without a session:** open a fresh
private/incognito window, go directly to `http://localhost:3000/dashboard`.
**EXPECTED:** redirected to `/login` — `src/proxy.js` verifies the session
cookie on every `/dashboard/*` and `/api/*` request before anything else
runs.

**NEGATIVE TEST 4 — direct API call without a session:**
`curl http://localhost:3000/api/opd/queue` (no cookie).
**EXPECTED:** `401`.
━━━━━━━━━━━━━━━━━━━━━━

**Logout**: the topbar's profile menu has a Sign out action
(`POST /api/auth/logout`, clears the cookie). After logout, repeat
Negative Test 3 — you should be redirected to `/login` again.

**Patient Portal login** is a **completely separate system** — phone
number + emailed OTP, not the staff email/password above. See Part 7 for
why it cannot be completed end-to-end in this environment (no email
credentials configured).

---

## PART 4 — RBAC TESTING

This matrix is read directly from `src/lib/rbac.js`'s `PERMISSIONS` object
— nothing here is inferred from the UI. "✓*" = only via the `"*"` wildcard
(`SUPER_ADMIN`/`HOSPITAL_ADMIN` — full control within their own tenant).

| Action (as used in code) | Admin | Doctor | Receptionist | Nurse | Pharmacist | Lab Tech | Radiology Staff | Billing Staff |
|---|---|---|---|---|---|---|---|---|
| `patient:create` | ✓* | | ✓ | | | | | |
| `patient:read` | ✓* | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `visit:create` | ✓* | | ✓ | | | | | |
| `consultation:create` | ✓* | ✓ | | | | | | |
| `prescription:create` | ✓* | ✓ | | | | | | |
| `laborder:create` | ✓* | ✓ | | | | | | |
| `radiology:create` | ✓* | ✓ | | | | | | |
| `stock:read`/`create`/`adjust` | ✓* | | | | ✓ | | | |
| `dispense:create` | ✓* | | | | ✓ | | | |
| `lab:collect`/`receive`/`result` | ✓* | | | | | ✓ | | |
| `radiology:manage`/`report` | ✓* | | | | | | ✓ | |
| `bed:manage` | ✓* | | | ✓ | | | | |
| `admission:create`/`update` | ✓* | ✓ | | | | | | |
| `nursingnote:create` | ✓* | | | ✓ | | | | |
| `bill:create`/`update` | ✓* | | | | | | | ✓ |
| `service:manage`/`tariff:manage` | ✓* | | | | | | | |
| `reports:view` | ✓* | | | | | | | ✓ |
| `analytics:view` | ✓* | ✓ | | | ✓ | ✓ | ✓ | ✓ |
| `appointment:create`/`update` | ✓* | ✓ | ✓ | | | | | |
| `doctorslot:manage` | ✓* | ✓ (own only) | | | | | | |
| `attendance:proxy` | ✓* | | ✓ | | | | | |
| `staff:manage` (roster/leave-approve) | ✓* | | | | | | | |
| `formtemplate:manage` | ✓* | | | | | | | |
| `external:read`/`external:manage` | ✓* (wildcard only) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `workflow:read`/`manage` | ✓* (wildcard only) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `moduleinstance:*`/`moduleconnection:*`/`department:*` | ✓* (wildcard only) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `tenant:read`/`tenant:manage`/`analytics:platform` | **SUPER_ADMIN only** — HOSPITAL_ADMIN's wildcard does NOT reach these | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

The last row is the one deliberate exception to "Admin = wildcard = can do
everything": `canPlatform()` in `rbac.js` requires `session.role ===
"SUPER_ADMIN"` literally, for exactly 3 actions, regardless of any role's
`"*"`. This was a real vulnerability found and fixed on 2026-09-15 (see
`CLAUDE.md` "RBAC security hardening") — worth testing specifically.

**Manual RBAC tests** (each: log in as the role, try the action, confirm
the result):

- Login as **Doctor** → open `http://localhost:3000/dashboard/admin/external`
  directly → **expected: redirected away** (page-level guard,
  `dashboard/admin/layout.js` requires `formtemplate:manage`).
- Login as **Doctor** → `curl -b <doctor-cookie> http://localhost:3000/api/external/providers`
  → **expected: `403 {"error":"forbidden"}`**.
- Login as **Pharmacist** → open `/dashboard/pharmacy` → **expected:
  allowed**, Prescription queue + Inventory tabs both work.
- Login as **Pharmacist** → open `/dashboard/lab` directly → **expected:
  redirected to `/dashboard`** (no `lab:read`, and the LAB module nav
  entry itself is filtered out).
- Login as **HOSPITAL_ADMIN (`admin@demo.hms`)** →
  `curl -b <admin-cookie> http://localhost:3000/api/admin/tenants` →
  **expected: `403`** — this is the platform-scope check; confirm it is
  still enforced.
- Login as **SUPER_ADMIN** → same call → **expected: `200`**, full tenant
  list.
- Login as **Receptionist** → try `POST /api/opd/consultations` (create a
  consultation) → **expected: `403`** (no `consultation:create`).

---

## PART 5 — MULTI-TENANT ISOLATION

**Real available tenants** (from the live database, Part 2's table):
Demo Hospital (id 1), Dr. Mehra's Clinic (id 2, solo doctor), City Chemist
(id 3, solo pharmacy), Prabhat Diagnostic Lab (id 4, solo lab), **TEST
Second Hospital (id 5)** — the last one is the right pair to use for a
real two-hospital isolation test, since both are full `HOSPITAL` tenants.

**Test:**
1. Log in as `admin@demo.hms` (tenant 1). Go to Registration, register a
   patient (e.g. "Isolation Test Patient"). Note the patient appears in
   Demo Hospital's queue.
2. Log out. Log in as `owner@testsecondhosp.test` (tenant 5).
3. Go to Registration → search for "Isolation Test Patient".

**EXPECTED RESULT:** zero results. Tenant 5 cannot see tenant 1's patient,
under any screen, ever.

**Direct API test** (stronger than the UI test — proves the boundary is
enforced server-side, not just hidden):
```
curl -b <tenant5-cookie> http://localhost:3000/api/registration/patients?q=Isolation
```
**EXPECTED:** empty result — not a 403, not an error, just genuinely no
matching rows, because the query itself is scoped to tenant 5.

**Explaining `tenantDb` in plain language:** every table that holds
tenant-specific data (patients, visits, bills, prescriptions, …) has a
`tenant_id` column. Instead of trusting every single route in the codebase
to remember to add `WHERE tenant_id = ?` by hand, this project wraps the
database client (`tenantDb` in `src/lib/prismaClient.js`) so that
**every** read and write automatically gets the current tenant's id
injected — taken from the verified login token, never from anything the
browser sends. A route physically cannot "forget" the tenant filter,
because the filter isn't something the route writes at all; it's added
underneath it. This was verified early on by directly testing that tenant
2's session querying for tenant 1's row gets `null`, not the row.

---

## PART 6 — ADMIN / PLATFORM

All of these require `admin@demo.hms` (HOSPITAL_ADMIN) unless marked
SUPER_ADMIN-only. `dashboard/admin/*` pages are gated at the layout level
on `formtemplate:manage`.

| Feature | Menu | URL | Login |
|---|---|---|---|
| Tenant Management / Create / Suspend / Reactivate | Platform → Tenants | `/dashboard/platform/tenants`, `/tenants/new` | **SUPER_ADMIN only** |
| Module Registry (read-only catalog) | Platform → Module Registry | `/dashboard/platform/modules` | **SUPER_ADMIN only** |
| Platform Analytics | Platform → Platform Analytics | `/dashboard/platform/analytics` | **SUPER_ADMIN only** |
| Modules (per-tenant view) | Administration → Modules | `/dashboard/admin/modules` | HOSPITAL_ADMIN |
| Module Instances | Administration → Module Instances | `/dashboard/admin/module-instances` | HOSPITAL_ADMIN |
| Connection Center (module↔module) | Administration → Connection Center | `/dashboard/admin/module-connections` | HOSPITAL_ADMIN |
| Data Contracts (view-only) | Administration → Data Contracts | `/dashboard/admin/contracts` | HOSPITAL_ADMIN |
| Master Data (Departments, Services/Pharmacy/Lab previews) | Administration → Master Data | `/dashboard/admin/master-data` | HOSPITAL_ADMIN |
| Pricing (Services, Tariffs) | Administration → Pricing | `/dashboard/admin/pricing` | HOSPITAL_ADMIN (BILLING module) |
| External Integrations | Administration → External Integrations | `/dashboard/admin/external` | HOSPITAL_ADMIN |
| Workflows | Administration → Workflows | `/dashboard/admin/workflows` | HOSPITAL_ADMIN |
| Form Builder | Administration → Form Builder | `/dashboard/admin/forms` | HOSPITAL_ADMIN |
| Referral Sources | Administration → Referral Sources | `/dashboard/admin/referral-sources` | HOSPITAL_ADMIN |
| Branding | Administration → Branding | `/dashboard/branding` | HOSPITAL_ADMIN (or any doctor if `allow_doctor_branding` is on) |
| Staff Management | Operations → Staff Management | `/dashboard/staff` | Directory/Reports tabs need `staff:manage`; Roster/Leave/Attendance tabs are visible to any staff role |

━━━━━━━━━━━━━━━━━━━━━━
**FEATURE: Module Instances**
━━━━━━━━━━━━━━━━━━━━━━
**LOGIN:** `admin@demo.hms` · **URL:** `/dashboard/admin/module-instances`
**STEP 1:** Page loads a list per module (PHARMACY/DOCTOR_OPD/LAB/etc.),
each showing its instances (Demo Hospital has exactly one default
instance per active module today).
**STEP 2:** Type a name, click **Add** to create a second named instance
of a module (e.g. a second Pharmacy instance).
**STEP 3:** Use Suspend/Reactivate/Archive on an instance.
**EXPECTED RESULT:** a suspended instance cannot be selected as a target
for a new Connection; the tenant's *default* instance can be suspended but
never archived (enforced server-side, not just by disabling the button).
**DATABASE EFFECT:** `module_instances` row created/updated.
**HOW TO EXPLAIN:** "A module being 'active' for a hospital just means
they've rented it. An *instance* is a specific, named, running copy of
that module — most hospitals have exactly one Pharmacy, but a big one
might run 'Main Pharmacy' and 'Emergency Pharmacy' as two separate,
independently-stocked instances of the same module."
━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━
**FEATURE: Connection Center (module ↔ module)**
━━━━━━━━━━━━━━━━━━━━━━
**LOGIN:** `admin@demo.hms` · **URL:** `/dashboard/admin/module-connections`
**STEP 1:** Click **Connect Modules**, pick a Source module and a Target
module (e.g. DOCTOR_OPD → PHARMACY).
**STEP 2:** The modal shows which Data Contract this pair will use, and
what fields it carries/restricts (e.g. diagnosis/medical history are
always restricted).
**STEP 3:** Submit → connection appears **PENDING** → click **Approve**.
**STEP 4:** Try **Pause**, then **Resume**, then **Revoke** (confirmation
dialog appears — Revoke is terminal, cannot be undone or reconnected with
the exact same pair afterward).
**EXPECTED RESULT:** every transition writes an audit row you can see in
the connection's Details view (`module_connection_events` — full history,
who/when/from-status/to-status).
**DATABASE EFFECT:** `module_connections`, `module_connection_events`.
**HOW TO EXPLAIN:** "Two modules being active doesn't mean they can see
each other's data. A Connection is an explicit, admin-approved, revocable
permission slip between two specific instances, and even then it only
carries the exact fields the Data Contract for that pair declares — never
'everything'."
━━━━━━━━━━━━━━━━━━━━━━

**External Integrations, Workflows, Provider Management, Credentials,
Integration Health** — see **Part 23** (their own dedicated section,
since they're large enough to deserve one).

**Analytics (admin-relevant)** — see **Part 22**.

---

## PART 7 — PATIENT MANAGEMENT

━━━━━━━━━━━━━━━━━━━━━━
**FEATURE: Patient Registration**
━━━━━━━━━━━━━━━━━━━━━━
**LOGIN:** Receptionist
**LOGIN ID:** `reception@demo.hms` / **PASSWORD:** `Passw0rd!`
**MENU:** Operations → Registration
**URL:** `/dashboard/registration`

**STEP 1:** In the right-hand form, fill in the core fields (name, age,
phone, gender) plus the tenant's custom fields — Demo Hospital's
`form_templates` adds **Address** and **Blood group** on top of the core
fields (confirmed from the live `form_templates` row for this tenant;
these are tenant-configurable, not hardcoded).
**STEP 2:** Click **Register & add to queue**.
**EXPECTED RESULT:** the new patient appears immediately in "Today's
queue" on the same page (real-time, no refresh — see Part 19), with a
sequential token number.
**DATABASE EFFECT:** `patients` row created; `visits` row created
(`entry_type='OPD'`, `status='REGISTERED'`, a sequential `token_number`).
**HOW TO VERIFY:** `node -e` a Prisma lookup, or just re-search for the
patient from the "Returning patient" box on the same page.
**HOW TO EXPLAIN:** "Registration creates two things at once: the patient
(a permanent record) and a Visit (this specific trip to the hospital).
Everything that happens today — the consultation, the prescription, the
bill — hangs off this Visit, not directly off the patient, so a second
visit next month is a clean, separate record."
**NEGATIVE TEST:** leave a required field blank and submit.
**EXPECTED NEGATIVE RESULT:** the Register button stays disabled/the
request is rejected client- and server-side (every body is zod-validated;
an invalid one is a `400`, never silently accepted).
━━━━━━━━━━━━━━━━━━━━━━

**Returning patient / search**: the "Returning patient" box on the same
page (name or phone) — click **Find**, then **New visit** on the matching
row to open a fresh visit for an existing patient without re-entering
their details. The same row also has **edit allergies / email** and **edit
insurance / payment** actions, and (Receptionist only) **override token**
for a priority walk-in — this requires a non-empty reason and is logged to
`token_overrides` (who overrode it, why).

**Allergies**: shown as a persistent red badge next to the patient's name
everywhere they appear (queue, consultation screen) — never hidden behind
a click.

**Patient Portal** (a genuinely separate login system, phone + OTP, not
staff email/password): `http://localhost:3000/patient/demo/login`.
**This cannot be completed end-to-end in this environment** — `EMAIL_USER`/
`EMAIL_APP_PASSWORD` are not set in `.env`, so `request-otp` will return
its normal (deliberately generic, anti-enumeration) success response, but
no email is actually sent and — by design — no OTP is persisted unless the
send genuinely succeeds. `verify-otp` will therefore always fail
afterward. This is a real, disclosed environment gap, not a bug in the
OTP logic itself (confirmed patient `id 55`, phone `123`, email
`123@gmail.com` exists in tenant 1 as a real test fixture from earlier
testing, if you want to try it once email credentials are configured).

**Data flow to explain to a non-technical person:**
```
Patient  →  Visit  →  Consultation  →  Prescription / Lab Order / Radiology Order  →  Billing
```
"A Patient is a person. A Visit is one specific trip. Everything clinical
and financial that happens is tied to that one Visit, so the history of a
patient who's been in ten times is ten clean, separate stories, not one
tangled one."

---

## PART 8 — APPOINTMENTS

**LOGIN:** Receptionist or Doctor · **MENU:** Operations → Appointments ·
**URL:** `/dashboard/appointments` (module: APPOINTMENTS, active on Demo
Hospital)

| What to click | Expected result | Why it matters |
|---|---|---|
| **Today** button | Jumps the calendar back to the current date | Basic navigation |
| **Month / Week / Day** toggle | Switches the grid layout; Day view alone shows a "Show doctors side by side" toggle for comparing multiple doctors at once | Matches how a real front desk actually schedules |
| Prev/Next arrows either side of Today | Moves the visible range by 1 unit (day/week/month) | |
| Doctor picker | Filters the calendar to one doctor (Week/Month) | |
| Click an empty slot | Opens a booking modal — search-or-create a patient, enter a reason | This is the same `bookAppointment()` logic used everywhere else in the app |
| Click a booked slot | Opens a detail modal with **Confirm** / **Mark completed** / **No-show** / **Cancel** actions (only while not yet finalized) | Status transitions are one-way once finalized |
| "Manage my availability" (Doctor only) | Opens the doctor's own weekly slot template editor | A doctor manages only their own template — enforced server-side even if another doctor's id is guessed in a request |

**Double-booking (concurrency)**: the UI alone cannot force two genuinely
simultaneous bookings — this was already verified at the code level with
10 truly parallel `curl` requests hitting the exact same doctor+slot,
where exactly 1 succeeded and 9 got a clean `409 slot_taken` (a real
database unique constraint on a generated column, not an application-level
lock). **To re-verify manually without scripting**: open the same empty
slot in two browser tabs as the same doctor's context and submit both
booking forms within the same second — the second one should show a
"slot_taken" error, not a duplicate booking.

**Doctor's own follow-up scheduling**: on the OPD Consultation screen
(Part 9), the **Schedule follow-up** button opens the exact same booking
grid — verify the resulting appointment shows up in both the staff
calendar and (if you can complete OTP login) the patient's own portal.

---

## PART 9 — OPD / DOCTOR WORKFLOW

**LOGIN:** `doctor@demo.hms` · **MENU:** Clinical → Doctor / OPD ·
**URL:** `/dashboard/opd`

```
Appointment / Walk-in registration
        ↓
Doctor / OPD queue  (/dashboard/opd — "Call next (N waiting)" button)
        ↓
Click a queue row → Consultation screen (/dashboard/opd/[visitId])
        ↓
Fill the Consultation form → "Save consultation"
        ↓
"Prescription → Pharmacy" panel: add medicine/dosage/qty rows → "Send to pharmacy"
"Lab order → Lab" panel: add test names → "Send to lab"
"Radiology order → Radiology" panel: enter study name → "Order radiology"
```

━━━━━━━━━━━━━━━━━━━━━━
**FEATURE: OPD Queue → Consultation**
━━━━━━━━━━━━━━━━━━━━━━
**LOGIN:** `doctor@demo.hms`
**MENU:** Clinical → Doctor / OPD → click any waiting patient row
**URL:** `/dashboard/opd` then `/dashboard/opd/[visitId]`
**STEP 1:** On the OPD queue page, click **Call next** to advance the
oldest waiting token (this also updates the public waiting-room display —
see Part 19).
**STEP 2:** Click the patient's row (shows "waiting" until a consultation
exists, then "in progress").
**STEP 3:** Fill the consultation form (tenant's custom fields, e.g.
diagnosis/notes/fee), click **Save consultation**.
**EXPECTED RESULT:** the form is replaced by "Consultation recorded" plus
the diagnosis/notes/fee, and a **Schedule follow-up** button appears.
**DATABASE EFFECT:** `consultations` row created; `visits.status`
progresses.
**NEGATIVE TEST:** try prescribing a medicine matching a declared allergy
(add it to the patient's allergy list first via Registration) — the row
turns red and a checkbox appears: *"⚠ Matches declared allergy ... — I
acknowledge and want to prescribe anyway"*. **EXPECTED NEGATIVE RESULT:**
**Send to pharmacy** stays disabled until that box is ticked, and the
override is logged (`prescription_item_acks`), re-checked server-side —
the client warning is a convenience, not the actual authority.
━━━━━━━━━━━━━━━━━━━━━━

The Visit model is the spine: `visits.status` moves through
`REGISTERED → WITH_DOCTOR → PHARMACY/LAB → BILLING → DISCHARGED`
(OPD) or gains `TRIAGE`/`ADMITTED` for an IPD path — every screen in Parts
9–14 is really just "the next thing that can happen to this one Visit."

---

## PART 10 — PRESCRIPTION

On the Consultation screen's "Prescription → Pharmacy" panel: type a
medicine name (a red border means it textually matches a declared
allergy), dosage, quantity, then **+ row** for more lines, then **Send to
pharmacy**.

**No medicine autocomplete/inventory-availability check exists on the
prescribing screen itself** — this is an honest gap, not hidden: the
doctor prescribes freeform text; the Pharmacy screen (Part 11) is where
availability is actually checked, via its own **"Check pharmacy
availability"** panel per prescription card.

━━━━━━━━━━━━━━━━━━━━━━
**FEATURE: Prescription never deducts stock**
━━━━━━━━━━━━━━━━━━━━━━
**HOW TO VERIFY (this is the single most important architectural
invariant in the Pharmacy module):**
1. As Pharmacist, open `/dashboard/pharmacy` → Inventory tab, note a
   medicine's total quantity.
2. As Doctor, prescribe that exact medicine name on a consultation, click
   **Send to pharmacy**.
3. Reload the Pharmacy Inventory tab.
**EXPECTED RESULT:** quantity is **byte-for-byte unchanged**. A
prescription only creates `prescription_items` rows — it never touches
`pharmacy_stock`.
4. Now, as Pharmacist, go to the Prescription queue tab, find that
   prescription, click **Dispense N** on the line.
**EXPECTED RESULT:** *now* the Inventory quantity drops by exactly the
dispensed amount, and a `pharmacy_stock_movements` row (`type='DISPENSE'`)
appears.
**HOW TO EXPLAIN:** "Writing a prescription and physically handing out the
medicine are two separate real-world events with two separate people
responsible for them, so the software keeps them as two separate actions
— nothing is deducted from stock until a pharmacist actually presses
Dispense."
━━━━━━━━━━━━━━━━━━━━━━

---

## PART 11 — PHARMACY

**LOGIN:** `pharmacist@demo.hms` · **MENU:** Clinical → Pharmacy ·
**URL:** `/dashboard/pharmacy` — two tabs: **Prescription queue** and
**Inventory**.

━━━━━━━━━━━━━━━━━━━━━━
**FEATURE: Stock-in, FEFO dispensing, low-stock/expiry**
━━━━━━━━━━━━━━━━━━━━━━
**STEP 1 (Inventory tab):** Fill the **Stock-in** form (medicine, batch #,
expiry date, qty), click **Add**.
**STEP 2:** Add a *second* batch of the **same medicine name** with an
**earlier** expiry date.
**STEP 3 (Prescription queue tab):** dispense that medicine against a
pending prescription line.
**EXPECTED RESULT (FEFO):** the earlier-expiry batch is consumed first —
verify by reopening Inventory and checking which batch's quantity dropped
(`src/lib/pharmacy` dispense route orders candidate batches by
`expiry_date ASC` inside a row-locked transaction).
**Before/after measurement:** record each batch's quantity before
dispensing, dispense, record again — the earliest-expiry batch's quantity
should be the one that decreased (or be exhausted first if it's smaller
than the requested amount, spilling into the next-earliest batch —
**partial fulfillment across batches**).
**Low-stock / expiring / expired**: the Inventory tab surfaces a low-stock
banner once a medicine's total quantity is at/under its threshold
(default 10, adjustable), and flags a batch "expiring soon" (within 30
days) or "expired" — an expired batch stays visible (frozen) until
explicitly written off via a manual adjustment, never silently removed.
**Manual adjustment**: on a batch row, click the adjust control, enter a
`±` quantity and a **required reason** — this is logged
(`pharmacy_stock_movements`, `type='ADJUSTMENT'`) with who performed it.
**DATABASE EFFECT:** `pharmacy_stock` (quantity), `pharmacy_stock_movements`
(the append-only audit trail — every stock-in, dispense, and adjustment is
one row here, forever).
━━━━━━━━━━━━━━━━━━━━━━

**Pharmacy instances / standalone pharmacy**: Demo Hospital has exactly
one default Pharmacy instance today (multi-instance support exists at the
architecture level — see Module Instances, Part 6 — but no second instance
has been created on this tenant). A genuinely standalone pharmacy exists
as its own tenant type: log in as `owner@citychemist.shop`
(OWNER_PHARMACIST, City Chemist, `PHARMACY_SOLO`) — this tenant has
*only* the Pharmacy module active; the sidebar and every clinical screen
outside Pharmacy simply doesn't exist for this login, confirming the
"a solo tenant's UI feels purpose-built, not a hospital app with things
hidden" design.

---

## PART 12 — LAB

**Doctor** (`doctor@demo.hms`): create a lab order from the Consultation
screen's "Lab order → Lab" panel (Part 9).

━━━━━━━━━━━━━━━━━━━━━━
**FEATURE: Lab order lifecycle**
━━━━━━━━━━━━━━━━━━━━━━
**LOGIN:** `lab@demo.hms` (LAB_TECH) · **MENU:** Clinical → Lab ·
**URL:** `/dashboard/lab`
**STEP 1:** Find the order, click **Mark collected**.
**STEP 2:** Click **Mark received**.
**STEP 3:** Click **Enter results** — a row per test appears (test /
result / units / reference range / flag dropdown: NORMAL/HIGH/LOW/
ABNORMAL). Fill them in.
**STEP 4:** Click **Finalize report**.
**EXPECTED RESULT:** a green banner *"Report finalized."* with a **Print
report →** link (`/print/lab-report/[id]`, no dashboard chrome, a
`print:hidden` Print button on the page itself).
**DATABASE EFFECT:** `lab_orders.status` → `RESULTED`, `results` (JSON),
`resulted_at` set.
**HOW TO VERIFY downstream visibility (all should update with zero manual
refresh — see Part 19):**
- **Clinical**: reopen the same consultation as the Doctor — the Lab order
  panel shows the new status and a Print link.
- **Billing**: if this visit is billed via `POST /api/billing/opd`, the
  test appears as a LAB line item.
- **Patient portal**: the "Lab Reports" tab (if OTP login were completable).
- **Realtime**: the Lab screen updates live in a second browser tab
  without reloading.
- **Alerts/Analytics**: no lab-specific alert category exists (pharmacy/
  workflow/radiology/leave are the only alert categories — see Part 20);
  Analytics → Lab (Part 22) picks up the result on its next rollup.
━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━
**FEATURE: External MOCK Lab integration**
━━━━━━━━━━━━━━━━━━━━━━
**IMPORTANT, verified by reading every Lab/Pharmacy client component: there
is NO button anywhere in the product UI to send a lab order to an external
provider.** `sendLabOrderExternal()` exists only as a real, working,
already-tested API endpoint — `POST /api/lab/orders/[id]/send-external` —
with no UI wired to it. To test this flow you need a REST client (curl,
Postman, Insomnia), logged in as `admin@demo.hms` (cookie from `/api/auth/login`),
or a HOSPITAL_ADMIN cookie for any action needing `external:manage`.
See **Part 23** for the full step-by-step with real request bodies. Do
**not** claim a real Lab vendor exists anywhere — only the `MOCK_LAB`
sandbox adapter is wired up.
━━━━━━━━━━━━━━━━━━━━━━

---

## PART 13 — RADIOLOGY

**Doctor**: Consultation screen's "Radiology order → Radiology" panel —
type a study name (e.g. "Chest X-Ray"), click **Order radiology**.

**LOGIN:** need a `RADIOLOGY_STAFF` login — **none exists** (Part 2). As a
workaround for testing, `admin@demo.hms` (HOSPITAL_ADMIN wildcard) can
reach `/dashboard/radiology` and perform every action below; a dedicated
`RADIOLOGY_STAFF` account would need to be created manually first (Part 2)
to test the role-specific gate itself.

**MENU:** Clinical → Radiology · **URL:** `/dashboard/radiology` — tabs
**All / Pending / Scheduled / In Progress / Completed**.

| What to click | Expected result |
|---|---|
| **Schedule** (on an ORDERED order) | Status → SCHEDULED |
| **Start** (on ORDERED or SCHEDULED) | Status → IN_PROGRESS |
| **Complete & submit report** | Opens Findings (optional) / Impression (**required**) fields → **Submit report** completes the study **and** files the report in one action (deliberately combined — see `CLAUDE.md` "Radiology module" for why a 6th "done, report pending" status was skipped) |
| **Cancel** | Requires a typed reason → **Confirm** |

Priority is shown as a colored pill (ROUTINE/URGENT/STAT). Findings +
Impression are visible on a COMPLETED order's card. Billing/patient-portal/
realtime/workflow visibility mirror Lab's exactly (Part 12) — the
`RADIOLOGY_ORDER_TO_RESULT` workflow (Part 17) tracks this order end to
end. **External MOCK Radiology does NOT exist** — only Lab and Pharmacy
have an external integration layer; do not test for one.

---

## PART 14 — IPD

**LOGIN:** `admin@demo.hms` or `nurse@demo.hms` (bed:manage) — admitting
itself is `admission:create`, a **Doctor** action.
**MENU:** Clinical → IPD / Beds · **URL:** `/dashboard/ipd`

```
Vacant bed (green) → click → Admit modal
    → find existing patient (Find + Admit) OR "Or admit a new patient" (name/age/phone) + reason
    → "Admit new patient"
        ↓
Bed turns red (Occupied) → click it → Summary popover
    → Nursing tab: vitals/notes (Nurse)
    → Transfer: pick a vacant bed + reason → "Confirm transfer"
    → Discharge: pick a type (Routine / Transfer to another facility / Against medical advice / Death)
      + notes → "Discharge"
        ↓
Bed turns amber (Cleaning) → "✓ Mark ready" → back to Vacant
```

**Bed Board legend** (shown on the page itself): green = Vacant (click to
admit), red = Occupied (click to view/discharge), amber = Cleaning, grey =
Maintenance (Out of service). **+ Add / manage beds** (top right, admin
only) opens the "Add a bed" form (ward type/bed number/daily rate — the
daily rate is what auto-calculates the room charge at discharge).
**Occupancy report** toggle shows per-ward occupancy % and average length
of stay.

**Maintenance**: on a Vacant bed, **Set maintenance** requires a reason
(and optional "until" date); **Clear maintenance** reverses it.

**DATABASE EFFECT** across this flow: `admissions` (created on admit,
`discharged_at`/`discharge_type` set on discharge), `beds.status`,
`bed_transfers` (append-only, one row per transfer), `nursing_notes`,
`bills` (an IPD `Bill` is auto-created the moment admission happens; a
room-charge line is auto-added at discharge using `nights × daily_rate`).

**Explain to a non-technical person:** "Admitting a patient isn't just one
database change — it locks a bed, opens a running bill that will collect
charges for the whole stay, and starts a background checklist (the IPD
Workflow, Part 17) that tracks the stay through to discharge and final
billing automatically."

---

## PART 15 — BILLING

**LOGIN:** `billing@demo.hms` · **MENU:** Operations → Billing ·
**URL:** `/dashboard/billing`

━━━━━━━━━━━━━━━━━━━━━━
**FEATURE: OPD billing + payment + discount + refund**
━━━━━━━━━━━━━━━━━━━━━━
**STEP 1:** In the "Create OPD bill" form, type a real `visit id` (from a
visit that had a consultation/dispensed items/lab order), click
**Create**. Calling this twice for the same visit returns the *same* bill,
never a duplicate.
**STEP 2:** Click the bill in the left list to open its detail.
**STEP 3:** For any pharmacy/lab line still priced at ₹0 (no tariff
mapping — see below), edit its price inline and save.
**STEP 4:** Fill **Record payment** (amount + mode: CASH/CARD/UPI/etc.).
**STEP 5:** Fill a discount (amount + **required reason** — never
anonymous) and/or a refund (amount + reason).
**EXPECTED RESULT:** the bill's status moves OPEN → PARTIALLY_PAID → PAID
automatically (`recomputeBillStatus()` is the *only* place this is
computed — never hand-set), and the balance always reflects
`items − discounts − (payments − refunds)`.
**DATABASE EFFECT:** `bills`, `bill_items`, `payments`, `discounts`,
`refunds`. Payments/discounts/refunds each carry a client-generated
`idempotencyKey` (visible in the code as `crypto.randomUUID()`) — retrying
the exact same submission after a network blip returns the existing row,
never a duplicate charge.
**HOW TO VERIFY historical price snapshots**: price a service via
Pricing (Part 6) at ₹500, bill it into a visit, then go change that
service's tariff to ₹700 in Pricing. Reopen the *original* bill —
**EXPECTED:** it still reads exactly ₹500 (`bill_items` stores its own
frozen price snapshot at the moment it was billed — a tariff change never
rewrites history).
**PRINT:** `/print/receipt/[billId]` — GST-formatted header if
`print_branding.gstin` is set (not GST-tax-computed, by explicit design —
no tax-rate catalog exists in this system).
━━━━━━━━━━━━━━━━━━━━━━

**IPD billing** happens automatically (Part 14) — there is no separate
"create IPD bill" button; look for the auto-created bill the moment an
admission exists.

**Explain:**
```
Service Master (Pricing → Services)
        ↓
Tariff (versioned price + tax, Pricing → Tariffs — never edited in place, only superseded)
        ↓
Bill Item (one line on a real bill)
        ↓
Price Snapshot (frozen forever on that bill_item, immune to later tariff changes)
        ↓
Payment / Discount / Refund (against the whole bill, not one line)
```

---

## PART 16 — HR / STAFF

**LOGIN:** `admin@demo.hms` (Directory/Reports tabs) or any staff role
(Roster/Leave/Attendance tabs) · **MENU:** Operations → Staff Management ·
**URL:** `/dashboard/staff` — tabs: **Directory / Duty Roster / Leave
Requests / Attendance / Reports**.

- **Attendance tab** (also reachable standalone at `/dashboard/attendance`):
  self **check-in**/**check-out**, a **break** (with a required reason and
  category PERSONAL/HOSPITAL_WORK — only PERSONAL deducts worked time).
  Checking out while a break is still open is blocked
  (`close_break_first`). **Proxy attendance** (Receptionist only, under
  "Staff without login") — mark a no-login `staff_members` row present,
  **photo required** (client-compressed, no external file storage — stored
  directly as a data URL).
- **Duty Roster**: HOSPITAL_ADMIN assigns shifts; every role can view who's
  scheduled.
- **Leave Requests**: any staff role can submit one
  (`leaverequest:create`); only HOSPITAL_ADMIN sees/approves. **Privacy
  test**: as Receptionist, view a doctor's leave request in the shared
  list — the *reason* should read `null`/hidden; dates/status stay
  visible to everyone (for scheduling awareness), but only the requester
  and an admin ever see the actual reason text.
- **Reports tab**: attendance % over a date range, and a roster-coverage
  view flagging any shift with zero doctors assigned.

---

## PART 17 — WORKFLOW ENGINE

**LOGIN:** `admin@demo.hms` · **MENU:** Administration → Workflows ·
**URL:** `/dashboard/admin/workflows` — status filter cards RUNNING /
WAITING / FAILED / COMPLETED.

There are exactly **4** workflow definitions
(`src/lib/workflows/definitions.js`) — do not expect more:

```
1. OPD_PHARMACY_BILLING  ("OPD → Pharmacy → Billing")
   PRESCRIPTION_CREATED → CONNECTION_VALIDATED → CONTRACT_VALIDATED
     → AVAILABILITY_CHECK → DISPENSING → BILLING → COMPLETED

2. LAB_RESULT_BILLING  ("Lab Order → Result → Billing")
   ORDER_CREATED → RESULT_ENTERED → CLINICAL_NOTIFIED → BILLING_SYNCED → COMPLETED

3. IPD_ADMISSION_TO_DISCHARGE  ("IPD Admission → Discharge")
   ADMITTED → NURSING_RECORDED → PHARMACY_SYNCED → LAB_SYNCED
     → DISCHARGED → FINAL_BILL_GENERATED → COMPLETED

4. RADIOLOGY_ORDER_TO_RESULT  ("Radiology Order → Result")
   ORDER_CREATED → CONNECTION_VALIDATED → CONTRACT_VALIDATED
     → REPORT_COMPLETED → CLINICAL_NOTIFIED → BILLING_SYNCED → COMPLETED
```

**How to test manually:** create a prescription (Part 10) → within a
couple of seconds, a new instance of Workflow 1 appears on
`/dashboard/admin/workflows` with status RUNNING, its step checklist
advancing as the Outbox processes the underlying event. Click an instance
to see its full step-by-step detail and — if any step is FAILED/WAITING —
a **Retry** button (bounded: 5 attempts max, matching the Outbox's own
retry cap).

**Explain the difference from normal code:** "A workflow never actually
performs an action itself — it only *watches* for things that already
happened (a prescription was created, a connection is active, a lab
result came in) and records progress. If a hospital only has internal
Pharmacy with no external connection, the workflow just marks the
Connection/Contract steps as skipped rather than blocking — it observes
reality, it doesn't dictate it."

---

## PART 18 — OUTBOX

```
DB Transaction (e.g. booking an appointment)
        ↓  (same transaction, same commit — never a separate write after the fact)
Outbox Event  (outbox_events row: PENDING)
        ↓  (a background loop polling every 2 seconds, in the same Node process)
Processor claims it (SELECT ... FOR UPDATE SKIP LOCKED — race-safe under concurrency)
        ↓
Consumer(s) run (can be more than one per event type — e.g. an observability
                  logger AND the Workflow Engine both react to PrescriptionCreated)
        ↓
PROCESSED, or FAILED after 5 attempts with exponential backoff (never an
infinite retry loop)
```

**How to manually verify from the app**: `GET /api/outbox` (action
`outbox:read`, wildcard-only — any HOSPITAL_ADMIN session) returns counts
by status and event type, plus the 5 most recent FAILED rows. There is
**no dedicated UI screen** for this — it's an API-only observability
endpoint by deliberate design (flagged as out of scope when built). Call
it directly:
```
curl -b <admin-cookie> http://localhost:3000/api/outbox
```
**Event types you can trigger**: `AppointmentBooked` (book any
appointment), `PrescriptionCreated` (send a prescription), `PaymentReceived`
(record a payment), `RadiologyOrderCreated`, `RadiologyResultCompleted`.

**Do not** manually force a real production failure to "test" this — the
Outbox's retry/backoff/FAILED-cap behavior was already verified with a
deliberately-throwing test consumer during development; forcing a fresh
failure now would just add noise to the real Outbox table for no new
information.

---

## PART 19 — REALTIME

Every one of these fires **in the same request cycle** as the write (zero
delay, no polling) via Socket.io, scoped to `tenant:<id>` or
`tenant:<id>:<module>` rooms. Full verified list of every distinct event
this codebase emits: `admission:created/discharged/transferred`,
`appointment:booked/cancelled`, `attendance:updated`, `bed:updated`,
`bill:created/paid/updated`, `branding:updated`, `consultation:created`,
`department:created/updated`, `dispense:created`, `dutyshift:created/deleted`,
`externalorder:updated`, `formtemplate:updated`, `lab:result`,
`laborder:created/updated`, `leaverequest:created/updated`,
`module_connection:requested/updated`, `module_instance:created/updated`,
`nursingnote:created`, `patient:created/updated`, `prescription:created/new/updated`,
`radiology:result`, `radiologyorder:created/updated`,
`referralsource:created/updated`, `service:created/updated`,
`staffmember:created/updated`, `stock:updated`, `tariff:created/updated`,
`tenant:modules_updated/updated`, `threshold:updated`, `visit:created/updated`,
`visit.called` (waiting-room display only), `workflow:updated`.

**How to manually test with two windows:**

| Window A (actor) | Window B (observer) | Expected |
|---|---|---|
| Receptionist registers a patient | Doctor's OPD queue, already open | New token appears instantly, no refresh |
| Doctor clicks **Call next** | `http://localhost:3000/display/queue/demo` (public, no login — a physical waiting-room TV) | Token number announced, **no patient name or clinical data**, ever |
| Pharmacist dispenses | Doctor's Consultation screen for that patient, already open | Prescription line's dispensed count updates live |
| Lab tech finalizes a report | Same consultation screen | Lab order shows RESULTED + Print link live |
| Admin approves a Connection | Second admin tab on Connection Center | Status pill updates live |

The `/display/queue/<slug>` socket connection is a genuinely different,
weaker grant than a staff login — it's admitted by tenant *slug* only
(no session cookie) and joins **only** the `:display` room, which only
ever receives sanitized, no-PII payloads (`{tokenNumber, room}` — verified
by design, never a patient name).

---

## PART 20 — ALERTS / NOTIFICATIONS

**LOGIN:** any staff role · **UI:** the bell icon in the topbar (present
on every dashboard page) — two tabs, **Alerts** and **Activity**.

Alert categories that actually exist (`src/lib/alerts.js`) — each only
appears if it applies to the logged-in role/tenant, never an empty
section:

| Category | Gate | What it shows |
|---|---|---|
| Pharmacy | `PHARMACY` active + `stock:read` | Low-stock count + up to 5 items, expiring-soon count, expired count |
| Workflows | `workflow:read` (wildcard-only, HOSPITAL_ADMIN) | FAILED count + last 5, WAITING count |
| Radiology | `RADIOLOGY` active + `radiology:manage` | Pending (ORDERED+SCHEDULED) count + up to 5 |
| Leave Requests | HOSPITAL tenant + `staff:manage` | Pending count + oldest 5 |

**Manual test**: as Pharmacist, stock-in a batch with an expiry date next
week — the bell's Alerts tab should show it under "expiring soon" almost
immediately (debounced 400ms on the relevant realtime event, e.g.
`stock:updated`). As HOSPITAL_ADMIN, this is also the fastest way to spot
a FAILED workflow instance without going to the Workflows page directly.

---

## PART 21 — DASHBOARDS

**LOGIN → `/dashboard` (the Overview link, or just the post-login
redirect)** for every role below. Widgets come from
`src/lib/dashboard/registry.js`'s `visibleWidgets()` — role + module +
tenant-type filtered, same shape as the sidebar.

| Role | What they see |
|---|---|
| HOSPITAL_ADMIN | Today-at-a-glance KPIs, Patient Flow, Appointments, IPD, Pharmacy, Lab, Radiology, Billing, **Workflows** widget, Last-7-days chart, Recent Activity, Quick Actions |
| Doctor | KPIs, Patient Flow, Appointments, Recent Activity, Quick Actions (no Pharmacy/Lab/Billing widgets — not their module) |
| Receptionist | KPIs, Patient Flow, Appointments, Recent Activity, Quick Actions |
| Nurse | KPIs, Patient Flow, IPD, Recent Activity, Quick Actions |
| Pharmacist | KPIs, Pharmacy, Recent Activity, Quick Actions |
| Lab Tech | KPIs, Lab, Recent Activity, Quick Actions |
| Radiology Staff | KPIs, Radiology, Recent Activity, Quick Actions |
| Billing Staff | KPIs, Billing, Recent Activity, Quick Actions |
| Owner Doctor / Pharmacist / Lab Tech (solo) | KPIs, their own module widget, Last-7-days chart, Recent Activity, Quick Actions |
| SUPER_ADMIN | A separate platform-wide overview (`getPlatformOverview()`) — not the tenant widget grid at all |

**Where the numbers come from**: every widget is a real, live query
against the operational tables (`src/lib/dashboard/queries.js`) — **zero
`Math.random()`, zero hardcoded numbers**; a brand-new tenant genuinely
shows zeros. A widget that fails to load independently (e.g. a transient
remote-DB blip) shows a distinct "failed to load" card rather than
crashing the whole dashboard — worth testing by comparing what you see if
the DB is briefly slow.

---

## PART 22 — ANALYTICS

**Architecture to explain first:**
```
Operational tables (patients, visits, bills, lab_orders, ...)
        ↓  (a background job, every 5 minutes, mirrors the Outbox's own interval-loop pattern)
Daily rollup  →  analytics_daily_tenant (one wide row per tenant per day)
             →  analytics_daily_dimension (per-doctor/medicine/ward/provider breakdowns)
        ↓
Analytics API  (GET /api/analytics/<domain>?range=...)
        ↓
Dashboard  (/dashboard/analytics)
```

**LOGIN → MENU:** Operations → Analytics · **URL:** `/dashboard/analytics`
— domain tabs, a range picker (Today/Yesterday/7 days/30 days/90 days/12
months/Custom).

| Domain | Who sees it | Gate |
|---|---|---|
| Hospital Operations | everyone with `analytics:view` | core, no module needed |
| Clinical | Doctor, Pharmacist, Lab Tech, Radiology Staff, Billing Staff, Admin | `DOCTOR_OPD` active |
| Pharmacy | same roles | `PHARMACY` active |
| Lab | same roles | `LAB` active |
| Radiology | same roles | `RADIOLOGY` active |
| Billing / Finance | same roles | `BILLING` active |
| Staff / HR | same roles, HOSPITAL tenants only | — |
| Patient | same roles | core |
| **Platform** | **SUPER_ADMIN only** | separate action `analytics:platform`, a `PLATFORM_ONLY_ACTION` — HOSPITAL_ADMIN's wildcard does **not** reach this, by explicit, tested design |

**How data actually gets there**: the rollup only runs automatically every
5 minutes, or can be triggered on demand as SUPER_ADMIN:
```
curl -b <superadmin-cookie> -X POST http://localhost:3000/api/analytics/rollup/run -d '{}'
```
If you test a fresh action (e.g. a new lab result) and the Analytics
screen still shows zero, this is expected until the next rollup tick —
**not a bug**; trigger the endpoint above to see it immediately.

**Manual RBAC verification**: Doctor → `/api/analytics/clinical` → `200`;
Doctor → `/api/analytics/platform` → `403`; SUPER_ADMIN → `/api/analytics/platform`
→ `200`.

**Radiology Revenue report** (distinct from Analytics — Part 15's sibling
concept): Operations → Reports → **Radiology Revenue** tab
(`/dashboard/reports`, `reports:view`, BILLING module) — shows revenue by
study/service, sourced from real `bill_items`.

---

## PART 23 — EXTERNAL INTEGRATION

**Reminder, load-bearing for every test in this section: there is no real
vendor connected. `MOCK_LAB` and `MOCK_PHARMACY` are the only registered
provider codes.** Do not present anything here as a real integration.

**LOGIN:** `admin@demo.hms` · **MENU:** Administration → External
Integrations · **URL:** `/dashboard/admin/external` — 3 tabs: **Providers
/ Connections / Outbound Orders**.

**Confirmed by reading every Lab/Pharmacy/OPD screen: sending a lab order
or prescription item to an external provider has NO button anywhere in
the UI.** It exists only as a working, tested API endpoint. Use curl/
Postman for the "Send external" step below; everything downstream of that
(the provider admin UI, the webhook simulation) has real buttons.

━━━━━━━━━━━━━━━━━━━━━━
**FEATURE: External Lab — full MOCK flow**
━━━━━━━━━━━━━━━━━━━━━━
**LOGIN:** `admin@demo.hms` for all Admin steps.

1. **Register provider**: External Integrations → Providers tab → **+
   Register provider** → Type=Lab, Code=MOCK_LAB, Environment=Sandbox,
   name it → **Register**.
2. **Set credential**: click **Credential** on the new row → enter any
   secret (this doubles as the mock's webhook-signing key) → **Save**.
3. **Connect**: Connections tab → **+ Connect provider** → pick the
   Doctor/OPD source instance + this provider → **Request connection**
   → click **Approve** on the resulting PENDING row.
4. **Send a lab order** (API-only, no button — see reminder above):
   ```
   curl -b <admin-cookie> -X POST http://localhost:3000/api/lab/orders/<id>/send-external \
     -H "Content-Type: application/json" -d '{}'
   ```
   **EXPECTED:** `{"externalOrder":{"id":...,"status":"SENT","externalOrderRef":"MOCKLAB-XXXXXXXX"}}`.
5. **Simulate the provider's result webhook**: Providers tab → **Simulate
   webhook** on the same provider → paste the `externalOrderRef` from step
   4, optionally type findings → **Send simulated webhook**.
   **EXPECTED RESULT:** a real, signed HTTP call is made to Kaizen's own
   webhook endpoint (not a fake shortcut) — the response panel shows
   `{"ok":true}`.
6. **Verify the result actually landed**: open that lab order anywhere in
   the UI (Doctor's Consultation screen, or `/dashboard/lab` if still
   listed) — status is `RESULTED`, with the simulated findings, and a
   **Print report →** link works. This is the *exact same* internal
   `lab_orders` row and the *exact same* `lab:result` realtime event
   internal result-entry produces — Clinical/Billing/Patient
   Portal/Alerts/Analytics all pick it up with zero special-case code.
━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━
**FEATURE: External Pharmacy — full MOCK flow + stock isolation**
━━━━━━━━━━━━━━━━━━━━━━
Same shape as Lab, with `MOCK_PHARMACY` and
`POST /api/pharmacy/prescriptions/<visitOrX>/items/<itemId>/send-external`.
**Before** sending, record the Inventory tab's total quantity for that
medicine. After the simulated fulfillment webhook, **re-check Inventory —
the quantity must be byte-for-byte unchanged.** The prescription item's
status flips to `DISPENSED` via the exact same column internal FEFO
dispensing writes, but `pharmacy_stock`/`pharmacy_stock_movements` are
never touched by this path — this is the concrete, testable proof that
internal and external inventory are architecturally isolated, not just
documented as isolated.
━━━━━━━━━━━━━━━━━━━━━━

**Environment separation**: register a *second* MOCK_LAB provider with
Environment=Production instead of Sandbox for the same tenant —
**EXPECTED:** succeeds (separate row, separate credentials/health/order
history). Try registering a *third* MOCK_LAB under Sandbox again —
**EXPECTED:** a clean `409 provider_already_registered_for_this_environment`,
never a raw crash.

**Pause / Revoke blocking**: on an ACTIVE connection, click **Pause**,
then retry the send-external curl command from above — **EXPECTED:**
`409 connection_not_active`. **Revoke** it instead — **EXPECTED:** `409
connection_revoked`, and the connection can never be reactivated (a
genuine, documented, permanent limitation — see Part 27's "Genuine
limitations").

**Test Connection / Check Status**: on a provider row, **Test connection**
calls the mock's own connectivity check and updates its Health pill live;
on an outbound order row, **Check status** calls the mock's (honest,
webhook-only) status stub.

**Deterministic failure + retry (no code changes needed)**: Edit a
provider → tick **"Force outbound failure"** (MOCK-only — a real vendor's
config never has this option) → attempt a send → **EXPECTED:** `FAILED`
with a real error message. Untick it → click **Retry** on the failed
order (Outbound Orders tab) → **EXPECTED:** `SUCCESS`, `attempts: 2`, and
**exactly one** `external_orders` row throughout (no duplicate business
record was ever created).

**Webhook security** (needs curl — see `docs/REAL_PROVIDER_INTEGRATION.md`
for a ready-made signing script): a **duplicate** `providerEventId` →
`{"ok":true,"duplicate":true}`, never processed twice; a **bad signature**
→ `401 invalid_signature`; a **replayed/stale timestamp** → `401
timestamp_out_of_window`; a payload with a forged `tenantId`/other
forbidden field → `422 invalid_payload` (the tenant is *always* resolved
from the provider row in the URL, never the payload — this is
structurally impossible to bypass, not just filtered).

---

## PART 24 — CONNECTIONS + DATA CONTRACTS

**One real example from this codebase**, Doctor/OPD → Pharmacy:

- **Connection** = the *permission slip*: "OPD instance X may talk to
  Pharmacy instance Y," lifecycle PENDING→ACTIVE→PAUSED/REVOKED
  (`/dashboard/admin/module-connections`).
- **Data Contract** = the *shape* of what's allowed to cross that
  connection: `PRESCRIPTION_FULFILLMENT` declares exactly which fields
  (medicine name, dose, quantity, …) may pass, and explicitly lists what's
  **restricted** (diagnosis, medical history, private notes) — code-
  defined in `src/lib/dataContracts.js`, never editable by a tenant admin.
- **Event** = a durable fact that something happened — `PrescriptionCreated`,
  written to the Outbox in the same transaction as the prescription
  itself.
- **Workflow** = an observer that watches events/connections/contracts and
  tracks a checklist (`OPD_PHARMACY_BILLING`, Part 17) — it never performs
  the actual dispensing or billing itself, only records that it happened.
- **Realtime** = the same-instant UI push (`dispense:created`) that has
  nothing to do with any of the above — it would fire even with zero
  Connections/Contracts/Workflows configured at all.

**To see this live**: open `/dashboard/pharmacy/prescriptions/[id]/availability`
via the Consultation screen's "Check pharmacy availability" button (Part
11) — this is the one real, tested consumer of `checkContractAccess()` in
the whole product: pause the DOCTOR_OPD↔PHARMACY connection and watch the
availability panel start failing immediately, then resume it and watch it
work again.

---

## PART 25 — SECURITY TESTING

All of these are **read-only or already-reversible** checks — nothing
here should be destructive.

| Test | How | Expected |
|---|---|---|
| Unauthorized page | Incognito window → `/dashboard` | Redirect to `/login` |
| Unauthorized API | `curl` with no cookie to any `/api/*` route | `401` |
| Wrong role | Doctor → `/dashboard/admin/external` or its API | Redirect / `403` |
| Wrong tenant | Tenant 5 session → search for tenant 1's patient (Part 5) | Empty result, never a 403-that-leaks-existence |
| Paused connection | Part 23 | `409 connection_not_active` on a send |
| Revoked connection | Part 23 | `409 connection_revoked`, permanent |
| Invalid webhook signature | Part 23 | `401 invalid_signature` |
| Replayed webhook | Part 23 | `401 timestamp_out_of_window` |
| Duplicate webhook | Part 23 | `200 {"duplicate":true}`, processed once |
| Forged `tenantId` in a webhook payload | Part 23 | `422 invalid_payload`, `forbidden_field:tenantId` — tenant is never read from the payload at all |
| Forbidden payload fields | same | `422`, lists exactly which field(s) |
| Credential exposure | `GET /api/external/providers/[id]` as HOSPITAL_ADMIN | Response never contains the raw secret — only `hasCredential: true/false` |
| Platform-scope bypass | HOSPITAL_ADMIN → `/api/admin/tenants` | `403` — the specific 2026-09-15 fix; worth re-testing any time RBAC changes |

---

## PART 26 — DATABASE VERIFICATION

Exact table names from `prisma/schema.prisma`:

| Workflow | Tables that change |
|---|---|
| Patient registration | `patients`, `visits` |
| Consultation | `consultations` |
| Prescription | `prescriptions`, `prescription_items` |
| Dispensing | `prescription_items` (`dispensed_quantity`, `status`), `pharmacy_stock`, `pharmacy_stock_movements` |
| Lab order → result | `lab_orders`, `lab_order_items` (if a test is service-mapped) |
| Radiology order → report | `radiology_orders` |
| IPD admission → discharge | `admissions`, `beds`, `bed_transfers`, `nursing_notes` |
| Billing | `bills`, `bill_items`, `payments`, `discounts`, `refunds` |
| Appointments | `appointments`, `doctor_slots` |
| Staff / Attendance | `attendance_logs`, `attendance_breaks`, `staff_members`, `staff_profiles`, `duty_shifts`, `leave_requests` |
| Module platform | `module_instances`, `module_connections`, `module_connection_events` |
| External integration | `external_providers`, `external_credentials`, `external_connections`, `external_connection_events`, `external_identifiers`, `external_orders`, `webhook_events` |
| Workflow Engine | `workflow_instances`, `workflow_instance_steps` |
| Outbox | `outbox_events` |
| Analytics | `analytics_daily_tenant`, `analytics_daily_dimension`, `analytics_rollup_runs` |
| Pricing | `services`, `tariffs` |
| Master data | `departments` |

A quick way to check any of these without a GUI:
```
node -e "
const { prisma } = require('./src/lib/prismaClient');
(async () => {
  const rows = await prisma.<table_name>.findMany({ take: 5, orderBy: { id: 'desc' } });
  console.log(rows);
  process.exit(0);
})();
"
```
(`npx prisma studio` is this project's actual day-to-day DB GUI, per
`CLAUDE.md` — simpler than writing a script for a one-off look.)

---

## PART 27 — COMPLETE END-TO-END HOSPITAL TEST

Using only real accounts from Part 2, on Demo Hospital (tenant 1):

| # | Who | Where | Action | Verify |
|---|---|---|---|---|
| 1 | `reception@demo.hms` | `/dashboard/registration` | Register a new patient → **Register & add to queue** | Patient appears in Today's queue with a token |
| 2 | `reception@demo.hms` | `/dashboard/appointments` | (optional) book an appointment for a follow-up | Appears on the calendar |
| 3 | `doctor@demo.hms` | `/dashboard/opd` | **Call next** → click the patient | Consultation screen opens |
| 4 | `doctor@demo.hms` | consultation screen | Fill form → **Save consultation** | "Consultation recorded" |
| 5 | `doctor@demo.hms` | same screen | Add a medicine row → **Send to pharmacy** | Prescription listed, status PENDING |
| 6 | `doctor@demo.hms` | same screen | Add a test → **Send to lab** | Lab order listed, status ORDERED |
| 7 | `doctor@demo.hms` | same screen | Type a study name → **Order radiology** | Radiology order listed, status ORDERED |
| 8 | `pharmacist@demo.hms` | `/dashboard/pharmacy` | **Dispense** the prescribed line | `dispensed_quantity` increases; stock drops |
| 9 | `lab@demo.hms` | `/dashboard/lab` | Collect → Receive → Enter results → **Finalize report** | Status RESULTED, Print link works |
| 10 | (radiology staff, or `admin@demo.hms` as a stand-in — Part 2) | `/dashboard/radiology` | Schedule → Start → **Complete & submit report** | Status COMPLETED, findings/impression visible |
| 11 | `billing@demo.hms` | `/dashboard/billing` | Enter the visit id → **Create** | Bill aggregates consultation + dispensed items + lab + radiology |
| 12 | `billing@demo.hms` | bill detail | Price any ₹0 lines → **Record payment** | Status → PARTIALLY_PAID or PAID |
| 13 | (patient, if OTP email is configured) | `/patient/demo/login` | Log in, check tabs | Prescriptions/Lab Reports/Radiology Reports/Bills all show this visit's data |
| 14 | `admin@demo.hms` | `/dashboard/analytics` | Trigger a rollup (SUPER_ADMIN API) or wait 5 min | Clinical/Pharmacy/Lab/Radiology/Billing totals reflect today's activity |

**How to explain the whole thing to a non-technical person:** "Every step
here writes to the same Visit record from Part 7. The doctor doesn't
'send a message' to the pharmacy or the lab — they write an order, and
the pharmacy/lab staff see it appear in their own queue because they're
looking at the same underlying data, updated live. Nothing here is a
simulation or a mock, except the *external* lab/pharmacy vendor calls in
Part 23 — everything above uses this hospital's own real, internal
Pharmacy, Lab, and Radiology."

---

## PART 28 — FINAL TESTING CHECKLIST

```
[ ] Application health          — GET /api/health returns ok:true
[ ] Login (8 roles verified)    — Part 2/3
[ ] Logout
[ ] RBAC                        — Part 4
[ ] Tenant isolation            — Part 5 (tenant 1 vs tenant 5)
[ ] Patient                     — Part 7
[ ] Appointment                 — Part 8
[ ] OPD                         — Part 9
[ ] Prescription (no auto-deduct) — Part 10
[ ] Pharmacy (FEFO, stock-in, dispense) — Part 11
[ ] Lab                         — Part 12
[ ] Radiology                   — Part 13
[ ] IPD                         — Part 14
[ ] Billing                     — Part 15
[ ] HR / Staff / Attendance     — Part 16
[ ] Workflow                    — Part 17
[ ] Outbox                      — Part 18
[ ] Realtime                    — Part 19
[ ] Alerts                      — Part 20
[ ] Dashboards                  — Part 21
[ ] Analytics                   — Part 22
[ ] External Lab MOCK           — Part 23
[ ] External Pharmacy MOCK      — Part 23
[ ] Webhooks (sig/replay/dup)   — Part 23/25
[ ] Retry                       — Part 23
[ ] Security                    — Part 25
[ ] Patient Portal              — Part 7 (BLOCKED — email not configured)
[ ] End-to-end hospital workflow — Part 27
```

---

## 1. VERIFIED TEST ACCOUNTS

See Part 2's table — all 12 accounts, all confirmed by a real login
attempt on 2026-09-18, password `Passw0rd!` for every one.

## 2. COMPLETE FEATURE CHECKLIST

See Part 28 above.

## 3. COMPLETE ROLE/PERMISSION MATRIX

See Part 4's table (drawn directly from `src/lib/rbac.js`).

## 4. COMPLETE END-TO-END TEST

See Part 27.

## 5. FEATURES WITH NO TEST ACCOUNT

- **RADIOLOGY_STAFF** — no seed/live account exists anywhere (Part 2).
  Radiology itself was tested throughout this guide via HOSPITAL_ADMIN's
  wildcard as a stand-in; the role-specific RBAC gate (`radiology:manage`/
  `report`) has not been exercised against its own real login.

## 6. FEATURES THAT CANNOT BE VERIFIED FROM UI

- **Sending a lab order or prescription item to an external provider** —
  no button exists anywhere; API-only (`POST /api/lab/orders/[id]/send-external`,
  `POST /api/pharmacy/prescriptions/.../send-external`). See Part 23.
- **Patient Portal OTP login, end-to-end** — `EMAIL_USER`/`EMAIL_APP_PASSWORD`
  are not set in this environment's `.env`; request-otp will appear to
  succeed (by design, anti-enumeration) but no email is sent and no OTP is
  actually stored. See Part 7.
- **Outbox internals** (claim-locking, exact retry backoff timing) — no
  UI at all, `GET /api/outbox` is the only observability surface (Part 18).
- **Double-booking concurrency, exactly** — the UI can demonstrate the
  *rule* (a taken slot shows `slot_taken`) but genuinely simultaneous
  requests need a script/two terminals firing at once, as already done
  during original development (Part 8).

## 7. Genuine limitations (found while writing this guide, not assumed)

- A revoked External Connection's *exact* `(instance, provider, contract
  type)` triple can never be reconnected — the underlying unique
  constraint has no status dimension. A documented, pre-existing
  limitation, not something introduced by this audit.
- There is no self-service "create a new staff login" screen anywhere in
  the product — Staff Management's Directory tab manages profile data for
  *existing* users, not account creation. New logins are provisioned only
  by a direct database insert today (relevant for the RADIOLOGY_STAFF gap
  above).
- There is no "forgot password" flow for staff logins.
- Config fields on an External Provider (Real Vendor Integration Readiness
  work) can be overwritten but not individually cleared back to empty
  through the Edit modal's current merge behavior — a minor UX gap, not a
  correctness issue.
