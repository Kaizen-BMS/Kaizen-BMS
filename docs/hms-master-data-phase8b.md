# Kaizen HMS — Master Data Architecture (Phase 8B)

This document records which database model owns each master-data concept
in Kaizen HMS, so future modules integrate through references to these
models instead of duplicating them. It reflects what was **found by
inspecting the existing schema/code**, not a new design — Phase 8B added
exactly one new table (`departments`); every other entity below already
existed before this phase and is documented as-is.

Format per entity: owning module, existing model, primary identifier,
tenant scoping, which modules read it, whether references are read-only,
whether an Outbox event already carries a reference to it, and current
implementation status.

---

## 1. Patient

- **Owner:** Patient / Clinical foundation (core — not module-gated)
- **Model:** `patients`
- **Identifier:** `patients.id`
- **Tenant scoped:** Yes
- **Consumers:** Appointments, OPD/Clinical, IPD, Pharmacy, Lab, Billing,
  Patient Portal
- **Read-only reference:** Yes — every consumer stores `patient_id`, never
  a copy of name/age/etc. (the one narrow exception, `bills`/print views
  resolving a display name at read time, is a join, not a stored copy)
- **Events carrying this reference:** `AppointmentBooked`,
  `PrescriptionCreated`, `PaymentReceived` (Outbox, Phase 4) all carry
  `patientId`
- **Status:** Fully implemented since Step 1 of the original build order

## 2. Doctor / Staff

- **Owner:** Staff / Identity
- **Model:** `users` (role ∈ DOCTOR/NURSE/PHARMACIST/LAB_TECH/
  BILLING_STAFF/RECEPTIONIST/…) + `staff_profiles` (supplementary
  join-date/designation data, Staff Management phase)
- **Identifier:** `users.id`
- **Tenant scoped:** Yes (`users.tenant_id`, nullable only for
  `SUPER_ADMIN`)
- **Consumers:** OPD (`consultations.doctor_id`), IPD
  (`admissions.admitted_by`), Pharmacy (`pharmacy_stock_movements.
  performed_by`), Lab (`lab_orders.ordered_by`/`resulted_by`), Billing
  (`bills.created_by`), Appointments (`doctor_slots.doctor_user_id`)
- **Read-only reference:** Yes
- **Events:** No dedicated Outbox event for staff actions yet; staff ids
  ride along inside the 3 existing events (e.g. `PrescriptionCreated.
  createdBy`)
- **Status:** Fully implemented

## 3. Department

- **Owner:** Hospital Administration / Organization
- **Model:** `departments` (**new this phase**, migration 030)
- **Identifier:** `departments.id`
- **Tenant scoped:** Yes
- **Consumers:** None yet — **deliberately not wired into any other
  table this phase** (no `department_id` added to `services`/
  `staff_profiles`/`beds`). This phase establishes the master table only;
  a future phase adds the FK once a real cross-cutting need exists
  (department-based staff assignment, department-based reporting), per
  the explicit "do not multiply database entities" instruction.
- **Read-only reference:** N/A yet (nothing references it)
- **Events:** None
- **Status:** New master table, minimal CRUD only (code/name/active)

## 4. Service (and Tariff)

- **Owner:** Billing / Pricing foundation
- **Model:** `services` (catalog) + `tariffs` (versioned price + tax)
- **Identifier:** `services.id` (`tariffs.id` for a specific price version)
- **Tenant scoped:** Yes
- **Consumers:** OPD (`consultations.service_id`), Pharmacy
  (`prescription_items.service_id`), Lab (`lab_order_items.service_id`),
  IPD (`beds.service_id`), Billing (`bill_items.service_id`/`tariff_id`)
- **Read-only reference:** Yes, **with one deliberate, documented
  exception**: `bill_items` snapshots the tariff's price/tax fields at
  billing time (`unit_price`, `taxable_amount`, `tax_rate`, CGST/SGST/
  IGST amounts) so a later tariff change never alters a historical bill —
  this is the one place "reference, don't duplicate" is intentionally
  overridden, and it predates this phase (Phase 6/7).
- **Events:** None dedicated; a tariff's own version history
  (`superseded_by_tariff_id` chain) is its audit trail
- **Status:** Fully implemented (Phase 6 Service/Tariff Master, Phase 7
  billing integration)

