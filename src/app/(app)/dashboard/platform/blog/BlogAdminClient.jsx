"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { compressImageToDataUrl } from "@/components/hms/imageCompress";
import { slugify, parseLines } from "@/lib/blog";

const EMPTY_FORM = {
  id: null,
  title: "",
  slug: "",
  slugTouched: false,
  excerpt: "",
  category: "",
  coverImage: "",
  content: "",
  keyPointsText: "",
  galleryImages: [],
  status: "DRAFT",
};

const AUTHOR_ROLE_LABEL = { SUPER_ADMIN: "Kaizen BMS Admin", CONTENT_EDITOR: "Content Editor" };

export default function BlogAdminClient({ viewerRole }) {
  const [tab, setTab] = useState("posts");
  const canManageEditors = viewerRole === "SUPER_ADMIN";

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Blog</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kaizen BMS&apos;s public blog — write, edit and publish articles. Every post shows who wrote it.
        </p>
      </div>

      {canManageEditors && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTab("posts")}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              tab === "posts"
                ? "border-[var(--hms-btn-bg)] bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Posts
          </button>
          <button
            onClick={() => setTab("editors")}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              tab === "editors"
                ? "border-[var(--hms-btn-bg)] bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Blog Editors
          </button>
        </div>
      )}

      {tab === "posts" && <PostsTab />}
      {tab === "editors" && canManageEditors && <EditorsTab />}
    </div>
  );
}

function statusPill(status) {
  return status === "PUBLISHED"
    ? "border border-green-300 bg-green-50 text-green-700"
    : "border border-amber-300 bg-amber-50 text-amber-700";
}

