"use strict";

/**
 * Activity log: one row for every successful change anyone makes (create /
 * update / delete anywhere in the system), written automatically by
 * apiRoute — hospital, pharmacy, lab, billing, everything. Only WHO / WHAT /
 * WHEN is kept. Request bodies are never stored (no patient data in the log).
 */
const { prisma } = require("./prismaClient");

const RULES = [
  [/^\/api\/registration\/patients$/, "POST", "Registered a patient", "registration"],
  [/^\/api\/registration\/patients\/\d+\/insurance$/, "PUT", "Updated a patient's insurance / payment details", "registration"],
  [/^\/api\/registration\/patients\/\d+$/, "PATCH", "Updated patient details", "registration"],
  [/^\/api\/registration\/visits$/, "POST", "Opened a new visit", "registration"],
  [/^\/api\/registration\/referrals\/\d+\/accept$/, "POST", "Accepted a referred patient", "registration"],
  [/^\/api\/registration\/referrals\/\d+\/decline$/, "POST", "Declined a referred patient", "registration"],
  [/^\/api\/opd\/consultations$/, "POST", "Recorded a consultation", "opd"],
  [/^\/api\/opd\/consultations\/\d+\/prescriptions$/, "POST", "Wrote a prescription", "opd"],
  [/^\/api\/opd\/consultations\/\d+\/lab-orders$/, "POST", "Ordered lab tests", "opd"],
  [/^\/api\/opd\/consultations\/\d+\/radiology-orders$/, "POST", "Ordered a radiology study", "opd"],
  [/^\/api\/opd\/queue\/call-next$/, "POST", "Called the next patient", "opd"],
  [/^\/api\/pharmacy\/stock$/, "POST", "Added medicine to stock", "pharmacy"],
  [/^\/api\/pharmacy\/medicines$/, "POST", "Added a medicine to the master list", "pharmacy"],
  [/^\/api\/pharmacy\/medicines\/\d+$/, "PATCH", "Changed a medicine's details", "pharmacy"],
  [/^\/api\/pharmacy\/suppliers/, null, "Changed a supplier", "pharmacy"],
  [/^\/api\/pharmacy\/grn$/, "POST", "Received stock (GRN)", "pharmacy"],
  [/^\/api\/pharmacy\/stock\/transfer$/, "POST", "Transferred stock between pharmacies", "pharmacy"],
  [/^\/api\/pharmacy\/returns\/customer$/, "POST", "Recorded a customer return", "pharmacy"],
  [/^\/api\/pharmacy\/returns\/supplier$/, "POST", "Recorded a supplier return", "pharmacy"],
  [/^\/api\/pharmacy\/walk-in-sale$/, "POST", "Sold medicine over the counter", "pharmacy"],
  [/^\/api\/pharmacy\/dispense\/\d+$/, "POST", "Dispensed medicine", "pharmacy"],
  [/^\/api\/pharmacy\/partner-orders\/\d+\/dispense$/, "POST", "Dispensed a partner's prescription", "pharmacy"],
  [/^\/api\/pharmacy\/thresholds/, "PUT", "Changed a low-stock level", "pharmacy"],
  [/^\/api\/pharmacy\/stock\/\d+\/adjust$/, "POST", "Adjusted stock", "pharmacy"],
  [/^\/api\/lab\/walk-in$/, "POST", "Created a walk-in lab order and bill", "lab"],
  [/^\/api\/lab\/tests/, null, "Changed the lab test list / prices", "lab"],
  [/^\/api\/me\/photo$/, "PUT", "Changed their own profile photo", "staff"],
  [/^\/api\/lab\/orders\/\d+\/result$/, "POST", "Entered a lab result", "lab"],
  [/^\/api\/lab\/orders\/\d+\/collect$/, "POST", "Marked a sample collected", "lab"],
  [/^\/api\/lab\/orders\/\d+\/receive$/, "POST", "Marked a sample received", "lab"],
  [/^\/api\/lab\/partner-orders\/\d+\/result$/, "POST", "Sent a lab result to a partner", "lab"],
  [/^\/api\/billing\/opd$/, "POST", "Created an OPD bill", "billing"],
  [/^\/api\/billing\/walk-in$/, "POST", "Created a walk-in bill", "billing"],
  [/^\/api\/billing\/consult-fee$/, "POST", "Collected a consultation fee", "billing"],
  [/^\/api\/billing\/\d+\/payments$/, "POST", "Recorded a payment", "billing"],
  [/^\/api\/billing\/\d+\/discounts$/, "POST", "Gave a discount", "billing"],
  [/^\/api\/billing\/\d+\/refunds$/, "POST", "Recorded a refund", "billing"],
  [/^\/api\/billing\/\d+\/items/, null, "Changed a bill item", "billing"],
  [/^\/api\/appointments$/, "POST", "Booked an appointment", "appointments"],
  [/^\/api\/appointments\/\d+$/, "PATCH", "Changed an appointment", "appointments"],
  [/^\/api\/appointments\/slots/, null, "Changed a doctor's availability", "appointments"],
  [/^\/api\/ipd\//, null, "Changed IPD / bed records", "ipd"],
  [/^\/api\/radiology\//, null, "Changed a radiology order", "radiology"],
  [/^\/api\/staff\/accounts\/\d+\/access$/, "PATCH", "Changed what a person can access", "staff"],
  [/^\/api\/staff\/accounts\/\d+$/, "PATCH", "Switched a login on / off", "staff"],
  [/^\/api\/staff\/accounts$/, "POST", "Created a login", "staff"],
  [/^\/api\/admin\/users\/\d+\/reset-password$/, "POST", "Reset a person's password", "staff"],
  [/^\/api\/staff\//, null, "Changed staff records", "staff"],
  [/^\/api\/attendance/, null, "Recorded attendance", "staff"],
  [/^\/api\/partners\/requests$/, "POST", "Sent a partner connection request", "partners"],
  [/^\/api\/partners\/connections\/\d+\/decision$/, "POST", "Answered a partner connection request", "partners"],
  [/^\/api\/partners\/connections\/\d+\/share-stock$/, "POST", "Changed stock sharing with a partner", "partners"],
  [/^\/api\/partners\/connections\/\d+$/, "PATCH", "Paused / resumed / disconnected a partner", "partners"],
  [/^\/api\/partners\/direct-orders$/, "POST", "Sent a request to a partner", "partners"],
  [/^\/api\/lab\/orders\/\d+\/send-external$/, "POST", "Sent a lab order to a partner lab", "partners"],
  [/^\/api\/pharmacy\/prescriptions\/\d+\/items\/\d+\/send-external$/, "POST", "Sent a prescription to a partner pharmacy", "partners"],
  [/^\/api\/org\//, null, "Changed organization / facility settings", "admin"],
  [/^\/api\/admin\/settings$/, "PATCH", "Changed facility settings", "admin"],
  [/^\/api\/admin\/form-templates/, null, "Changed a form", "admin"],
  [/^\/api\/referral-sources/, null, "Changed referral sources", "admin"],
  [/^\/api\/branding/, null, "Changed print branding", "admin"],
  [/^\/api\/services|^\/api\/tariffs/, null, "Changed the price list", "billing"],
];

const VERB = { POST: "Added", PUT: "Updated", PATCH: "Updated", DELETE: "Removed" };

function describe(method, path) {
  for (const [re, m, text, feature] of RULES) {
    if (re.test(path) && (m === null || m === method)) return { summary: text, feature };
  }
  const parts = path.replace(/^\/api\//, "").split("/").filter((p) => !/^\d+$/.test(p));
  return { summary: `${VERB[method] || "Changed"} ${parts.join(" › ") || "record"}`.slice(0, 250), feature: parts[0] || null };
}

/** Fire-and-forget: never slows or breaks the request it records. */
function logActivity({ session, method, path, status, summary, feature }) {
  const d = summary ? { summary, feature: feature || null } : describe(method, path);
  return prisma.users
    .findUnique({ where: { id: BigInt(session.userId) }, select: { name: true } })
    .catch(() => null)
    .then((u) =>
      prisma.audit_logs.create({
        data: {
          tenant_id: session.tenantId != null ? BigInt(session.tenantId) : null,
          user_id: BigInt(session.userId),
          user_name: u?.name || null,
          user_role: session.role,
          method,
          path: path.slice(0, 255),
          feature: d.feature ? String(d.feature).slice(0, 30) : null,
          summary: d.summary.slice(0, 255),
          status_code: status,
        },
      }),
    )
    .catch((e) => console.error("activity log write failed:", e.message));
}

module.exports = { logActivity, describe };
