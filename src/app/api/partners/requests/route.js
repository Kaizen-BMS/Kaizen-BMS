import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { requestConnection } from "@/lib/partners";

export const dynamic = "force-dynamic";

const schema = z.object({
  code: z.string().trim().min(3).max(40),
  serviceType: z.enum(["LAB", "PHARMACY"]),
  purpose: z.string().trim().max(255).optional(),
  categories: z.array(z.string()).max(20),
});

// Sends a connection REQUEST — it can never activate anything on its own;
// only the receiving organization's acceptance does.
export const POST = apiRoute("partner:manage", async (request, { session }) => {
  const body = await parseBody(request, schema);
  return json({ connection: await requestConnection(session, body) }, 201);
});
