"use client";

import { useState } from "react";

// Real share-to-platform links — no API keys/auto-posting needed, works
// immediately. Each opens that platform's own share dialog with this
// post's URL + title pre-filled; the visitor still presses "post" there.
function shareTargets(url, title) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return [
    { label: "X", href: `https://twitter.com/intent/tweet?url=${u}&text=${t}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { label: "WhatsApp", href: `https://wa.me/?text=${t}%20${u}` },
  ];
}

export default function BlogShare({ url, title }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-body text-xs font-medium uppercase tracking-[0.12em] text-(--kbms-ink-soft)">
        Share
      </span>
      {shareTargets(url, title).map((t) => (
        <a
          key={t.label}
          href={t.href}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-(--kbms-line) px-3.5 py-1.5 font-body text-xs font-medium text-(--kbms-ink) transition-colors hover:border-[#16A34A] hover:text-[#16A34A]"
        >
          {t.label}
        </a>
      ))}
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
          } catch {
            // Clipboard API unavailable (very old browser, non-HTTPS) —
            // the link is still visible via the browser's own address bar.
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }}
        className="rounded-full border border-(--kbms-line) px-3.5 py-1.5 font-body text-xs font-medium text-(--kbms-ink) transition-colors hover:border-[#16A34A] hover:text-[#16A34A]"
      >
        {copied ? "Copied!" : "Copy Link"}
      </button>
    </div>
  );
}
