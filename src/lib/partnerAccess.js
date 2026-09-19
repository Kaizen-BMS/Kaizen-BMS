"use strict";

const { can } = require("./rbac");
const { HttpError } = require("./apiRoute");

/** Sending / viewing requests to partners: owners & admins, or the pharmacy / lab staff who work those queues. */
function requirePartnerWork(session) {
  if (!(can(session.role, "partner:manage") || can(session.role, "dispense:create") || can(session.role, "lab:result") || can(session.role, "visit:create"))) {
    throw new HttpError(403, "forbidden");
  }
}

module.exports = { requirePartnerWork };
