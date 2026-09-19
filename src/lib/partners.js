"use strict";

/**
 * Partner organization connections — two-sided, consent-based.
 *
 *   requester facility ──request──▶ receiver facility
 *                       ◀─accept/reject (+ narrows the shared information)
 *
 * What this file adds on top of the existing external-integration
 * foundation is only what was missing: the RECEIVER's consent, per-category
 * approval, versioned consent, and a full audit trail. The actual data
 * exchange still runs through external_providers / external_connections /
 * external_orders / the signed webhook + Inbox — on ACCEPT the requester's
 * side of that machinery is provisioned automatically (a `PEER_*` provider,
 * a generated webhook secret, and an ACTIVE external_connection whose
 * allowed_fields are exactly the approved categories' fields).
 *
 * Every function takes explicit tenant/user ids from the VERIFIED session
 * and uses the raw `prisma` client with explicit filters — org_connections
 * spans two tenants by nature, so the single-tenant `tenantDb` scoping does
 * not apply; instead every read/write here first proves the caller's tenant
 * is one of the two parties.
 */
const crypto = require("crypto");
const { prisma } = require("./prismaClient");
const { HttpError } = require("./apiRoute");
const { runWithContext } = require("./requestContext");
const { emitToTenant } = require("./realtime");
const { setCredential, getWebhookSecret } = require("./externalCredentials");
const catalog = require("./partnerCatalog");

const OPEN_STATUSES = ["REQUESTED", "REVIEWING", "ACCEPTED", "ACTIVE", "PAUSED"];

