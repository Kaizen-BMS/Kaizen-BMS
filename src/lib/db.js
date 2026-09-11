"use strict";

// Env is loaded by whoever boots this module first: server.js and the CLI
// scripts call scripts/loadEnv explicitly before requiring it; inside Next
// (route handlers, proxy, server components) Next has already populated
// process.env from .env. So no loader require here — that require made the
// bundler trace the whole project (see next build warning).
const mysql = require("mysql2/promise");

// One shared pool per Node process. The custom server keeps a single
// long-lived process, so this is also the pool API routes use.
const globalForDb = globalThis;

function makePool() {
  return mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
    dateStrings: false,
    // mysql2 always parameterizes via prepared statements — never string-concat SQL.
  });
}

const pool = globalForDb.__kaizenPool || makePool();
if (process.env.NODE_ENV !== "production") globalForDb.__kaizenPool = pool;

/** Run a parameterized query. `params` is an object (named) or array (positional). */
async function query(sql, params) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** First row or null. */
async function queryOne(sql, params) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/** Run `fn(conn)` inside a transaction. */
async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, queryOne, transaction };
