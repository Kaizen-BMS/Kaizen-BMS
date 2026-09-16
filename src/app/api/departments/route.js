import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Department Master (Phase 8B — CLAUDE.md "Master data + data contract
// foundation" / docs/hms-master-data-phase8b.md). Deliberately minimal —
// code/name/active only, not referenced by any other table yet.
export const GET = apiRoute("department:read", async (request) => {
  const includeInactive = new URL(request.url).searchParams.get("all") === "1";
  const departments = await tenantDb.departments.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return json({ departments });
});

const createSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(191),
});

export const POST = apiRoute("department:manage", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  const existing = await tenantDb.departments.findFirst({ where: { code: body.code } });
  if (existing) throw new HttpError(409, "code_already_in_use");

  const department = await tenantDb.departments.create({
    data: {
      code: body.code,
      name: body.name,
      created_by: BigInt(session.userId),
      updated_by: BigInt(session.userId),
    },
  });
  emitToTenant(session.tenantId, "department:created", { department });
  return json({ department }, 201);
});