function toId(v) {
  return typeof v === "bigint" ? v : BigInt(v);
}
function parseJson(v, fallback) {
  if (!v) return fallback;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

// ── lookup rate limit (guessing a public code is the only enumeration surface) ──
const lookups = new Map();
function lookupAllowed(tenantId) {
  const now = Date.now();
  const hits = (lookups.get(tenantId) || []).filter((t) => now - t < 10 * 60_000);
  if (hits.length >= 40) return false;
  hits.push(now);
  lookups.set(tenantId, hits);
  return true;
}

/** The facility's own working module instance a connection hangs off: clinical (OPD) for hospitals/clinics, else its pharmacy or lab. Any facility can connect — not only ones with a clinic. */
async function sourceInstanceFor(db, tenantId) {
  for (const m of ["DOCTOR_OPD", "PHARMACY", "LAB"]) {
    const i = await db.module_instances.findFirst({ where: { tenant_id: toId(tenantId), module_name: m, is_default: true, status: "ACTIVE" }, select: { id: true } });
    if (i) return i;
  }
  return null;
}

async function offersFor(tenantId) {
  const mods = await prisma.tenant_modules.findMany({
    where: { tenant_id: tenantId, is_active: true, module_name: { in: ["LAB", "PHARMACY", "DOCTOR_OPD"] } },
    select: { module_name: true },
  });
  // A clinic / hospital (OPD) can receive patient referrals.
  return mods.map((m) => (m.module_name === "DOCTOR_OPD" ? "REFERRAL" : m.module_name));
}

async function addEvent(db, connectionId, from, to, actor, note, snapshot) {
  return db.org_connection_events.create({
    data: {
      org_connection_id: connectionId,
      from_status: from,
      to_status: to,
      actor_user_id: actor?.userId != null ? toId(actor.userId) : null,
      actor_tenant_id: actor?.tenantId != null ? toId(actor.tenantId) : null,
      note: note ? String(note).slice(0, 500) : null,
      snapshot: snapshot ? JSON.stringify(snapshot) : null,
    },
  });
}

/** Minimal PUBLIC information about a facility, only when its code is entered exactly — nothing else about it is readable before consent. */
async function lookupByCode(session, rawCode) {
  if (!lookupAllowed(session.tenantId)) throw new HttpError(429, "too_many_lookups");
  const code = String(rawCode || "").trim().toUpperCase();
  if (!/^[A-Z]{3,12}-KZ-[A-Z0-9]{4}$/.test(code)) throw new HttpError(404, "partner_not_found");
  const t = await prisma.tenants.findUnique({
    where: { public_code: code },
    select: { id: true, name: true, type: true, active: true, owner_enabled: true, public_code: true },
  });
  if (!t || !t.active || !t.owner_enabled || Number(t.id) === Number(session.tenantId)) throw new HttpError(404, "partner_not_found");
  const offers = await offersFor(t.id);
  const existing = await prisma.org_connections.findFirst({
    where: { requester_tenant_id: toId(session.tenantId), receiver_tenant_id: t.id, status: { in: OPEN_STATUSES } },
    select: { status: true, service_type: true },
  });
  return {
    name: t.name,
    type: t.type,
    publicCode: t.public_code,
    offers,
    existing: existing ? { status: existing.status, serviceType: existing.service_type } : null,
  };
}

async function tenantsById(ids) {
  const rows = await prisma.tenants.findMany({
    where: { id: { in: [...new Set(ids.map(String))].map(BigInt) } },
    select: { id: true, name: true, type: true, public_code: true, organization_id: true },
  });
  return new Map(rows.map((r) => [String(r.id), r]));
}

function serialize(conn, viewerTenantId, tmap, events) {
  const outgoing = Number(conn.requester_tenant_id) === Number(viewerTenantId);
  const other = tmap.get(String(outgoing ? conn.receiver_tenant_id : conn.requester_tenant_id));
  const requested = parseJson(conn.requested_categories, []);
  const approved = conn.approved_categories ? parseJson(conn.approved_categories, []) : null;
  const svc = conn.service_type;
  return {
    id: Number(conn.id),
    direction: outgoing ? "OUTGOING" : "INCOMING",
    counterparty: other ? { name: other.name, type: other.type, publicCode: other.public_code } : null,
    serviceType: svc,
    serviceLabel: catalog.SERVICE_LABEL[svc],
    purpose: conn.purpose,
    status: conn.status,
    requestedCategories: requested,
    requestedInformation: catalog.labelsFor(requested),
    approvedCategories: approved,
    sharedInformation: approved ? catalog.labelsFor(approved) : [],
    modifiedByReceiver: !!conn.modified_by,
    contractVersions: parseJson(conn.contract_versions, null),
    providerId: outgoing && conn.requester_provider_id != null ? Number(conn.requester_provider_id) : null,
    shareStock: !!conn.share_stock,
    pausedByMe: conn.paused_by_tenant_id != null && Number(conn.paused_by_tenant_id) === Number(viewerTenantId),
    requestedAt: conn.requested_at,
    approvedAt: conn.approved_at,
    rejectedAt: conn.rejected_at,
    pausedAt: conn.paused_at,
    revokedAt: conn.revoked_at,
    ...(events ? { history: events } : {}),
  };
}

async function loadForParty(session, id) {
  if (!/^[0-9]{1,18}$/.test(String(id))) throw new HttpError(404, "connection_not_found");
  const conn = await prisma.org_connections.findUnique({ where: { id: toId(id) } });
  const me = Number(session.tenantId);
  // Not a party -> indistinguishable from "does not exist".
  if (!conn || (Number(conn.requester_tenant_id) !== me && Number(conn.receiver_tenant_id) !== me)) {
    throw new HttpError(404, "connection_not_found");
  }
  return conn;
}

function emitBoth(conn, event, payload) {
  emitToTenant(Number(conn.requester_tenant_id), event, payload);
  emitToTenant(Number(conn.receiver_tenant_id), event, payload);
}

async function requestConnection(session, { code, serviceType, purpose, categories }) {
  const me = toId(session.tenantId);
  const found = await lookupByCode(session, code);
  if (!catalog.isValidService(serviceType) || !found.offers.includes(serviceType)) throw new HttpError(422, "service_not_offered_by_partner");
  const cats = catalog.sanitizeCategories(serviceType, categories);
  const required = catalog.requiredCategories(serviceType);
  if (!required.every((c) => cats.includes(c))) throw new HttpError(422, "missing_required_information");

  if (!(await sourceInstanceFor(prisma, me))) throw new HttpError(409, "clinical_module_required");

  const receiver = await prisma.tenants.findUnique({ where: { public_code: found.publicCode }, select: { id: true } });
  let conn;
  try {
    conn = await prisma.$transaction(async (tx) => {
      const created = await tx.org_connections.create({
        data: {
          requester_tenant_id: me,
          receiver_tenant_id: receiver.id,
          service_type: serviceType,
          purpose: String(purpose || catalog.SERVICE_DEFAULT_PURPOSE[serviceType]).trim().slice(0, 255),
          status: "REQUESTED",
          requested_categories: JSON.stringify(cats),
          requested_by: toId(session.userId),
        },
      });
      await addEvent(tx, created.id, null, "REQUESTED", session, "Connection requested", { requestedCategories: cats });
      return created;
    });
  } catch (err) {
    if (err && err.code === "P2002") throw new HttpError(409, "connection_already_open");
    throw err;
  }
  const tmap = await tenantsById([conn.requester_tenant_id, conn.receiver_tenant_id]);
  emitToTenant(Number(conn.receiver_tenant_id), "partner:request", {
    id: Number(conn.id),
    requesterName: tmap.get(String(conn.requester_tenant_id))?.name,
    purpose: conn.purpose,
    serviceType,
  });
  emitToTenant(Number(conn.requester_tenant_id), "partner:updated", { id: Number(conn.id), status: conn.status });
  return serialize(conn, session.tenantId, tmap);
}

async function listConnections(session) {
  const me = toId(session.tenantId);
  const rows = await prisma.org_connections.findMany({
    where: { OR: [{ requester_tenant_id: me }, { receiver_tenant_id: me }] },
    orderBy: { id: "desc" },
  });
  const tmap = await tenantsById(rows.flatMap((r) => [r.requester_tenant_id, r.receiver_tenant_id]));
  return rows.map((r) => serialize(r, session.tenantId, tmap));
}

async function getConnection(session, id) {
  let conn = await loadForParty(session, id);
  const isReceiver = Number(conn.receiver_tenant_id) === Number(session.tenantId);
  if (isReceiver && conn.status === "REQUESTED") {
    conn = await prisma.$transaction(async (tx) => {
      const u = await tx.org_connections.update({ where: { id: conn.id }, data: { status: "REVIEWING" } });
      await addEvent(tx, conn.id, "REQUESTED", "REVIEWING", session, "Opened by receiver for review");
      return u;
    });
    emitToTenant(Number(conn.requester_tenant_id), "partner:updated", { id: Number(conn.id), status: "REVIEWING" });
  }
  const events = await prisma.org_connection_events.findMany({ where: { org_connection_id: conn.id }, orderBy: { id: "asc" } });
  const tmap = await tenantsById([conn.requester_tenant_id, conn.receiver_tenant_id, ...events.map((e) => e.actor_tenant_id).filter(Boolean)]);
  const history = events.map((e) => ({
    from: e.from_status,
    to: e.to_status,
    by: e.actor_tenant_id ? tmap.get(String(e.actor_tenant_id))?.name || null : null,
    note: e.note,
    at: e.created_at,
    snapshot: parseJson(e.snapshot, null),
  }));
  return serialize(conn, session.tenantId, tmap, history);
}

/** Provisions the requester's side of the EXISTING external-integration machinery for an accepted connection. */
async function provisionRequesterSide(tx, conn, receiverName, approvedFields, decidedBy) {
  const service = conn.service_type;
  const clinical = await sourceInstanceFor(tx, conn.requester_tenant_id);
  if (!clinical) throw new HttpError(409, "requester_clinical_module_not_active");
  const provider = await tx.external_providers.create({
    data: {
      tenant_id: conn.requester_tenant_id,
      provider_type: service,
      provider_code: `PEER_${service}:${conn.id}`,
      name: receiverName,
      environment: "PRODUCTION",
      active: true,
      capabilities: "[]",
      config: JSON.stringify({ peerConnectionId: Number(conn.id) }),
      created_by: conn.requested_by,
    },
  });
  // The signing secret the partner's result webhook is verified with —
  // generated here, encrypted at rest like every other credential, never
  // shown to either party.
  await setCredential(tx, {
    tenantId: conn.requester_tenant_id,
    providerId: provider.id,
    fields: { webhookSecret: crypto.randomBytes(32).toString("hex") },
    actorUserId: decidedBy,
  });
  const ext = await tx.external_connections.create({
    data: {
      tenant_id: conn.requester_tenant_id,
      source_instance_id: clinical.id,
      provider_id: provider.id,
      connection_type: catalog.SERVICE_CONTRACT[service],
      status: "ACTIVE",
      allowed_fields: JSON.stringify(approvedFields),
      permissions: JSON.stringify(["view", "create"]),
      created_by: conn.requested_by,
      approved_by: toId(decidedBy),
      approved_at: new Date(),
    },
  });
  await tx.external_connection_events.create({
    data: { connection_id: ext.id, from_status: null, to_status: "ACTIVE", actor_user_id: toId(decidedBy), note: "Partner connection accepted by the receiving organization" },
  });
  return { provider, ext };
}

async function decide(session, id, { decision, approvedCategories, note }) {
  const conn = await loadForParty(session, id);
  if (Number(conn.receiver_tenant_id) !== Number(session.tenantId)) throw new HttpError(403, "only_receiver_can_decide");
  if (!["REQUESTED", "REVIEWING"].includes(conn.status)) throw new HttpError(409, "not_awaiting_decision");

  // A requester must not approve their own request — unless both facilities
  // belong to the same organization (one owner legitimately running both).
  if (Number(conn.requested_by) === Number(session.userId)) {
    const tmap = await tenantsById([conn.requester_tenant_id, conn.receiver_tenant_id]);
    const a = tmap.get(String(conn.requester_tenant_id))?.organization_id;
    const b = tmap.get(String(conn.receiver_tenant_id))?.organization_id;
    if (a == null || b == null || String(a) !== String(b)) throw new HttpError(403, "cannot_approve_own_request");
  }

  const from = conn.status;
  if (decision === "REJECT") {
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.org_connections.update({
        where: { id: conn.id },
        data: { status: "REJECTED", rejected_at: new Date(), decided_by: toId(session.userId) },
      });
      await addEvent(tx, conn.id, from, "REJECTED", session, note || "Rejected by receiver");
      return u;
    });
    emitBoth(updated, "partner:updated", { id: Number(updated.id), status: "REJECTED" });
    return getConnection(session, id);
  }

  const requested = parseJson(conn.requested_categories, []);
  // Anything outside what was requested is refused outright (never silently dropped).
  if ((Array.isArray(approvedCategories) ? approvedCategories : []).some((c) => !requested.includes(c))) throw new HttpError(422, "cannot_approve_more_than_requested");
  const approved = catalog.sanitizeCategories(conn.service_type, approvedCategories);
  if (approved.length === 0) throw new HttpError(422, "approve_at_least_one");
  if (!approved.every((c) => requested.includes(c))) throw new HttpError(422, "cannot_approve_more_than_requested");
  const modified = approved.length !== requested.length;
  const fields = catalog.fieldsForCategories(conn.service_type, approved);
  const receiverName = (await prisma.tenants.findUnique({ where: { id: conn.receiver_tenant_id }, select: { name: true } })).name;
  const versions = { contract: catalog.SERVICE_CONTRACT[conn.service_type], version: catalog.currentContractVersion(conn.service_type) };

  const updated = await prisma.$transaction(async (tx) => {
    await tx.org_connections.update({
      where: { id: conn.id },
      data: {
        status: "ACCEPTED",
        approved_categories: JSON.stringify(approved),
        contract_versions: JSON.stringify(versions),
        decided_by: toId(session.userId),
        modified_by: modified ? toId(session.userId) : null,
        approved_at: new Date(),
      },
    });
    await addEvent(tx, conn.id, from, "ACCEPTED", session, modified ? "Accepted with a narrower set of shared information" : "Accepted as requested", {
      requestedCategories: requested,
      approvedCategories: approved,
      modified,
      contract: versions,
    });
    // Referrals need no external provider machinery — they are recorded directly.
    let linkData = {};
    if (conn.service_type !== "REFERRAL") {
      const { provider, ext } = await provisionRequesterSide(tx, conn, receiverName, fields, session.userId);
      linkData = { requester_provider_id: provider.id, requester_connection_id: ext.id };
    }
    const u = await tx.org_connections.update({
      where: { id: conn.id },
      data: { status: "ACTIVE", ...linkData },
    });
    await addEvent(tx, conn.id, "ACCEPTED", "ACTIVE", session, "Connection is active", { approvedCategories: approved });
    return u;
  });
  emitBoth(updated, "partner:updated", { id: Number(updated.id), status: "ACTIVE" });
  return getConnection(session, id);
}

