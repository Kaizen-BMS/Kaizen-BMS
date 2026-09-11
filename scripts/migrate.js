/**
 * Applies every not-yet-applied migrations/*.sql file to the database,
 * backing the whole database up first (see scripts/dbApplyGuard.js). This
 * project has ONE database and it is effectively production — there is no
 * separate copy to rehearse against, which is exactly why the backup step
 * is not optional by default. See CLAUDE.md "Database rule".
 *
 * Usage:
 *   npm run db:migrate                 (backup, then apply pending files)
 *   npm run db:migrate -- --skip-backup  (apply without backing up first —
 *                                          only for a change you've been
 *                                          told explicitly to skip it for)
 */
"use strict";

require("./loadEnv");
const { applyPendingMigrations } = require("./dbApplyGuard");

const skipBackup = process.argv.includes("--skip-backup");

applyPendingMigrations({ skipBackup })
  .then(({ applied }) => {
    if (applied.length > 0) {
      console.log(`\nDone — applied ${applied.length} migration(s):`);
      for (const { file, backupPath } of applied) {
        console.log(`  ${file}${backupPath ? `  (backup: ${backupPath})` : ""}`);
      }
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n[db:migrate] FAILED:", err.message || err);
    console.error("No further migration files were applied after this failure.");
    process.exit(1);
  });
