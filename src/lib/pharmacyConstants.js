"use strict";

// A batch within this many days (60) of its expiry date is flagged "expiring
// soon" on the inventory screen. A batch past its expiry date is flagged
// "expired" and FEFO dispensing skips it entirely — it stays visible
// (frozen) until staff write it off via a manual adjustment.
const EXPIRY_WARNING_DAYS = 60;

module.exports = { EXPIRY_WARNING_DAYS };
