// One vocabulary for a prescription's progress, shared by the doctor's screen and the pharmacy queue.
// Stored statuses stay PENDING / PARTIALLY_FULFILLED / FULFILLED / CANCELLED (every report and workflow
// reads those); these are only the words people see.
export const RX_STATUS_LABEL = {
  PENDING: "Ready to dispense",
  PARTIALLY_FULFILLED: "Partially dispensed",
  FULFILLED: "Dispensed",
  NOT_REQUIRED: "Not required",
  CANCELLED: "Cancelled",
};

export const RX_STATUS_TONE = {
  PENDING: "bg-sky-100 text-sky-700",
  PARTIALLY_FULFILLED: "bg-amber-100 text-amber-700",
  FULFILLED: "bg-emerald-100 text-emerald-700",
  NOT_REQUIRED: "bg-slate-100 text-slate-500",
  CANCELLED: "bg-red-100 text-red-700",
};

/** The doctor's side of the same status: nothing has reached the patient yet. */
export const rxStatusForDoctor = (s) => (s === "PENDING" ? "Prescribed — with pharmacy" : RX_STATUS_LABEL[s] || s);
