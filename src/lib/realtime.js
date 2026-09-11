"use strict";

/**
 * Socket.io bridge. `server.js` calls `registerIo(io)` once; API route
 * handlers call `emitToTenant` / `emitToModule` immediately after their
 * DB write, in the same request cycle — no queue, no debounce.
 *
 * Payload convention: emit the changed record itself, e.g.
 *   emitToModule(tenantId, "pharmacy", "prescription:new", { prescription })
 * so the client updates local state from the payload without a refetch.
 */
const g = globalThis;

function registerIo(io) {
  g.__kaizenIo = io;
}

function getIo() {
  return g.__kaizenIo || null;
}

function emitToTenant(tenantId, event, payload) {
  const io = getIo();
  if (io) io.to(`tenant:${tenantId}`).emit(event, payload);
}

function emitToModule(tenantId, moduleKey, event, payload) {
  const io = getIo();
  if (io) {
    io.to(`tenant:${tenantId}:${String(moduleKey).toLowerCase()}`).emit(
      event,
      payload,
    );
  }
}

/**
 * The public, unauthenticated waiting-room display room. Only ever send
 * sanitized payloads here (e.g. a token number) — never patient names or
 * other clinical data; anyone with the tenant's slug can view this room.
 */
function emitToDisplay(tenantId, event, payload) {
  const io = getIo();
  if (io) io.to(`tenant:${tenantId}:display`).emit(event, payload);
}

module.exports = { registerIo, getIo, emitToTenant, emitToModule, emitToDisplay };
