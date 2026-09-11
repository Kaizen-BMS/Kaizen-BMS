/**
 * There is exactly ONE database for this project — the production database
 * (no separate local/dev database exists). This project's owner has
 * explicitly authorized automatic schema-migration apply (see CLAUDE.md
 * "Database rule" — this supersedes the earlier manual-only policy dated
 * before 2026-09-11).
 *
 * What did NOT change: direct ad-hoc data edits outside normal app CRUD or
 * a proper migration file are still forbidden — this module only ever runs
 * the contents of a `migrations/NNN_*.sql` file, verbatim, never arbitrary
 * generated SQL. And every apply is preceded by an automatic full backup
 * unless the caller explicitly passes `skipBackup: true` for that one call.
 *
 * No `mysqldump`/`mysql` CLI binary is available on this machine, so the
 * backup uses the pure-JS `mysqldump` npm package (connects with the same
 * credentials as the app, no native dependency).
 *
 * Tracking: a `_kaizen_schema_migrations` table (created here if missing)
 * records which `migrations/*.sql` filenames have been applied, so this is
 * idempotent — re-running never re-applies a file. The very first run
 * baselines every migration file already present in the repo as "applied"
 * (they already are, by hand, on this same database — see CLAUDE.md /
 * memory) without re-executing them; only files added after that point are
 * actually run.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const MIGRATIONS_DIR = path.resolve(__dirname, "..", "migrations");
const BACKUPS_DIR = path.resolve(__dirname, "..", "backups");
const TRACKING_TABLE = "_kaizen_schema_migrations";

function connectionConfig() {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Full schema+data backup to backups/<timestamp>__<label>.sql via the
 * pure-JS `mysqldump` package. Returns the absolute file path.
 */
async function backupDatabase(label = "manual") {
  const mysqldump = require("mysqldump");
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const safeLabel = String(label).replace(/[^a-z0-9_.-]/gi, "_");
  const file = path.join(BACKUPS_DIR, `${timestamp()}__${safeLabel}.sql`);

  console.log(`[dbApplyGuard] Backing up ${process.env.DB_NAME} -> ${path.relative(process.cwd(), file)} ...`);
  await mysqldump({
    connection: connectionConfig(),
    dumpToFile: file,
  });
  const sizeKb = (fs.statSync(file).size / 1024).toFixed(1);
  console.log(`[dbApplyGuard] Backup complete (${sizeKb} KB).`);
  return file;
}

async function ensureMigrationsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS \`${TRACKING_TABLE}\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      baseline TINYINT(1) NOT NULL DEFAULT 0
    )
  `);
}

async function getAppliedFilenames(conn) {
  const [rows] = await conn.query(`SELECT filename FROM \`${TRACKING_TABLE}\``);
  return new Set(rows.map((r) => r.filename));
}

function allMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();
}

/**
 * First-ever run: the tracking table won't exist. Every migration file
 * already in the repo at that moment has already been applied by hand on
 * this same database (that's the whole history of this project up to the
 * policy change) — record them as `baseline = 1` without executing their
 * SQL. Anything added to migrations/ after this point is genuinely new and
 * goes through the real backup+apply path.
 */
async function baselineIfFirstRun(conn) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = ?`,
    [process.env.DB_NAME, TRACKING_TABLE],
  );
  const alreadyExisted = rows[0].n > 0;
  await ensureMigrationsTable(conn);
  if (alreadyExisted) return { justBaselined: false };

  const files = allMigrationFiles();
  for (const f of files) {
    await conn.query(
      `INSERT INTO \`${TRACKING_TABLE}\` (filename, baseline) VALUES (?, 1)`,
      [f],
    );
  }
  console.log(
    `[dbApplyGuard] First run: baselined ${files.length} already-applied migration file(s) — not re-executed.`,
  );
  return { justBaselined: true };
}

/**
 * Applies every not-yet-applied migrations/*.sql file, in order, one at a
 * time. Backs up before each real apply (not before the baseline step,
 * which touches no app data). Stops on the first failure so files are never
 * applied out of order.
 */
async function applyPendingMigrations({ skipBackup = false } = {}) {
  const conn = await mysql.createConnection({ ...connectionConfig(), multipleStatements: true });
  try {
    await baselineIfFirstRun(conn);
    const applied = await getAppliedFilenames(conn);
    const pending = allMigrationFiles().filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log("[dbApplyGuard] No pending migrations. Database is up to date.");
      return { applied: [] };
    }

    const results = [];
    for (const file of pending) {
      console.log(`[dbApplyGuard] Applying ${file} ...`);
      let backupPath = null;
      if (!skipBackup) {
        backupPath = await backupDatabase(`pre-${file.replace(/\.sql$/, "")}`);
      } else {
        console.log(`[dbApplyGuard] Backup skipped for ${file} (explicit skipBackup).`);
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      await conn.query(sql);
      await conn.query(`INSERT INTO \`${TRACKING_TABLE}\` (filename, baseline) VALUES (?, 0)`, [file]);

      console.log(`[dbApplyGuard] Applied ${file}.`);
      results.push({ file, backupPath });
    }
    return { applied: results };
  } finally {
    await conn.end();
  }
}

module.exports = {
  backupDatabase,
  applyPendingMigrations,
  ensureMigrationsTable,
  getAppliedFilenames,
  allMigrationFiles,
  TRACKING_TABLE,
};