/** PAUSE / RESUME / REVOKE (and the requester withdrawing a pending request). Mirrors onto the requester's external_connection so the existing send-time checks block too. */
async function transition(session, id, action) {
  const conn = await loadForParty(session, id);
  const me = Number(session.tenantId);
  const isRequester = Number(conn.requester_tenant_id) === me;
  let to;
  let data = {};
  if (action === "PAUSE") {
    if (conn.status !== "ACTIVE") throw new HttpError(409, "invalid_transition");
    to = "PAUSED";
    data = { paused_at: new Date(), paused_by_tenant_id: toId(me) };
  } else if (action === "RESUME") {
    if (conn.status !== "PAUSED") throw new HttpError(409, "invalid_transition");
    if (Number(conn.paused_by_tenant_id) !== me) throw new HttpError(403, "only_the_pausing_side_can_resume");
    to = "ACTIVE";
    data = { paused_at: null, paused_by_tenant_id: null };
  } else if (action === "REVOKE") {
    if (["ACTIVE", "PAUSED"].includes(conn.status)) {
      // either side may disconnect
    } else if (["REQUESTED", "REVIEWING"].includes(conn.status)) {
      if (!isRequester) throw new HttpError(403, "receiver_should_reject");
    } else {
      throw new HttpError(409, "invalid_transition");
    }
    to = "REVOKED";
    data = { revoked_at: new Date(), revoked_by: toId(session.userId) };
  } else {
    throw new HttpError(400, "invalid_action");
  }
  const from = conn.status;
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.org_connections.update({ where: { id: conn.id }, data: { status: to, ...data } });
    await addEvent(tx, conn.id, from, to, session, action === "REVOKE" && !["ACTIVE", "PAUSED"].includes(from) ? "Request withdrawn by requester" : `${action.toLowerCase()} by ${isRequester ? "requester" : "receiver"}`);
    if (conn.requester_connection_id) {
      await tx.external_connections.update({ where: { id: conn.requester_connection_id }, data: { status: to } });
      await tx.external_connection_events.create({
        data: { connection_id: conn.requester_connection_id, from_status: from === "PAUSED" ? "PAUSED" : "ACTIVE", to_status: to, actor_user_id: toId(session.userId), note: "Partner connection status changed" },
      });
      if (to === "REVOKED" && conn.requester_provider_id) {
        await tx.external_providers.update({ where: { id: conn.requester_provider_id }, data: { active: false } });
      }
    }
    return u;
  });
  emitBoth(updated, "partner:updated", { id: Number(updated.id), status: to });
  return getConnection(session, id);
}

