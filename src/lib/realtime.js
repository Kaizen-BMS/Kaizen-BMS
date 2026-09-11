"use strict";

/**
 * Socket.io bridge. `server.js` calls `registerIo(io)` once; API route
 * handlers call `emitToTenant` / `emitToModule` immediately after their
 * DB write, in the same request cycle — no queue, no debounce.
 *
 * Payload convention: emit the changed record itself, e.g.
 *   emitToModule(tenantId, "pharmacy", "prescription:new", { prescription })
 * so the client updates local state from the payload without a refetch.
 *
 * `serverEvents` is a SEPARATE, in-process-only bus (not Socket.io, no
 * client ever sees it) that the same emit calls also publish to. It exists
 * so a module can react to another module's writes without reaching into
 * that module's code directly — Billing is the first consumer (see
 * src/lib/billingEvents.js): it subscribes to dispense:created /
 * lab:result to append line items to an open IPD running bill. Every
 * `emitTo*` call fires its server-event synchronously, in the same
 * AsyncLocalStorage tenant context as the write that triggered it — a
 * listener registered here must still be `async` and itself `await` any
 * Prisma call it makes (see prismaClient.js's context-propagation note);
 * that rule is about the direct awaiting function, not about who called it,
 * so a listener invoked this way (not awaited by the emitter) is exactly as
 * safe as ordinary route code, and this was verified empirically before
 * anything was built on top of it.
 */
const { EventEmitter } = require("events");

const g = globalThis;

function registerIo(io) {
  g.__kaizenIo = io;
}

function getIo() {
  return g.__kaizenIo || null;
}

const serverEvents = g.__kaizenServerEvents || new EventEmitter();
serverEvents.setMaxListeners(50);
if (process.env.NODE_ENV !== "production") g.__kaizenServerEvents = serverEvents;

function emitToTenant(tenantId, event, payload) {
  const io = getIo();
  if (io) io.to(`tenant:${tenantId}`).emit(event, payload);
  serverEvents.emit(event, { tenantId, payload });
}

function emitToModule(tenantId, moduleKey, event, payload) {
  const io = getIo();
  if (io) {
    io.to(`tenant:${tenantId}:${String(moduleKey).toLowerCase()}`).emit(
      event,
      payload,
    );
  }
  serverEvents.emit(event, { tenantId, payload });
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

module.exports = { registerIo, getIo, emitToTenant, emitToModule, emitToDisplay, serverEvents };
