"use strict";

/**
 * Inbound webhook authentication — signature verification + replay-window
 * check. Uses the SAME per-provider secret stored in external_credentials
 * (an HMAC secret doubles as the "API key" for a provider whose adapter
 * signs its own webhooks — the mock adapters do this; a real provider's
 * own scheme would plug in here without changing anything downstream).
 */
const crypto = require("crypto");

const DEFAULT_REPLAY_WINDOW_SECONDS = 300;

/** Constant-time HMAC-SHA256 signature check — never a plain `===` string compare on secret material. */
function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const givenBuf = Buffer.from(String(signatureHeader), "hex");
  if (expectedBuf.length !== givenBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, givenBuf);
}

/** Rejects a webhook whose own claimed timestamp is too old (or from the future) — blocks a captured request being replayed later. */
function verifyTimestamp(timestampHeader, windowSeconds = DEFAULT_REPLAY_WINDOW_SECONDS) {
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts)) return false;
  const nowSeconds = Date.now() / 1000;
  return Math.abs(nowSeconds - ts) <= windowSeconds;
}

module.exports = { verifySignature, verifyTimestamp, DEFAULT_REPLAY_WINDOW_SECONDS };
