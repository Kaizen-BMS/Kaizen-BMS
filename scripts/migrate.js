/**
 * Lists the migration files in ../migrations and prints how to apply them.
 * It does NOT connect to any database and does NOT apply anything — this
 * project has one (production) database and all schema changes are applied
 * by hand by the project owner. See CLAUDE.md "Database rule".
 *
 * Usage: npm run db:migrate
 */
"use strict";

const fs = require("fs");
const path = require("path");

const DIR = path.resolve(__dirname, "..", "migrations");

const files = fs
  .readdirSync(DIR)
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .sort();

console.log(
  [
    "",
    "Migrations in this repo (apply in this order, by hand, on the DB):",
    "",
    ...files.map((f) => `  ${f}`),
    "",
    "Apply a file with either:",
    "  • phpMyAdmin  -> Import -> choose the file",
    "  • mysql CLI   -> mysql -h <host> -u <user> -p <db> < migrations/<file>",
    "",
    "Then also run migrations/seed.sql once, if you want the demo tenants.",
    "This script never touches the database itself.",
    "",
  ].join("\n"),
);
