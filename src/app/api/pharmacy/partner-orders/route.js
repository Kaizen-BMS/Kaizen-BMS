import { apiRoute, json } from "@/lib/apiRoute";
import { listPartnerOrders } from "@/lib/partnerDispense";

export const dynamic = "force-dynamic";

// Prescriptions other hospitals sent to THIS pharmacy through an approved connection.
export const GET = apiRoute("dispense:read", async (request, { session }) => json({ orders: await listPartnerOrders(session) }));
