"use strict";

const { cookies } = require("next/headers");
const { verifyPatientSession } = require("./patientAuth");
const { PATIENT_SESSION_COOKIE } = require("./patientAuthConstants");

/** The authoritative patient session for a request — always re-verified from
 * the signed cookie, same "never trust a header" discipline as getSession(). */
async function getPatientSession() {
  try {
    const c = await cookies();
    const token = c.get(PATIENT_SESSION_COOKIE)?.value;
    if (!token) return null;
    return await verifyPatientSession(token);
  } catch {
    return null;
  }
}

module.exports = { getPatientSession };
