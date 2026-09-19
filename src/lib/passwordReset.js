"use strict";

const crypto = require("crypto");
const { prisma } = require("./prismaClient");
const { hashPassword } = require("./auth");

const TTL_MS = 30 * 60_000;
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");

/** Issues a single-use token (only its hash is stored). Older unused tokens for the user are invalidated. */
async function issueResetToken(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.password_resets.updateMany({ where: { user_id: BigInt(userId), used_at: null }, data: { used_at: new Date() } });
  await prisma.password_resets.create({ data: { user_id: BigInt(userId), token_hash: sha(token), expires_at: new Date(Date.now() + TTL_MS) } });
  return token;
}

/** Returns true when the token was valid and the password was changed. */
async function consumeResetToken(token, newPassword) {
  const row = await prisma.password_resets.findUnique({ where: { token_hash: sha(String(token)) } });
  if (!row || row.used_at || row.expires_at < new Date()) return false;
  const hash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.users.update({ where: { id: row.user_id }, data: { password_hash: hash } }),
    prisma.password_resets.update({ where: { id: row.id }, data: { used_at: new Date() } }),
  ]);
  return true;
}

function tempPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

module.exports = { issueResetToken, consumeResetToken, tempPassword };
