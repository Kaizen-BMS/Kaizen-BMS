"use strict";

const { tenantDb } = require("./prismaClient");

/**
 * Every `patients` row at this tenant sharing the session's phone number —
 * the set of profiles a patient session can see/act as. More than one is
 * normal (family members sharing a household number, duplicate front-desk
 * registrations); the portal shows a profile picker when there's more than
 * one, never assumes uniqueness that was never enforced at registration.
 */
async function resolveOwnPatientIds(phone) {
  const rows = await tenantDb.patients.findMany({ where: { phone }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Never trust a bare client-supplied patientId — re-check it's actually one of this session's own profiles. */
async function ownsPatient(phone, patientId) {
  const row = await tenantDb.patients.findFirst({
    where: { id: BigInt(patientId), phone },
    select: { id: true },
  });
  return row ? row.id : null;
}

/**
 * The patient id filter for a read screen: a specific `?patientId=` if the
 * caller asked for one profile (re-verified against the session's own
 * phone, never trusted bare), else every profile the session owns.
 */
async function resolvePatientIdFilter(session, requestedPatientId) {
  if (requestedPatientId) {
    const id = await ownsPatient(session.phone, requestedPatientId);
    if (!id) return { error: "not_your_profile" };
    return { ids: [id] };
  }
  const ids = await resolveOwnPatientIds(session.phone);
  return { ids };
}

module.exports = { resolveOwnPatientIds, ownsPatient, resolvePatientIdFilter };
