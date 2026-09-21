"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/hms/icons";
import { apiGet } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import Topbar from "@/components/hms/Topbar";
import PartnerRequestPopup from "@/components/hms/PartnerRequestPopup";
import Toasts from "@/components/hms/Toasts";

const COLLAPSE_KEY = "hms-sidebar-collapsed";

export default function DashboardShell({ user, groups, children }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [badges, setBadges] = useState({});

  useEffect(() => {
    // restore the persisted collapse preference on mount
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const loadBadges = useCallback(() => {
    apiGet("/api/badges")
      .then((d) => setBadges(d.badges || {}))
      .catch(() => {});
  }, []);

  useEffect(loadBadges, [loadBadges]);

  // Attention counts follow the same real-time events, never a timer.
  useRealtime(
    {
      "prescription:created": loadBadges,
      "prescription:updated": loadBadges,
      "laborder:created": loadBadges,
      "laborder:updated": loadBadges,
      "lab:result": loadBadges,
      "dispense:created": loadBadges,
    },
    loadBadges,
  );

  const flatNav = useMemo(
    () => groups.flatMap((g) => g.items.filter((i) => i.status === "live" && i.route)),
    [groups],
  );

  return (
    <div className="flex min-h-screen">
      <aside
        className="sticky top-0 flex h-screen shrink-0 flex-col border-r bg-white transition-[width] duration-200"
        style={{
          width: collapsed
            ? "var(--hms-sidebar-w-collapsed)"
            : "var(--hms-sidebar-w)",
          borderColor: "var(--hms-border)",
        }}
      >
        <div
          className="flex items-center gap-2 border-b px-3"
          style={{ height: "var(--hms-topbar-h)", borderColor: "var(--hms-border)" }}
        >
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[var(--hms-accent)] text-xs font-bold text-[var(--hms-btn-fg)]">
            K
          </div>
          {!collapsed && (
            <span className="truncate text-sm font-semibold">Kaizen HMS</span>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {groups.map((g) => (
            <div key={g.key} className="mb-4">
              {g.label && !collapsed && (
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--hms-ink-faint)]">
                  {g.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {g.items.map((item) => (
                  <NavItem
                    key={item.key}
                    item={item}
                    active={isActive(pathname, item.route)}
                    collapsed={collapsed}
                    badge={item.badge ? badges[item.badge] : undefined}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <button
          onClick={toggleCollapse}
          className="flex items-center gap-2 border-t px-3 py-2.5 text-xs text-[var(--hms-ink-soft)] hover:bg-slate-50"
          style={{ borderColor: "var(--hms-border)" }}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <Icon
            name="chevron"
            className={collapsed ? "" : "rotate-180"}
            size={16}
          />
          {!collapsed && <span>Collapse</span>}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} navItems={flatNav} onSidebarToggle={toggleCollapse} />
        <main className="flex-1 overflow-x-auto p-6">{children}</main>
        <Toasts navKeys={flatNav.map((i) => i.key)} />
        <PartnerRequestPopup enabled={user.role === "HOSPITAL_ADMIN" || String(user.role).startsWith("OWNER_")} />
      </div>
    </div>
  );
}

function NavItem({ item, active, collapsed, badge }) {
  const soon = item.status !== "live" || !item.route;
  const showBadge = typeof badge === "number" && badge > 0;

  const inner = (
    <>
      <span
        className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-[var(--hms-accent)]"
        style={{ opacity: active ? 1 : 0 }}
      />
      <Icon name={item.icon} size={18} className="shrink-0" />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && soon && (
        <span className="rounded bg-slate-100 px-1.5 py-px text-[10px] font-medium text-[var(--hms-ink-faint)]">
          Soon
        </span>
      )}
      {showBadge && (
        <span
          className={`grid min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-semibold ${
            collapsed
              ? "absolute right-1 top-1 h-4 min-w-[16px] bg-[var(--hms-accent)] text-[var(--hms-btn-fg)]"
              : "bg-[var(--hms-accent-soft)] text-[var(--hms-accent)]"
          }`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </>
  );

  const cls = `relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm ${
    active
      ? "bg-[var(--hms-accent-soft)] font-medium text-[var(--hms-accent)]"
      : soon
        ? "cursor-default text-[var(--hms-ink-faint)]"
        : "text-[var(--hms-ink-soft)] hover:bg-slate-50 hover:text-[var(--hms-ink)]"
  }`;

  if (soon) {
    return (
      <li>
        <div className={cls} title={`${item.label} — coming soon`}>
          {inner}
        </div>
      </li>
    );
  }
  return (
    <li>
      <Link href={item.route} className={cls} title={collapsed ? item.label : undefined}>
        {inner}
      </Link>
    </li>
  );
}

function isActive(pathname, route) {
  if (!route) return false;
  if (route === "/dashboard") return pathname === "/dashboard";
  return pathname === route || pathname.startsWith(route + "/");
}
