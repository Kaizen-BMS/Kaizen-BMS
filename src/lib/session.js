"use strict";

const { cookies } = require("next/headers");
const { verifySession } = require("./auth");
const { SESSION_COOKIE } = require("./authConstants");

/**
 * The authoritative session for a request: always derived by verifying the
 * signed JWT in the session cookie. We deliberately do NOT trust the
 * `x-kaizen-*` request headers here — even though proxy.js strips and
 * re-sets them, a route must stay safe if it is ever reached without the
 * proxy (misconfigured matcher, direct internal call, future refactor).
 * jwt.verify is cheap, so there is no reason to shortcut it.
 */
async function getSession() {
  try {
    const c = await cookies();
    const token = c.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    return await verifySession(token);
  } catch {
    return null;
  }
}

module.exports = { getSession };
