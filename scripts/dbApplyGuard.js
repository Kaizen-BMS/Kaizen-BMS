/**
 * There is exactly ONE database for this project — the production database
 * (no separate local/dev database exists). Nothing in this repo is allowed to
 * apply a schema change or seed data to it, ever, at any stage of
 * development. Migration `.sql` files are generated and handed to the project
 * owner, who applies them by hand (phpMyAdmin / mysql CLI on Hostinger).
 *
 * This guard refuses UNCONDITIONALLY — it does not look at DB_HOST or any
 * "is this local?" heuristic, because that distinction no longer exists.
 * See CLAUDE.md "Database rule".
 */
"use strict";

function blockDbApply(action) {
  console.error(
    [
      "",
      `Refusing to ${action}.`,
      "",
      "This project has ONE database (production). Schema and data changes",
      "are never applied from code — not in dev, not at deploy.",
      "",
      "Instead:",
      "  • schema change  -> a migrations/NNN_*.sql file is generated for you",
      "                      to run yourself.",
      "  • demo/seed data -> a migrations/seed.sql file is generated for you",
      "                      to run yourself (never on a live tenant).",
      "",
      "See CLAUDE.md \"Database rule\".",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

module.exports = { blockDbApply };
