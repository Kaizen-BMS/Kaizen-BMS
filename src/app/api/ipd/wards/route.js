import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Ward Master (see CLAUDE.md "Configurable wards") — a hospital defines its
// own wards by floor instead of the old fixed GENERAL/PRIVATE/ICU set.
export const GET = apiRoute("ward:read", async (request) => {
  const includeInactive = new URL(request.url).searchParams.get("all") === "1";
  const wards = await tenantDb.wards.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: [{ display_order: "asc" }, { id: "asc" }],
  });
  return json({ wards });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  floor: z.string().trim().max(50).optional().or(z.literal("")),
});

function slugify(name) {
  return (
    name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 25) || "WARD"
  );
}

export const POST = apiRoute("ward:manage", async (request, { session }) => {
  const body = await parseBody(request, createSchema);

  const existingCodes = new Set((await tenantDb.wards.findMany({ select: { code: true } })).map((w) => w.code));
  const base = slugify(body.name);
  let code = base;
  let n = 2;
  while (existingCodes.has(code)) code = `${base}_${n++}`;

  const maxOrder = await tenantDb.wards.aggregate({ _max: { display_order: true } });

  const ward = await tenantDb.wards.create({
    data: {
      code,
      name: body.name,
      floor: body.floor || null,
      display_order: (maxOrder._max.display_order || 0) + 1,
    },
  });
  emitToModule(session.tenantId, "IPD", "ward:updated", { ward });
  return json({ ward }, 201);
});
