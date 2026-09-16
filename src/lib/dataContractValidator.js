"use strict";

const { getContract } = require("./dataContracts");

/**
 * Data Contract payload validator — Phase 8B (CLAUDE.md "Master data +
 * data contract foundation", Part 9). A small, explicit validator, not a
 * JSON-schema framework: checks the contract exists/is active/matches the
 * requested version and module pair, that every required identifier is
 * present, and that no field outside the contract's own whitelist is
 * present. Never checked client-side only — every check here is meant to
 * run server-side, the one place a payload can actually be trusted.
 *
 * Returns `{ valid: true, errors: [] }` or `{ valid: false, errors: [...] }`
 * — `errors` is a list of short, stable string codes (matching this
 * project's existing "one clean reason string" error convention), never a
 * thrown exception — callers decide what HTTP status a given error code
 * maps to.
 */
function validateContractPayload(contractType, payload, { sourceModule, targetModule, version } = {}) {
  const errors = [];

  const contract = getContract(contractType, version);
  if (!contract) {
    return { valid: false, errors: [version != null ? "unknown_contract_version" : "unknown_contract"] };
  }
  if (contract.status !== "ACTIVE") {
    return { valid: false, errors: ["contract_inactive"] };
  }
  if (sourceModule != null && contract.sourceModule !== sourceModule) {
    errors.push("source_module_mismatch");
  }
  if (targetModule != null && contract.targetModule !== targetModule) {
    errors.push("target_module_mismatch");
  }

  const body = payload && typeof payload === "object" ? payload : {};
  const fieldSet = new Set(contract.fields);

  for (const required of contract.requiredFields || []) {
    if (body[required] === undefined || body[required] === null || body[required] === "") {
      errors.push(`missing_required_field:${required}`);
    }
  }

  for (const key of Object.keys(body)) {
    if (!fieldSet.has(key)) {
      errors.push(`forbidden_field:${key}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateContractPayload };
