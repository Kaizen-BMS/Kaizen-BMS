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
const { queryOne } = require("./src/lib/db");

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
        const tenant = await queryOne(
          "SELECT id FROM tenants WHERE slug = ? AND active = 1 LIMIT 1",
          [String(slug)],
        );
        if (tenant) {
          socket.data.display = { tenantId: tenant.id };
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

  httpServer.listen(port, () => {
    console.log(
      `> kaizenbms ready on http://localhost:${port} (${dev ? "development" : process.env.NODE_ENV})`,
    );
  });
});
