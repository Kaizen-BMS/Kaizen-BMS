import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";
import { NOTIFICATION_CATEGORIES } from "@/lib/notificationCategories";

export const dynamic = "force-dynamic";

const schema = z.object({
  // { [categoryKey]: boolean } — only known category keys are ever stored;
  // an unknown key sent by a stale client is silently dropped, never saved.
  prefs: z.record(z.string(), z.boolean()),
});

// Every signed-in person manages their OWN toast/notification categories —
// self-scoped by session.userId, no RBAC action needed. `users` is
// deliberately outside TENANT_SCOPED_MODELS (nullable tenant_id), so this
// uses the raw `prisma` client, filtered by the caller's own id only.
// `notification_prefs` is a MariaDB JSON column, which introspects as a
// plain `String? @db.LongText` in this project (same as every other JSON-
// shaped column here, e.g. patients.custom_fields/allergies) — so it's
// always JSON.stringify()'d on write and JSON.parse()'d on read, never
// passed as a raw object straight to Prisma.
export const GET = apiRoute(null, async (request, { session }) => {
  const user = await prisma.users.findUnique({
    where: { id: BigInt(session.userId) },
    select: { notification_prefs: true },
  });
  let prefs = {};
  if (typeof user?.notification_prefs === "string" && user.notification_prefs) {
    try { prefs = JSON.parse(user.notification_prefs); } catch { prefs = {}; }
  }
  return json({ prefs, categories: NOTIFICATION_CATEGORIES });
});

export const PATCH = apiRoute(null, async (request, { session }) => {
  const body = await parseBody(request, schema);
  const known = new Set(NOTIFICATION_CATEGORIES.map((c) => c.key));
  const clean = Object.fromEntries(Object.entries(body.prefs).filter(([k]) => known.has(k)));
  await prisma.users.update({
    where: { id: BigInt(session.userId) },
    data: { notification_prefs: JSON.stringify(clean) },
  });
  return json({ prefs: clean });
});