/** True only while the partner connection is ACTIVE (used by the webhook framework for PEER_* providers). */
async function isPeerConnectionActive(connectionId) {
  const c = await prisma.org_connections.findUnique({ where: { id: toId(connectionId) }, select: { status: true } });
  return !!c && c.status === "ACTIVE";
}

/**
 * Delivers an order to the RECEIVER's inbox. Re-checks, independently of the
 * caller, that the connection is ACTIVE, the consent still matches the
 * current contract version, and that the payload carries ONLY approved
 * fields — a defense-in-depth backstop behind the send-time enforcement.
 */
async function deliverPeerOrder(connectionId, payload, { direct = false } = {}) {
  const conn = await prisma.org_connections.findUnique({ where: { id: toId(connectionId) } });
  if (!conn || conn.status !== "ACTIVE") throw new Error("connection_not_active");
  const versions = parseJson(conn.contract_versions, null);
  if (!versions || versions.version !== catalog.currentContractVersion(conn.service_type)) throw new Error("consent_outdated_reapproval_required");
  const approved = parseJson(conn.approved_categories, []);
  const allowed = new Set(catalog.fieldsForCategories(conn.service_type, approved));
  const sent = Object.keys(payload).filter((k) => payload[k] !== undefined);
  const extra = sent.filter((k) => !allowed.has(k));
  if (extra.length) throw new Error(`unapproved_fields:${extra.join(",")}`);

  const ref = `${direct ? "DIR" : "PEER"}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  await prisma.peer_inbound_orders.create({
    data: {
      tenant_id: conn.receiver_tenant_id,
      org_connection_id: conn.id,
      order_type: catalog.SERVICE_ORDER_TYPE[conn.service_type],
      external_order_ref: ref,
      payload: JSON.stringify(payload),
    },
  });
  emitToTenant(Number(conn.receiver_tenant_id), "partner:inbound", { connectionId: Number(conn.id), ref });
  return ref;
}

async function listInbound(session) {
  const rows = await prisma.peer_inbound_orders.findMany({
    where: { tenant_id: toId(session.tenantId) },
    orderBy: { id: "desc" },
    take: 100,
  });
  const conns = await prisma.org_connections.findMany({ where: { id: { in: rows.map((r) => r.org_connection_id) } } });
  const cmap = new Map(conns.map((c) => [String(c.id), c]));
  const tmap = await tenantsById(conns.map((c) => c.requester_tenant_id));
  return rows.map((r) => {
    const c = cmap.get(String(r.org_connection_id));
    return {
      id: Number(r.id),
      orderType: r.order_type,
      ref: r.external_order_ref,
      status: r.status,
      from: c ? tmap.get(String(c.requester_tenant_id))?.name : null,
      purpose: c?.purpose || null,
      connectionStatus: c?.status || null,
      payload: parseJson(r.payload, {}),
      result: parseJson(r.result_payload, null),
      receivedAt: r.received_at,
      completedAt: r.completed_at,
    };
  });
}

/** Receiver returns a result: a REAL signed webhook call into the requester's existing inbound pipeline (signature, replay window, Inbox idempotency, contract validation, business update, realtime). */
async function completeInbound(session, id, { findings, quantityFulfilled, amount, referral }, origin) {
  const money = amount != null && amount !== "" && Number.isFinite(Number(amount)) ? { amount: Number(amount) } : {};
  const order = await prisma.peer_inbound_orders.findFirst({ where: { id: toId(id), tenant_id: toId(session.tenantId) } });
  if (!order) throw new HttpError(404, "order_not_found");
  if (order.status !== "RECEIVED") throw new HttpError(409, "already_completed");
  const conn = await prisma.org_connections.findUnique({ where: { id: order.org_connection_id } });
  if (!conn || conn.status !== "ACTIVE") throw new HttpError(409, "connection_not_active");
  const requesterTenant = Number(conn.requester_tenant_id);

  // A "direct" order (facility-to-facility request, no internal record on the
  // sender's side to update) is just marked done with its result.
  if (String(order.external_order_ref).startsWith("DIR-")) {
    const result =
      conn.service_type === "REFERRAL"
        ? { ...referral }
        : conn.service_type === "LAB"
          ? { findings: String(findings || "Result reported.").slice(0, 2000), ...money }
          : { quantityFulfilled: quantityFulfilled != null ? Number(quantityFulfilled) : parseJson(order.payload, {}).quantity ?? null, ...money };
    await prisma.peer_inbound_orders.update({ where: { id: order.id }, data: { status: "COMPLETED", completed_at: new Date(), result_payload: JSON.stringify(result) } });
    emitToTenant(requesterTenant, "partner:updated", { id: Number(conn.id), status: conn.status });
    return { ok: true };
  }
  if (!conn.requester_provider_id) throw new HttpError(409, "connection_not_provisioned");

  const secret = await runWithContext({ tenantId: requesterTenant }, async () => {
    return await getWebhookSecret(requesterTenant, conn.requester_provider_id);
  });
  if (!secret) throw new HttpError(409, "no_webhook_secret");

  const payload = parseJson(order.payload, {});
  const body =
    conn.service_type === "LAB"
      ? { providerEventId: crypto.randomUUID(), externalOrderRef: order.external_order_ref, status: "COMPLETED", resultedAt: new Date().toISOString(), findings: String(findings || "Result reported.").slice(0, 2000) }
      : { providerEventId: crypto.randomUUID(), externalOrderRef: order.external_order_ref, status: "COMPLETED", quantityFulfilled: quantityFulfilled != null ? Number(quantityFulfilled) : payload.quantity ?? null };
  const raw = JSON.stringify(body);
  const signature = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const res = await fetch(`${origin}/api/webhooks/${conn.service_type.toLowerCase()}/${conn.requester_provider_id}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-signature": signature, "x-webhook-timestamp": String(Math.floor(Date.now() / 1000)) },
    body: raw,
  });
  if (!res.ok) throw new HttpError(502, "result_delivery_failed");

  await prisma.peer_inbound_orders.update({
    where: { id: order.id },
    data: { status: "COMPLETED", completed_at: new Date(), result_payload: JSON.stringify(conn.service_type === "LAB" ? { findings: body.findings, ...money } : { quantityFulfilled: body.quantityFulfilled, ...money }) },
  });
  emitToTenant(requesterTenant, "partner:updated", { id: Number(conn.id), status: conn.status });
  return { ok: true };
}

