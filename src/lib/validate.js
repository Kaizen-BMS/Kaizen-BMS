"use strict";

const { HttpError } = require("./apiRoute");

/**
 * Parse a request body against a zod schema. Rejects with 400 before any
 * value reaches the database.
 */
async function parseBody(request, schema) {
  let raw;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError(400, "invalid_json");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues?.[0];
    throw new HttpError(
      400,
      issue ? `${issue.path.join(".")}: ${issue.message}` : "invalid_input",
    );
  }
  return result.data;
}

module.exports = { parseBody };
