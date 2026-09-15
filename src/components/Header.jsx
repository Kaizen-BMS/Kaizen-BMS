"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { SERVICES, serviceHref } from "@/lib/services";

const NAV_LINKS = [
  { label: "About", href: "#about" },
  { label: "Services", href: "#how-we-work", hasDropdown: true },
  { label: "Industries", href: "#industries" },
  { label: "Work", href: "#work" },
  { label: "Contact", href: "#contact" },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [mobileServicesOpen, setMobileServicesOpen] = useState(false);
  const closeTimer = useRef(null);
  const pathname = usePathname();
  const isHome = pathname === "/";
  // In-page anchors only resolve on the homepage — from a sub-page (e.g.
  // /services/hospital-management) they need to link back to "/" first.
  const withHome = (hash) => (isHome ? hash : `/${hash}`);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  function openServices() {
    clearTimeout(closeTimer.current);
    setServicesOpen(true);
  }
  function scheduleCloseServices() {
    closeTimer.current = setTimeout(() => setServicesOpen(false), 2000);
  }

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-500 ${
        scrolled || menuOpen
          ? "border-(--kbms-line) bg-(--kbms-bg)/90 backdrop-saturate-150"
          : "border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6 md:h-20 md:px-10">
        <a
          href="/"
          className="flex items-center gap-2.5"
          aria-label="Kaizen BMS home"
        >
          <Image
            src="/images/KaizenBMS infinity logo.png"
            alt=""
            width={168}
            height={88}
            priority
            className="h-8 w-auto md:h-9"
          />
          <span className="font-body text-base font-semibold tracking-tight text-(--kbms-ink) md:text-lg">
            Kaizen BMS
          </span>
        </a>

        <nav className="hidden items-center gap-9 lg:flex">
          {NAV_LINKS.map((link) =>
            link.hasDropdown ? (
              <div
                key={link.href}
                className="relative"
                onMouseEnter={openServices}
                onMouseLeave={scheduleCloseServices}
              >
                <a
                  href={withHome(link.href)}
                  onClick={() => setServicesOpen(false)}
                  onFocus={openServices}
                  aria-expanded={servicesOpen}
                  className="font-body flex items-center gap-1.5 text-sm text-(--kbms-ink)/80 transition-colors hover:text-(--kbms-ink)"
                >
                  {link.label}
                  <motion.span
                    animate={{ rotate: servicesOpen ? 180 : 0 }}
                    transition={{ duration: 0.25 }}
                    className="text-[10px] text-(--kbms-ink-soft)"
                  >
                    ▾
                  </motion.span>
                </a>

                <AnimatePresence>
                  {servicesOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                      className="kbms-glass-light absolute left-1/2 top-full mt-3 w-[340px] -translate-x-1/2 p-2"
                    >
                      {SERVICES.map((service) => {
                        const comingSoon = service.status === "coming-soon";
                        return (
                          <a
                            key={service.slug}
                            href={comingSoon ? undefined : serviceHref(service)}
                            onClick={() => setServicesOpen(false)}
                            className={`group flex items-center justify-between gap-3 px-3 py-2.5 transition-colors ${
                              comingSoon
                                ? "cursor-default opacity-50"
                                : "hover:bg-(--kbms-hover)"
                            }`}
                          >
                            <span className="font-body text-sm text-(--kbms-ink)">
                              {service.title}
                            </span>
                            {comingSoon ? (
                              <span className="font-body shrink-0 text-[10px] uppercase tracking-[0.08em] text-(--kbms-ink-soft)">
                                Soon
                              </span>
                            ) : (
                              <span className="shrink-0 text-[#08DCDC] opacity-0 transition-opacity group-hover:opacity-100">
                                →
                              </span>
                            )}
                          </a>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <a
                key={link.href}
                href={withHome(link.href)}
                className="font-body text-sm text-(--kbms-ink)/80 transition-colors hover:text-(--kbms-ink)"
              >
                {link.label}
              </a>
            ),
          )}
        </nav>

        <div className="flex items-center gap-4">
          {/* Hard nav on purpose: /login is a different route group + layout. */}
          <a
            href="/login"
            className="font-body hidden text-sm text-(--kbms-ink)/80 transition-colors hover:text-(--kbms-ink) lg:inline"
          >
            Log in
          </a>
          <a
            href={withHome("#contact")}
            className="kbms-glass group hidden items-center gap-2 px-5 py-2 font-body text-sm font-medium text-(--kbms-bg) transition-colors hover:bg-[#08DCDC] hover:text-(--kbms-ink) lg:inline-flex"
          >
            Book a Consultation
            <span className="transition-transform duration-300 group-hover:translate-x-1">
              →
            </span>
          </a>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 lg:hidden"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            <span
              className={`h-px w-6 bg-(--kbms-ink) transition-transform duration-300 ${
                menuOpen ? "translate-y-[3.5px] rotate-45" : ""
              }`}
            />
            <span
              className={`h-px w-6 bg-(--kbms-ink) transition-transform duration-300 ${
                menuOpen ? "-translate-y-[3.5px] -rotate-45" : ""
              }`}
            />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-x-0 top-16 z-40 h-[calc(100dvh-4rem)] overflow-y-auto bg-(--kbms-bg) lg:hidden"
          >
            <nav className="flex min-h-full flex-col justify-center gap-2 px-8 py-10">
              {NAV_LINKS.map((link, i) =>
                link.hasDropdown ? (
                  <div key={link.href}>
                    <div className="flex items-center justify-between">
                      <motion.a
                        href={withHome(link.href)}
                        onClick={() => setMenuOpen(false)}
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          delay: 0.06 * i,
                          duration: 0.5,
                          ease: "easeOut",
                        }}
                        className="font-display text-4xl leading-tight text-(--kbms-ink)"
                      >
                        {link.label}
                      </motion.a>
                      <motion.button
                        type="button"
                        onClick={() => setMobileServicesOpen((v) => !v)}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.06 * i, duration: 0.5 }}
                        aria-label="Toggle services list"
                        aria-expanded={mobileServicesOpen}
                        className="flex h-10 w-10 items-center justify-center text-(--kbms-ink-soft)"
                      >
                        <motion.span
                          animate={{ rotate: mobileServicesOpen ? 180 : 0 }}
                          transition={{ duration: 0.25 }}
                        >
                          ▾
                        </motion.span>
                      </motion.button>
                    </div>

                    <AnimatePresence initial={false}>
                      {mobileServicesOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden"
                        >
                          <div className="flex flex-col gap-1 border-l border-(--kbms-line) py-3 pl-4">
                            {SERVICES.map((service) => {
                              const comingSoon =
                                service.status === "coming-soon";
                              return (
                                <a
                                  key={service.slug}
                                  href={
                                    comingSoon
                                      ? undefined
                                      : serviceHref(service)
                                  }
                                  onClick={() => setMenuOpen(false)}
                                  className={`font-body py-1.5 text-base ${
                                    comingSoon
                                      ? "text-(--kbms-ink-soft)"
                                      : "text-(--kbms-ink)"
                                  }`}
                                >
                                  {service.title}
                                  {comingSoon && (
                                    <span className="ml-2 text-xs">(Soon)</span>
                                  )}
                                </a>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <motion.a
                    key={link.href}
                    href={withHome(link.href)}
                    onClick={() => setMenuOpen(false)}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.06 * i,
                      duration: 0.5,
                      ease: "easeOut",
                    }}
                    className="font-display text-4xl leading-tight text-(--kbms-ink)"
                  >
                    {link.label}
                  </motion.a>
                ),
              )}
              <motion.a
                href={withHome("#contact")}
                onClick={() => setMenuOpen(false)}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.06 * NAV_LINKS.length,
                  duration: 0.5,
                  ease: "easeOut",
                }}
                className="kbms-glass mt-6 inline-flex w-fit items-center gap-2 px-6 py-3 font-body text-lg font-medium text-(--kbms-bg) transition-colors hover:bg-[#08DCDC] hover:text-(--kbms-ink)"
              >
                Book a Consultation →
              </motion.a>
              <motion.a
                href="/login"
                onClick={() => setMenuOpen(false)}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.06 * (NAV_LINKS.length + 1),
                  duration: 0.5,
                  ease: "easeOut",
                }}
                className="font-body mt-4 w-fit text-base text-(--kbms-ink-soft) transition-colors hover:text-(--kbms-ink)"
              >
                Staff log in →
              </motion.a>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