const DIRECT_FIELDS = {
  PHARMACY: ["medicineName", "quantity", "dosage", "patientName"],
  LAB: ["testName", "patientName", "patientAge", "priority"],
  REFERRAL: ["patientName", "patientAge", "patientGender", "patientPhone", "reason", "summary"],
};
const DIRECT_REQUIRED = { PHARMACY: "medicineName", LAB: "testName", REFERRAL: "patientName" };

/** A facility sends its own request to a connected partner (pharmacy→pharmacy, lab→lab, anyone→anyone that offers the service). Only approved information leaves. */
async function sendDirect(session, connectionId, input) {
  const conn = await loadForParty(session, connectionId);
  if (Number(conn.requester_tenant_id) !== Number(session.tenantId)) throw new HttpError(403, "only_requester_can_send");
  if (conn.status !== "ACTIVE") throw new HttpError(409, "connection_not_active");
  const svc = conn.service_type;
  const allowed = new Set(catalog.fieldsForCategories(svc, parseJson(conn.approved_categories, [])));
  const payload = {};
  for (const k of DIRECT_FIELDS[svc]) {
    if (input[k] === undefined || input[k] === null || input[k] === "") continue;
    if (allowed.has(k)) payload[k] = k === "quantity" || k === "patientAge" ? Number(input[k]) : String(input[k]).slice(0, 191);
  }
  if (!payload[DIRECT_REQUIRED[svc]]) throw new HttpError(403, "data_not_approved");
  if (svc === "PHARMACY" && !payload.quantity) throw new HttpError(422, "quantity_required");
  if (svc === "LAB") payload.priority = payload.priority || "ROUTINE";
  if (svc === "REFERRAL" && !payload.reason) throw new HttpError(403, "data_not_approved");
  return { ref: await deliverPeerOrder(conn.id, payload, { direct: true }) };
}

