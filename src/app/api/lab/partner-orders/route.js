import { apiRoute, json } from "@/lib/apiRoute";
import { listInbound } from "@/lib/partners";

export const dynamic = "force-dynamic";

// Lab orders other facilities sent to THIS lab through an approved connection.
export const GET = apiRoute("lab:read", async (request, { session }) => {
  const rows = (await listInbound(session)).filter((o) => o.orderType === "LAB_ORDER");
  return json({
    orders: rows.map((o) => ({
      id: o.id,
      from: o.from,
      status: o.status,
      connectionStatus: o.connectionStatus,
      patientName: o.payload.patientName || null,
      patientAge: o.payload.patientAge ?? null,
      testName: o.payload.testName || null,
      priority: o.payload.priority || null,
      receivedAt: o.receivedAt,
      result: o.result,
    })),
  });
});
