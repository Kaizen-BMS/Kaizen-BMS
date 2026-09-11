"use strict";

const { query, queryOne } = require("../db");
const { requireTenantId } = require("../requestContext");

/**
 * Escape hatch for reads that need a JOIN the helpers below can't express.
 * The caller MUST include `<alias>.tenant_id = :tid` in the WHERE clause;
 * `:tid` is bound here from the request context. Table/column names in the
 * SQL are the caller's responsibility to keep as code literals.
 */
async function scopedQuery(sql, params = {}) {
  return query(sql, { tid: requireTenantId(), ...params });
}
async function scopedQueryOne(sql, params = {}) {
  const rows = await scopedQuery(sql, params);
  return rows[0] || null;
}

/**
 * The tenant-scoped data layer. Every function here forces
 * `requireTenantId()` (throws if called outside a request context) and
 * folds `tenant_id` into the WHERE / the inserted row — so a route author
 * physically cannot query another hospital's data or forget the filter.
 *
 * Table and column names are always code literals (never request input);
 * values are always bound parameters.
 */

const ident = (s) => "`" + String(s).replace(/`/g, "") + "`";

function buildWhere(where, params) {
  const conds = ["tenant_id = ?"];
  params.push(requireTenantId());
  for (const [k, v] of Object.entries(where || {})) {
    if (v === null) {
      conds.push(`${ident(k)} IS NULL`);
    } else {
      conds.push(`${ident(k)} = ?`);
      params.push(v);
    }
  }
  return conds.join(" AND ");
}

async function findMany(table, { where, columns = "*", orderBy, limit } = {}) {
  const params = [];
  let sql = `SELECT ${columns} FROM ${ident(table)} WHERE ${buildWhere(where, params)}`;
  if (orderBy) sql += ` ORDER BY ${orderBy}`;
  if (limit) sql += ` LIMIT ${Number(limit)}`;
  return query(sql, params);
}

async function findOne(table, where, columns = "*") {
  const rows = await findMany(table, { where, columns, limit: 1 });
  return rows[0] || null;
}

async function findById(table, id, columns = "*") {
  return findOne(table, { id }, columns);
}

async function count(table, where) {
  const params = [];
  const sql = `SELECT COUNT(*) AS n FROM ${ident(table)} WHERE ${buildWhere(where, params)}`;
  const row = await queryOne(sql, params);
  return Number(row.n);
}

async function insert(table, data) {
  const row = { ...data, tenant_id: requireTenantId() };
  const keys = Object.keys(row);
  const sql = `INSERT INTO ${ident(table)} (${keys.map(ident).join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`;
  const res = await query(
    sql,
    keys.map((k) => row[k]),
  );
  return res.insertId;
}

async function updateById(table, id, data) {
  const keys = Object.keys(data);
  if (keys.length === 0) return 0;
  const sql =
    `UPDATE ${ident(table)} SET ${keys.map((k) => `${ident(k)} = ?`).join(", ")} ` +
    `WHERE id = ? AND tenant_id = ?`;
  const res = await query(sql, [
    ...keys.map((k) => data[k]),
    id,
    requireTenantId(),
  ]);
  return res.affectedRows;
}

async function deleteById(table, id) {
  const res = await query(
    `DELETE FROM ${ident(table)} WHERE id = ? AND tenant_id = ?`,
    [id, requireTenantId()],
  );
  return res.affectedRows;
}

module.exports = {
  findMany,
  findOne,
  findById,
  count,
  insert,
  updateById,
  deleteById,
  scopedQuery,
  scopedQueryOne,
  requireTenantId,
};
