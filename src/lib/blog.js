"use strict";

// Shared helpers for the blog CMS — used by the public (company) blog pages
// and the admin API routes alike, so slug rules, paragraph rendering and
// author display never drift apart between the two.

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(title) {
  return String(title)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 191);
}

/** Splits stored content (blank-line-separated) into paragraphs for <p> rendering. */
function paragraphsOf(content) {
  return String(content || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Turns a plain textarea value (one Key Takeaway per line) into the array
 * stored in blog_posts.key_points — used by the admin form before
 * submitting.
 */
function parseLines(raw) {
  return String(raw || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// blog_posts.key_points / .gallery_images came back from `prisma db pull`
// as plain `String? @db.LongText`, not Prisma's `Json` type — MariaDB's
// JSON type is LONGTEXT under a CHECK constraint, same as
// module_connections.allowed_fields (see moduleConnections.js's own
// parseJsonArray/JSON.stringify pair) — so these need the same manual
// stringify-on-write / parse-on-read, never a bare array passed straight
// to Prisma.
function parseJsonArray(v) {
  if (!v) return [];
  try {
    const parsed = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toJsonArrayOrNull(arr) {
  return Array.isArray(arr) && arr.length ? JSON.stringify(arr) : null;
}

// What the public page shows under "Written by" — real name + a plain-
// English label for which kind of account wrote it, per the owner's own
// request ("hume pata lage ki admin ne ya uss user ne likha"). No author
// row (the 3 posts seeded before per-author attribution existed) falls
// back to the same "Kaizen BMS Team" byline every post already showed.
const AUTHOR_ROLE_LABEL = {
  SUPER_ADMIN: "Kaizen BMS Admin",
  CONTENT_EDITOR: "Content Editor",
};

function authorDisplay(author) {
  if (!author) return { name: "Kaizen BMS Team", roleLabel: null };
  return {
    name: author.name,
    roleLabel: AUTHOR_ROLE_LABEL[author.role] || null,
  };
}

module.exports = { SLUG_RE, slugify, paragraphsOf, parseLines, parseJsonArray, toJsonArrayOrNull, authorDisplay };
