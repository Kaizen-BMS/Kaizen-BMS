"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./icons";
import { apiGet, apiSend } from "./api";
import Avatar from "./Avatar";
import CameraCapture from "./CameraCapture";
import CommandPalette from "./CommandPalette";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";
import FacilitySwitcher from "./FacilitySwitcher";
import ChangePassword from "./ChangePassword";
import QuickRegister from "./QuickRegister";

export default function Topbar({ user, navItems, onSidebarToggle }) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const canRegister = (navItems || []).some((i) => i.key === "registration");

  useEffect(() => {
    const onKey = (e) => {
      if (canRegister && e.altKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        setRegisterOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canRegister]);

  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-3 border-b bg-white px-4"
      style={{ height: "var(--hms-topbar-h)", borderColor: "var(--hms-border)" }}
    >
      <button
        onClick={onSidebarToggle}
        className="rounded-md p-1.5 text-[var(--hms-ink-soft)] hover:bg-slate-100"
        aria-label="Toggle sidebar"
      >
        <Icon name="panelLeft" size={18} />
      </button>

      {user.role !== "SUPER_ADMIN" && <FacilitySwitcher fallbackName={user.tenantName} />}

      <GlobalSearch onNavigate={(href) => router.push(href)} />
      <div className="flex-1 sm:hidden" />

      <button
        onClick={() => setPaletteOpen(true)}
        className="hidden items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs text-[var(--hms-ink-faint)] hover:bg-slate-50 sm:flex"
        style={{ borderColor: "var(--hms-border)" }}
      >
        <Icon name="command" size={13} />
        <span>K</span>
      </button>

      {canRegister && (
        <button
          onClick={() => setRegisterOpen(true)}
          className="flex items-center gap-1.5 rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-[var(--hms-btn-fg)]"
          title="Register a patient (Alt + R)"
        >
          + Register
        </button>
      )}
      {registerOpen && <QuickRegister canCollectFee={!!user.canCollectFee} onClose={() => setRegisterOpen(false)} />}

      <ThemeToggle />

      <NotificationBell />

      <ProfileMenu user={user} />

      {paletteOpen && (
        <CommandPalette
          navItems={navItems}
          onClose={() => setPaletteOpen(false)}
          onNavigate={(href) => {
            setPaletteOpen(false);
            router.push(href);
          }}
        />
      )}
    </header>
  );
}

function GlobalSearch({ onNavigate }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const boxRef = useRef(null);

  useEffect(() => {
    // debounced search; results are set from the resolved fetch, not
    // synchronously during render.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      apiGet(`/api/search?q=${encodeURIComponent(q.trim())}`)
        .then((d) => !cancelled && setResults(d.patients || []))
        .catch(() => !cancelled && setResults([]));
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [q]);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setResults(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={boxRef} className="relative hidden min-w-0 max-w-md flex-1 sm:block">
      <div className="flex items-center gap-2 rounded-md border bg-slate-50 px-2.5 py-1.5"
        style={{ borderColor: "var(--hms-border)" }}>
        <Icon name="search" size={15} className="text-[var(--hms-ink-faint)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search patients…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--hms-ink-faint)]"
        />
      </div>
      {results && (
        <div
          className="absolute left-0 right-0 top-full mt-1 overflow-hidden rounded-md border bg-white shadow-lg"
          style={{ borderColor: "var(--hms-border)" }}
        >
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-[var(--hms-ink-faint)]">
              No matches.
            </p>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setResults(null);
                  setQ("");
                  onNavigate(r.href);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <Icon name="user" size={15} className="text-[var(--hms-ink-faint)]" />
                <span className="flex-1 truncate">{r.label}</span>
                <span className="text-xs text-[var(--hms-ink-faint)]">{r.sub}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ProfileMenu({ user }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [photo, setPhoto] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!user.tenantName) return;
    apiGet("/api/me/photo").then((d) => setPhoto(d.photo)).catch(() => {});
  }, [user.tenantName]);

  const [cam, setCam] = useState(false);
  async function onPhoto(url) {
    setCam(false);
    await apiSend("/api/me/photo", "PUT", { photoDataUrl: url });
    setPhoto(url);
    setOpen(false);
  }
  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="rounded-full" aria-label="Profile">
        <Avatar name={user.name} src={photo} size={32} />
      </button>
      {cam && <CameraCapture title="My profile photo" maxWidth={360} onCapture={onPhoto} onClose={() => setCam(false)} />}
      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-56 overflow-hidden rounded-md border bg-white py-1 shadow-lg"
          style={{ borderColor: "var(--hms-border)" }}
        >
          <div className="border-b px-3 py-2" style={{ borderColor: "var(--hms-border)" }}>
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-[var(--hms-ink-faint)]">
              {user.email}
            </p>
            <p className="mt-0.5 text-xs text-[var(--hms-ink-faint)]">
              {user.role.replace(/_/g, " ").toLowerCase()}
              {user.tenantName ? ` · ${user.tenantName}` : ""}
            </p>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              setChangingPw(true);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--hms-ink-soft)] hover:bg-slate-50"
          >
            Change password
          </button>
          {user.tenantName && (
            <button onClick={() => { setOpen(false); setCam(true); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--hms-ink-soft)] hover:bg-slate-50">
              {photo ? "Change my photo" : "Add my photo"}
            </button>
          )}
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--hms-ink-soft)] hover:bg-slate-50"
          >
            <Icon name="logout" size={15} /> Sign out
          </button>
        </div>
      )}
      {changingPw && <ChangePassword onClose={() => setChangingPw(false)} />}
    </div>
  );
}
