"use strict";

/**
 * Removes ONLY the records created by the owner-hierarchy / partner-consent
 * live tests (2026-09-19). Dry-run by default; nothing is deleted without
 * --execute. Every rule below is positive identification — never a broad
 * pattern — and prints exactly what it matched first.
 *
 *   node scripts/cleanupTestData.js            # dry run
 *   node scripts/cleanupTestData.js --execute  # delete (takes a backup first)
 *
 * Matched as test-created:
 *  - tenants named "TEST Combo …" with slug "t-…", created on/after SINCE
 *    (children go with them via ON DELETE CASCADE) and their organizations
 *    named "TEST Combo Group …" once empty;
 *  - lab orders on demo consultation 18 (tenant 1) created on/after SINCE
 *    whose tests are exactly CBC / Lipid profile / LFT (or start UITEST);
 *  - prescriptions on that consultation with notes "consent test"/"UITEST…";
 *  - partner connections (org_connections) where BOTH sides are dev/demo
 *    tenants (1,3,4,5 or a TEST Combo tenant) created on/after SINCE — the
 *    table did not exist before SINCE, so nothing older can match — plus the
 *    PEER_* provider/connection/order rows provisioned for them, and the
 *    external orders/ID mappings of the matched lab orders / prescriptions.
 * Never touched: any other tenant, patient, visit, consultation, real
 * provider (MOCK_* rows), or any record older than SINCE.
 */
const path = require("path");
require(path.join(__dirname, "..", "node_modules", "dotenv")).config({ path: path.join(__dirname, "..", ".env") });
const { prisma } = require("../src/lib/prismaClient");

const SINCE = process.env.CLEANUP_SINCE || "2026-09-19";
const DEMO_TENANTS = [1, 3, 4, 5];
const execute = process.argv.includes("--execute");
const num = (rows, k = "id") => rows.map((r) => Number(r[k]));
const inList = (ids) => (ids.length ? ids.join(",") : "NULL");
const q = (sql, ...p) => prisma.$queryRawUnsafe(sql, ...p);

