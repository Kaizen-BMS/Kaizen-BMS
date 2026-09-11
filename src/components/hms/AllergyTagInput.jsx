"use client";

import { useState } from "react";

/** Chip-style tag input — scannable, not a free-text paragraph. */
export default function AllergyTagInput({ value, onChange, placeholder = "type an allergy, press Enter" }) {
  const [draft, setDraft] = useState("");
  const tags = value || [];

  function add() {
    const v = draft.trim();
    if (!v) return;
    if (!tags.some((t) => t.toLowerCase() === v.toLowerCase())) {
      onChange([...tags, v]);
    }
    setDraft("");
  }

  function remove(i) {
    onChange(tags.filter((_, idx) => idx !== i));
  }

  return (
    <div className="rounded-md border border-slate-300 p-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t, i) => (
          <span
            key={t + i}
            className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
          >
            {t}
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-red-400 hover:text-red-700"
              aria-label={`remove ${t}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="min-w-[120px] flex-1 border-none bg-transparent text-sm outline-none"
        />
      </div>
    </div>
  );
}