function PostsTab() {
  const [posts, setPosts] = useState(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { posts } = await apiGet("/api/admin/blog");
      setPosts(posts);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    load();
  }, []);

  function openNew() {
    setForm(EMPTY_FORM);
    setEditing(true);
    setErr("");
  }

  function openEdit(post) {
    setForm({
      id: post.id,
      title: post.title,
      slug: post.slug,
      slugTouched: true,
      excerpt: post.excerpt,
      category: post.category,
      coverImage: post.cover_image || "",
      content: post.content,
      keyPointsText: Array.isArray(post.key_points) ? post.key_points.join("\n") : "",
      galleryImages: Array.isArray(post.gallery_images) ? post.gallery_images : [],
      status: post.status,
    });
    setEditing(true);
    setErr("");
  }

  async function save(e, publishNow) {
    e.preventDefault();
    if (!form.title.trim() || !form.excerpt.trim() || !form.category.trim() || !form.content.trim()) {
      setErr("Title, excerpt, category and content are all required.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const payload = {
        title: form.title.trim(),
        slug: form.slug.trim() || undefined,
        excerpt: form.excerpt.trim(),
        category: form.category.trim(),
        coverImage: form.coverImage || null,
        content: form.content,
        keyPoints: parseLines(form.keyPointsText),
        galleryImages: form.galleryImages,
        status: publishNow ? "PUBLISHED" : form.status,
      };
      if (form.id) {
        await apiSend(`/api/admin/blog/${form.id}`, "PATCH", payload);
      } else {
        await apiSend("/api/admin/blog", "POST", payload);
      }
      setEditing(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(post) {
    setErr("");
    try {
      await apiSend(`/api/admin/blog/${post.id}`, "PATCH", {
        status: post.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED",
      });
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function remove(post) {
    if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    setErr("");
    try {
      await apiSend(`/api/admin/blog/${post.id}`, "DELETE");
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="space-y-4">
      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      {!editing && (
        <button
          onClick={openNew}
          className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm text-[var(--hms-btn-fg)]"
        >
          + New Post
        </button>
      )}

      {editing && (
        <form className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold">{form.id ? "Edit Post" : "New Post"}</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Title</span>
              <input
                required
                value={form.title}
                onChange={(e) => {
                  const title = e.target.value;
                  setForm((s) => ({
                    ...s,
                    title,
                    slug: s.slugTouched ? s.slug : slugify(title),
                  }));
                }}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Slug (URL)</span>
              <input
                value={form.slug}
                onChange={(e) => setForm((s) => ({ ...s, slug: e.target.value, slugTouched: true }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
              />
            </label>
          </div>

          <label className="block space-y-1 text-sm">
            <span className="font-medium">Category</span>
            <input
              required
              value={form.category}
              onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}
              placeholder="e.g. Hospital Management"
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium">Excerpt</span>
            <textarea
              required
              rows={2}
              value={form.excerpt}
              onChange={(e) => setForm((s) => ({ ...s, excerpt: e.target.value }))}
              placeholder="One or two sentences — shown on the blog index card."
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          <div className="space-y-1.5 text-sm">
            <span className="font-medium">Cover image</span>
            <div className="flex items-center gap-3">
              {form.coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.coverImage} alt="Cover" className="h-16 w-28 rounded border border-slate-200 object-cover" />
              ) : (
                <span className="text-xs text-slate-400">No cover image yet.</span>
              )}
              <label className="cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50">
                {form.coverImage ? "Change" : "Browse…"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    const url = await compressImageToDataUrl(file, 1600, 0.82);
                    setForm((s) => ({ ...s, coverImage: url }));
                  }}
                />
              </label>
              {form.coverImage && (
                <button type="button" onClick={() => setForm((s) => ({ ...s, coverImage: "" }))} className="text-xs text-red-600 underline">
                  Remove
                </button>
              )}
            </div>
          </div>

          <label className="block space-y-1 text-sm">
            <span className="font-medium">Content</span>
            <p className="text-xs text-slate-500">Leave a blank line between paragraphs — each becomes its own paragraph on the page.</p>
            <textarea
              required
              rows={12}
              value={form.content}
              onChange={(e) => setForm((s) => ({ ...s, content: e.target.value }))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs leading-relaxed"
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium">Key Takeaways (optional)</span>
            <p className="text-xs text-slate-500">One point per line — shown as a highlighted list near the top of the post.</p>
            <textarea
              rows={4}
              value={form.keyPointsText}
              onChange={(e) => setForm((s) => ({ ...s, keyPointsText: e.target.value }))}
              placeholder={"e.g.\nGovernance comes before software\nA clear OPD protocol prevents most billing disputes"}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs leading-relaxed"
            />
          </label>

          <div className="space-y-1.5 text-sm">
            <span className="font-medium">Gallery images (optional)</span>
            <p className="text-xs text-slate-500">Extra photos shown within the post, beyond the cover image.</p>
            <div className="flex flex-wrap items-center gap-3">
              {form.galleryImages.map((src, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-16 w-16 rounded border border-slate-200 object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm((s) => ({ ...s, galleryImages: s.galleryImages.filter((_, j) => j !== i) }))}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white"
                    aria-label="Remove image"
                  >
                    ×
                  </button>
                </div>
              ))}
              {form.galleryImages.length < 12 && (
                <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-400 hover:bg-slate-50">
                  + Add
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      e.target.value = "";
                      if (!files.length) return;
                      const urls = await Promise.all(files.map((f) => compressImageToDataUrl(f, 1200, 0.78)));
                      setForm((s) => ({ ...s, galleryImages: [...s.galleryImages, ...urls].slice(0, 12) }));
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              disabled={busy}
              onClick={(e) => save(e, false)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Save as Draft
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={(e) => save(e, true)}
              className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm text-[var(--hms-btn-fg)] disabled:opacity-50"
            >
              {form.status === "PUBLISHED" ? "Save & Keep Published" : "Publish"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setForm(EMPTY_FORM);
                setErr("");
              }}
              className="text-sm text-slate-500 hover:underline"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Written by</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {posts === null ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : posts.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">No posts yet.</td></tr>
            ) : (
              posts.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-medium">{p.title}</td>
                  <td className="px-3 py-2 text-slate-500">{p.category}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${statusPill(p.status)}`}>{p.status}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {p.author ? (
                      <>
                        {p.author.name}
                        <span className="text-slate-400"> · {AUTHOR_ROLE_LABEL[p.author.role] || p.author.role}</span>
                      </>
                    ) : (
                      "Kaizen BMS Team"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-xs">
                    <button onClick={() => openEdit(p)} className="text-slate-500 hover:text-slate-900">Edit</button>
                    <span className="mx-2 text-slate-300">|</span>
                    <button onClick={() => togglePublish(p)} className="text-slate-500 hover:text-slate-900">
                      {p.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                    </button>
                    <span className="mx-2 text-slate-300">|</span>
                    <button onClick={() => remove(p)} className="text-red-500 hover:text-red-700">Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditorsTab() {
  const [editors, setEditors] = useState(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { editors } = await apiGet("/api/admin/blog-editors");
      setEditors(editors);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    load();
  }, []);

  async function create(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    if (form.password && form.password.length < 8) {
      setErr("Password must be at least 8 characters — or leave it blank to generate one.");
      return;
    }
    setBusy(true);
    setErr("");
    setCreated(null);
    try {
      const { editor } = await apiSend("/api/admin/blog-editors", "POST", form);
      setCreated(editor);
      setForm({ name: "", email: "", password: "" });
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(ed) {
    setErr("");
    try {
      await apiSend(`/api/admin/blog-editors/${ed.id}`, "PATCH", { active: !ed.active });
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Assign one person as the blog&apos;s content editor — they can write, edit and publish posts, nothing else.
      </p>
      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {created && (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {created.name} can now log in at <span className="font-mono">/login</span> with {created.email}
          {created.tempPassword ? (
            <>
              {" "}— temp password: <span className="font-mono font-semibold">{created.tempPassword}</span> (shown once, share it now).
            </>
          ) : (
            " — using the password you just set."
          )}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {editors === null ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : editors.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">No blog editor assigned yet.</td></tr>
            ) : (
              editors.map((ed) => (
                <tr key={ed.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">{ed.name}</td>
                  <td className="px-3 py-2 text-slate-500">{ed.email}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${ed.active ? "border border-green-300 bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {ed.active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => toggleActive(ed)} className="text-xs text-slate-400 hover:text-slate-700">
                      {ed.active ? "disable" : "reactivate"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <form onSubmit={create} className="flex flex-wrap gap-2 border-t border-slate-200 p-4">
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Password (leave blank to auto-generate)"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button disabled={busy} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm text-[var(--hms-btn-fg)] disabled:opacity-50">
            + Add Blog Editor
          </button>
        </form>
      </div>
    </div>
  );
}
