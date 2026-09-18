import { NextResponse } from "next/server";
import net from "net";
import { prisma } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

/**
 * Deliberately public, unauthenticated diagnostic endpoint (see proxy.js's
 * PUBLIC_API set — same shape as /api/display/* being reachable with no
 * session). The whole point of this route is to answer "is the database
 * actually reachable" WITHOUT depending on the database — login itself
 * calls `prisma.users.findFirst()`, so during a real outage even
 * authenticating to ask this question would fail. No patient/tenant data,
 * no connection string, no stack trace is ever returned — only booleans,
 * latencies, and a short error code, the same generic-error discipline
 * this project already uses everywhere else (CLAUDE.md "no user
 * enumeration" / "generic error" conventions).
 *
 * Two independent checks, because they diagnose different failure modes:
 *   - `tcp`   — does a raw socket even connect to DB_HOST:DB_PORT? If this
 *               fails, it's a real network/firewall/outage problem.
 *   - `database` — does a real MySQL query succeed over that connection?
 *               TCP can succeed while this still fails (e.g. the remote
 *               MySQL process itself is hung/overloaded and never sends
 *               its handshake) — that distinction is exactly what matters
 *               for telling Hostinger support something more specific than
 *               "it doesn't work."
 */
function checkTcp(host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({ reachable: true, latencyMs: Date.now() - start, error: null }));
    socket.once("timeout", () => finish({ reachable: false, latencyMs: Date.now() - start, error: "timeout" }));
    socket.once("error", (err) => finish({ reachable: false, latencyMs: Date.now() - start, error: err.code || "connect_error" }));
    socket.connect(port, host);
  });
}

async function checkDatabase(timeoutMs = 6000) {
  const start = Date.now();
  try {
    await Promise.race([
      prisma.$queryRawUnsafe("SELECT 1"),
      new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error("query_timeout"), { code: "QUERY_TIMEOUT" })), timeoutMs)),
    ]);
    return { reachable: true, latencyMs: Date.now() - start, error: null };
  } catch (err) {
    return { reachable: false, latencyMs: Date.now() - start, error: err.code || err.errorCode || "P1001" };
  }
}

export async function GET() {
  const host = process.env.DB_HOST || "unknown";
  const port = Number(process.env.DB_PORT) || 3306;

  const [tcp, database] = await Promise.all([checkTcp(host, port), checkDatabase()]);
  const ok = tcp.reachable && database.reachable;

  return NextResponse.json(
    {
      ok,
      checkedAt: new Date().toISOString(),
      tcp: { host, port, ...tcp },
      database,
    },
    { status: ok ? 200 : 503 },
  );
}
