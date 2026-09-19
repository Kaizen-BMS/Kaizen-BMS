import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { getConnection, transition } from "@/lib/partners";

export const dynamic = "force-dynamic";

export const GET = apiRoute("partner:manage", async (request, { session, params }) => {
  const { id } = await params;
  return json({ connection: await getConnection(session, id) });
});

const schema = z.object({ action: z.enum(["PAUSE", "RESUME", "REVOKE"]) });

export const PATCH = apiRoute("partner:manage", async (request, { session, params }) => {
  const { id } = await params;
  const body = await parseBody(request, schema);
  return json({ connection: await transition(session, id, body.action) });
});
