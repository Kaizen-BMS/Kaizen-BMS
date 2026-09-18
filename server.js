/**
 * Custom server: one persistent Node process running Next.js + Socket.io.
 * Every real-time event in the app is emitted from an API route in the same
 * process, so there is never a poll / debounce / background-job hop.
 */
require("./scripts/loadEnv");

const { createServer } = require("http");
const next = require("next");
const { Server } = require("socket.io");
const { verifySession } = require("./src/lib/auth");
const { SESSION_COOKIE } = require("./src/lib/authConstants");
const { getActiveModules, moduleRoomsForRole } = require("./src/lib/modules");
const { registerIo } = require("./src/lib/realtime");
const { prisma } = require("./src/lib/prismaClient");
const outboxProcessor = require("./src/lib/outboxProcessor");
const analyticsScheduler = require("./src/lib/analytics/scheduler");
// Side-effect require: registers Billing's IPD event listeners on the
// serverEvents bus once, for the lifetime of this process. See
// src/lib/billingEvents.js / CLAUDE.md "Billing module".
require("./src/lib/billingEvents");
// Side-effect require: registers the Outbox's observability-only
// consumers once, for the lifetime of this process. See
// src/lib/outboxConsumers.js / CLAUDE.md "Outbox — durable domain events".
// This is unrelated to Socket.io realtime above — a completely separate,
// asynchronous mechanism.
require("./src/lib/outboxConsumers");

function parseCookies(header) {
  const out = {};
  for (const part of (header || "").split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: false },
  });

  // Every staff socket is authenticated from the same signed session cookie
  // the HTTP side uses — no separate token, no client-supplied tenantId.
  //
  // The one deliberate exception: the public waiting-room display
  // (/display/queue/<slug>) has no login. A connection may instead present
  // `displayTenant=<slug>` and is granted read-only membership of that
  // tenant's `:display` room ONLY — never the full tenant room or any
  // module room, and the server only ever emits sanitized, no-PII payloads
  // there (see emitToDisplay in src/lib/realtime.js).
  io.use(async (socket, nextFn) => {
    try {
      const token = parseCookies(socket.handshake.headers.cookie)[SESSION_COOKIE];
      const session = token && (await verifySession(token));
      if (session) {
        socket.data.session = session;
        return nextFn();
      }

      const slug = socket.handshake.query?.displayTenant;
      if (slug) {
        const tenant = await prisma.tenants.findFirst({
          where: { slug: String(slug), active: true },
          select: { id: true },
        });
        if (tenant) {
          socket.data.display = { tenantId: Number(tenant.id) };
          return nextFn();
        }
      }
      return nextFn(new Error("unauthorized"));
    } catch {
      nextFn(new Error("unauthorized"));
    }
  });

  io.on("connection", async (socket) => {
    if (socket.data.display) {
      socket.join(`tenant:${socket.data.display.tenantId}:display`);
      return;
    }

    const { tenantId, role } = socket.data.session;
    if (tenantId == null) return; // SUPER_ADMIN — no tenant rooms

    // Tenant-wide board room, plus only the module sub-rooms this role is
    // allowed to work in (pharmacist -> pharmacy only, never lab, etc.).
    socket.join(`tenant:${tenantId}`);
    try {
      const active = await getActiveModules(tenantId);
      for (const key of moduleRoomsForRole(role, active)) {
        socket.join(`tenant:${tenantId}:${key}`);
      }
    } catch (err) {
      console.error("socket room join failed", err);
    }
  });

  registerIo(io);
  outboxProcessor.start();
  analyticsScheduler.start();
  // Side-effect require: registers every Workflow's realtime listeners +
  // Outbox consumer once, for the lifetime of this process. See
  // src/lib/workflows/index.js / CLAUDE.md "Workflow Automation". Loaded
  // here (after app.prepare(), not at the top of this file) because its
  // require chain reaches src/lib/apiRoute.js (for the HttpError class,
  // via moduleConnections.js/moduleInstances.js) which imports
  // "next/server" — that import throws ("AsyncLocalStorage accessed in
  // runtime where it is not available") if evaluated before Next's own
  // runtime has initialized. billingEvents.js/outboxConsumers.js above
  // never happened to reach apiRoute.js, so this ordering constraint never
  // surfaced before this phase.
  require("./src/lib/workflows");

  httpServer.listen(port, () => {
    console.log(
      `> kaizenbms ready on http://localhost:${port} (${dev ? "development" : process.env.NODE_ENV})`,
    );
  });

  // Graceful shutdown — stop claiming new outbox batches before the
  // process actually exits. Nothing else in this file has shutdown
  // handling yet; this is intentionally scoped to just the processor.
  for (const sig of ["SIGTERM", "SIGINT"]) {
    process.on(sig, () => {
      outboxProcessor.stop();
      analyticsScheduler.stop();
      httpServer.close(() => process.exit(0));
    });
  }
});