async function main() {
  const combo = await q(`SELECT id FROM tenants WHERE name LIKE 'TEST Combo %' AND slug LIKE 't-%' AND created_at >= ?`, SINCE);
  const comboIds = num(combo);
  const orgs = await q(`SELECT id FROM organizations WHERE name LIKE 'TEST Combo %' AND created_at >= ?`, SINCE);
  const orgIds = num(orgs);

  const devTenants = [...DEMO_TENANTS, ...comboIds];
  const conns = await q(
    `SELECT id FROM org_connections WHERE requester_tenant_id IN (${inList(devTenants)}) AND receiver_tenant_id IN (${inList(devTenants)}) AND requested_at >= ?`,
    SINCE,
  );
  const connIds = num(conns);

  const labs = await q(
    `SELECT id FROM lab_orders WHERE tenant_id = 1 AND consultation_id = 18 AND created_at >= ?
       AND (tests IN ('["CBC"]','["Lipid profile"]','["LFT"]') OR tests LIKE '%UITEST%')`,
    SINCE,
  );
  const labIds = num(labs);
  const rxs = await q(
    `SELECT id FROM prescriptions WHERE tenant_id = 1 AND consultation_id = 18 AND created_at >= ? AND (notes = 'consent test' OR notes LIKE 'UITEST%')`,
    SINCE,
  );
  const rxIds = num(rxs);
  const items = rxIds.length ? num(await q(`SELECT id FROM prescription_items WHERE prescription_id IN (${inList(rxIds)})`)) : [];

  // Patients registered by the referral live test (name starts "UITEST ", demo tenants only).
  const uiPatients = num(await q(`SELECT id FROM patients WHERE tenant_id IN (${inList(DEMO_TENANTS)}) AND name LIKE 'UITEST %' AND created_at >= ?`, SINCE));

  // PEER_* providers belong to a matched connection (code is PEER_<SVC>:<connId>).
  const providers = await q(`SELECT id, provider_code FROM external_providers WHERE provider_code LIKE 'PEER\\_%'`);
  const peerProv = providers.filter((p) => connIds.includes(Number(String(p.provider_code).split(":")[1]))).map((p) => Number(p.id));

  const plan = [
    ["TEST Combo tenants (cascade their users/modules/instances)", comboIds.length],
    ["TEST Combo Group organizations", orgIds.length],
    ["partner connections (cascade events + inbound orders)", connIds.length],
    ["PEER_* providers", peerProv.length],
    ["test lab orders", labIds.length],
    ["test prescriptions", rxIds.length],
    ["UITEST patients (referral test)", uiPatients.length],
  ];
  console.log(execute ? "EXECUTE" : "DRY RUN", "— since", SINCE);
  plan.forEach(([n, c]) => console.log(`  ${String(c).padStart(3)}  ${n}`));
  console.log("  ids:", JSON.stringify({ comboIds, orgIds, connIds, peerProv, labIds, rxIds }));
  if (!execute) return console.log("\nNothing deleted. Re-run with --execute.");

  const { backupDatabase } = require("./dbApplyGuard");
  if (backupDatabase) await backupDatabase("before-test-cleanup");

  await prisma.$transaction(
    async (tx) => {
      const run = (sql) => tx.$executeRawUnsafe(sql);
      if (labIds.length) await run(`DELETE FROM workflow_instances WHERE reference_type='lab_order' AND reference_id IN (${inList(labIds)})`);
      if (rxIds.length) {
        await run(`DELETE FROM workflow_instances WHERE reference_type='prescription' AND reference_id IN (${inList(rxIds)})`);
        await run(`DELETE FROM outbox_events WHERE aggregate_type='Prescription' AND aggregate_id IN (${inList(rxIds)})`);
      }
      const eo = [];
      if (labIds.length) eo.push(`(internal_reference_type='lab_order' AND internal_reference_id IN (${inList(labIds)}))`);
      if (items.length) eo.push(`(internal_reference_type='prescription_item' AND internal_reference_id IN (${inList(items)}))`);
      if (peerProv.length) eo.push(`provider_id IN (${inList(peerProv)})`);
      if (eo.length) await run(`DELETE FROM external_orders WHERE ${eo.join(" OR ")}`);
      if (labIds.length) await run(`DELETE FROM external_identifiers WHERE entity_type='LAB_ORDER' AND internal_id IN (${inList(labIds)})`);
      if (items.length) await run(`DELETE FROM external_identifiers WHERE entity_type='PRESCRIPTION_ITEM' AND internal_id IN (${inList(items)})`);
      if (peerProv.length) {
        await run(`DELETE FROM external_connections WHERE provider_id IN (${inList(peerProv)})`);
        await run(`DELETE FROM external_providers WHERE id IN (${inList(peerProv)})`);
      }
      if (connIds.length) await run(`DELETE FROM org_connections WHERE id IN (${inList(connIds)})`);
      if (uiPatients.length) {
        await run(`DELETE FROM visits WHERE patient_id IN (${inList(uiPatients)})`);
        await run(`DELETE FROM patients WHERE id IN (${inList(uiPatients)})`);
      }
      if (labIds.length) await run(`DELETE FROM lab_orders WHERE id IN (${inList(labIds)})`);
      if (rxIds.length) await run(`DELETE FROM prescriptions WHERE id IN (${inList(rxIds)})`);
      if (comboIds.length) {
        // Clear the test tenants' own rows table by table first (some rows
        // RESTRICT-reference their users, so a plain cascade can trip over
        // ordering); retry until a pass makes no progress. Strictly scoped by
        // tenant_id IN (the TEST Combo tenants).
        const tables = (
          await tx.$queryRawUnsafe(
            "SELECT DISTINCT table_name AS t FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name = 'tenant_id' AND table_name NOT IN ('users','tenants')",
          )
        ).map((r) => r.t);
        for (let pass = 0; pass < 8; pass++) {
          let progressed = 0;
          for (const t of tables) {
            try {
              progressed += Number(await tx.$executeRawUnsafe(`DELETE FROM \`${t}\` WHERE tenant_id IN (${inList(comboIds)})`));
            } catch {
              /* RESTRICT ordering — retried on the next pass */
            }
          }
          if (progressed === 0) break;
        }
        await run(`DELETE FROM users WHERE tenant_id IN (${inList(comboIds)})`);
        await run(`DELETE FROM tenants WHERE id IN (${inList(comboIds)})`);
      }
      if (orgIds.length) await run(`DELETE FROM organizations WHERE id IN (${inList(orgIds)}) AND id NOT IN (SELECT organization_id FROM tenants WHERE organization_id IS NOT NULL)`);
    },
    { maxWait: 20000, timeout: 120000 },
  );
  console.log("\nDeleted. Re-run without --execute to confirm nothing matches.");
}

main()
  .catch((e) => {
    console.error("cleanup failed:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