/** Requests THIS facility sent to partners, with their status/result. */
async function listOutbound(session) {
  const conns = await prisma.org_connections.findMany({ where: { requester_tenant_id: toId(session.tenantId) } });
  if (!conns.length) return [];
  const rows = await prisma.peer_inbound_orders.findMany({ where: { org_connection_id: { in: conns.map((c) => c.id) } }, orderBy: { id: "desc" }, take: 100 });
  const tmap = await tenantsById(conns.map((c) => c.receiver_tenant_id));
  const cmap = new Map(conns.map((c) => [String(c.id), c]));
  return rows.map((r) => {
    const c = cmap.get(String(r.org_connection_id));
    return {
      id: Number(r.id),
      to: tmap.get(String(c.receiver_tenant_id))?.name,
      serviceType: c.service_type,
      ref: r.external_order_ref,
      status: r.status,
      payload: parseJson(r.payload, {}),
      result: parseJson(r.result_payload, null),
      sentAt: r.received_at,
      completedAt: r.completed_at,
    };
  });
}

async function pendingIncoming(tenantId) {
  const rows = await prisma.org_connections.findMany({
    where: { receiver_tenant_id: toId(tenantId), status: { in: ["REQUESTED", "REVIEWING"] } },
    orderBy: { id: "asc" },
  });
  const tmap = await tenantsById(rows.flatMap((r) => [r.requester_tenant_id, r.receiver_tenant_id]));
  return rows.map((r) => serialize(r, tenantId, tmap));
}

module.exports = {
  lookupByCode,
  requestConnection,
  listConnections,
  getConnection,
  decide,
  transition,
  deliverPeerOrder,
  listInbound,
  completeInbound,
  pendingIncoming,
  sendDirect,
  listOutbound,
  isPeerConnectionActive,
};
