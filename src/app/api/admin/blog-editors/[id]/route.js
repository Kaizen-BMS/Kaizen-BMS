import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

// Suspend/reactivate a CONTENT_EDITOR login — never a hard delete. Their
// already-written posts keep showing "Written by <name>" even while their
// own login is disabled (same reasoning as every other suspend-not-delete
// pattern in this product: the account can block future logins — see
// apiRoute()'s `active === false` check — without erasing authorship
// history).
const updateSchema = z.object({ active: z.boolean() });

export const PATCH = apiRoute("blogeditor:manage", async (request, { params }) => {
  const { id } = await params;
  const body = await parseBody(request, updateSchema);

  const editor = await prisma.users.findFirst({ where: { id: BigInt(id), role: "CONTENT_EDITOR" } });
  if (!editor) throw new HttpError(404, "editor_not_found");

  const updated = await prisma.users.update({
    where: { id: editor.id },
    data: { active: body.active },
    select: { id: true, name: true, email: true, active: true },
  });
  return json({ editor: updated });
});
