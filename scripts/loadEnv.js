/**
 * Minimal .env loader for the custom server / CLI scripts (no dependency).
 * Next.js loads .env itself for the app; this covers code that runs in
 * server.js / scripts before Next boots.
 */
const fs = require("fs");
const path = require("path");

function loadEnv(file) {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return;
  for (const raw of fs.readFileSync(full, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnv(".env.local");
loadEnv(".env");

module.exports = { loadEnv };
