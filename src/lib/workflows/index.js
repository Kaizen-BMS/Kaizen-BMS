"use strict";

/**
 * Side-effect module: requiring this once (from server.js, at process
 * start) registers every workflow's realtime listeners (serverEvents.on)
 * and Outbox consumer (registerConsumer) for the lifetime of the process —
 * same pattern as src/lib/billingEvents.js and src/lib/outboxConsumers.js.
 * Nothing here is called directly by API routes; see src/lib/workflows/engine.js
 * for the functions routes actually use (listInstances/getInstance/retryStep).
 */
require("./opdPharmacyBilling");
require("./labResultBilling");
require("./ipdAdmissionDischarge");
require("./radiologyOrderResult");

module.exports = {};
