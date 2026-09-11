"use strict";

const SESSION_COOKIE = "kaizen_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8h working shift

// Headers the proxy sets from the *verified* token. Route handlers read these;
// clients cannot spoof them because the proxy overwrites whatever came in.
const CTX_HEADERS = {
  userId: "x-kaizen-user",
  tenantId: "x-kaizen-tenant",
  role: "x-kaizen-role",
};

module.exports = { SESSION_COOKIE, SESSION_TTL_SECONDS, CTX_HEADERS };