## 5. Medicine / Product (Pharmacy)

- **Owner:** Pharmacy
- **Model:** reuses `services` (`service_type = 'PHARMACY'`) as the
  optional catalogued/priced identity, alongside `pharmacy_stock.
  medicine_name` (freeform text) as the actual inventory/batch identity
  FEFO dispensing has always matched on
- **Identifier:** `services.id` when catalogued; `pharmacy_stock.
  medicine_name` for stock/dispensing (unchanged, never touched by any
  master-data work)
- **Tenant scoped:** Yes
- **Consumers:** `prescription_items.service_id` (optional link, set at
  prescribing time), Billing (via the same field, at checkout)
- **Read-only reference:** Yes
- **Events:** `PrescriptionCreated` carries `prescriptionId`/`itemCount`
  only — no medicine identity duplicated into the event payload
- **Status:** No new "Medicine Master" table — this phase confirmed
  Phase 7 already built the reusable identity (an explicit,
  never-fuzzy-matched `service_id` link), which is genuinely sufficient;
  building a second, parallel product table would have duplicated it

## 6. Lab Test

- **Owner:** Laboratory
- **Model:** reuses `services` (`service_type = 'LAB'`) for the
  catalogued/priced test identity, plus `lab_order_items` (Phase 7 — one
  row per test explicitly mapped to a Service at order time) and
  `lab_orders.tests` (freeform JSON array, unchanged legacy display —
  every pre-Phase-7 order has zero `lab_order_items` rows and keeps
  working exactly as before)
- **Identifier:** `services.id` when mapped
- **Tenant scoped:** Yes
- **Consumers:** Billing (via `lab_order_items.service_id`)
- **Read-only reference:** Yes
- **Events:** None dedicated
- **Status:** No new "Lab Test Master" table — same reasoning as
  Medicine/Product above; `services` + `lab_order_items` already is a
  future-safe, explicit-mapping design that never silently reinterprets
  historical freeform test names

## 7. Appointment

- **Owner:** Appointments module
- **Model:** `appointments`
- **Identifier:** `appointments.id`
- **Tenant scoped:** Yes
- **Consumers:** OPD/Clinical (conceptually, via the
  `APPOINTMENT_TO_CONSULTATION` data contract — see the contract catalog
  doc below), Patient Portal
- **Read-only reference:** Yes
- **Events:** `AppointmentBooked` (Outbox, Phase 4)
- **Status:** Fully implemented

## 8. Visit

- **Owner:** Clinical / Registration
- **Model:** `visits`
- **Identifier:** `visits.id`
- **Tenant scoped:** Yes
- **Consumers:** Consultation, Prescription, Lab Order, Billing, IPD
  Admission — every one of these carries `visit_id`
- **Read-only reference:** Yes
- **Events:** No dedicated Outbox event for visit creation yet (visit ids
  ride along inside the 3 existing events where relevant, e.g.
  `AppointmentBooked` does not carry one since a booking precedes the
  visit; `PrescriptionCreated` does)
- **Status:** Fully implemented

## 9. Bill / Payment

- **Owner:** Billing
- **Model:** `bills` / `bill_items` / `payments` / `refunds` / `discounts`
- **Identifier:** `bills.id`, `payments.id`
- **Tenant scoped:** Yes (via `bills.tenant_id`; `bill_items`/`payments`/
  `refunds`/`discounts` are scoped transitively — they carry no
  `tenant_id` column of their own, by design, same as documented in
  CLAUDE.md's Prisma section)
- **Consumers:** Reports (`src/lib/reports.js`), Dashboard
- **Read-only reference:** Mostly — see Service/Tariff above for the one
  deliberate price-snapshot exception
- **Events:** `PaymentReceived` (Outbox, Phase 4)
- **Status:** Fully implemented

---

## What this phase did NOT create

No duplicate master table was created for anything above — every gap this
phase actually filled was **Department**, the one entity with no existing
model at all. Patient, Doctor/Staff, Service, Medicine/Product and Lab
Test were all confirmed to already have a working, sufficient model
before writing any migration, per the explicit "reuse existing models
wherever possible" instruction.

See `CLAUDE.md`'s "Master data + data contract foundation" section for
the data-contract catalog these master-data entities feed into.
