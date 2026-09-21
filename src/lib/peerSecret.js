"use strict";

const crypto = require("crypto");

/** Signing secret for one partner provider's result webhook (both sides derive the same value). */
function peerWebhookSecret(providerId) {
  const base = process.env.JWT_SECRET;
  if (!base) throw new Error("JWT_SECRET is not set");
  return crypto.createHmac("sha256", base).update("kaizen-peer-webhook:" + String(providerId)).digest("hex");
}

const isPeerProvider = (code) => String(code || "").startsWith("PEER_");

module.exports = { peerWebhookSecret, isPeerProvider };
