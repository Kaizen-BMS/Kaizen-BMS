"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { SERVICES, serviceHref } from "@/lib/services";

const COMPANY_LINKS = [
  { label: "About", href: "#about" },
  { label: "Services", href: "#how-we-work" },
  { label: "Careers", href: "/careers" },
  { label: "Blog", href: "/blog" },
  { label: "Contact", href: "/contact" },
];

// Same source, same order as the Header's Services dropdown — never a
// separately-maintained list that can drift out of sync with it.
const SERVICE_LINKS = SERVICES.map((service) => ({
  label: service.title,
  href: serviceHref(service),
}));

const CONTACT_LINKS = [
  {
    label: "mybusinessaffairs01@gmail.com",
    href: "mailto:mybusinessaffairs01@gmail.com",
  },
  { label: "+91 98145 61099", href: "tel:+919814561099" },
  { label: "Punjab, India", href: "#contact" },
];

export default function Footer() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  // A real absolute path (e.g. "/careers") is already correct from anywhere —
  // only a hash needs the home-page prefix to resolve from a sub-page.
  const withHome = (href) =>
    href.startsWith("#") ? (isHome ? href : `/${href}`) : href;

  const columns = [
    {
      heading: "Company",
      links: COMPANY_LINKS.map((l) => ({ ...l, href: withHome(l.href) })),
    },
    { heading: "Services", links: SERVICE_LINKS },
    {
      heading: "Contact",
      links: CONTACT_LINKS.map((l) =>
        l.href.startsWith("#") ? { ...l, href: withHome(l.href) } : l,
      ),
    },
  ];

  return (
    <footer className="bg-[#0A2A43] pb-10 pt-14 md:pt-20">
      <div className="mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
        <div className="flex flex-col justify-between gap-14 border-b border-[#FAFAF7]/12 pb-16 md:flex-row md:gap-10">
          <div className="max-w-sm">
            <div className="flex items-center gap-3">
              <Image
                src="/images/KaizenBMS infinity logo.png"
                alt=""
                width={200}
                height={105}
                className="h-10 w-auto md:h-12"
              />
              <span className="font-display text-lg text-[#FAFAF7] md:text-xl">
                Kaizen BMS
              </span>
            </div>
            <p className="font-body mt-6 text-sm leading-relaxed text-[#FAFAF7]/60 md:text-base">
              Transforming healthcare, education, recruitment and businesses
              through technology and innovation.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 md:gap-10">
            {columns.map((col) => (
              <div key={col.heading}>
                <p className="font-body text-xs font-medium uppercase tracking-[0.16em] text-[#FAFAF7]/45">
                  {col.heading}
                </p>
                <ul className="mt-5 space-y-3">
                  {col.links.map((link) => {
                    // A long unbroken string (the email) wraps wherever the
                    // browser needs to without this — mid-word, e.g.
                    // "...gmail.co" / "m". A <wbr/> right after "@" gives it
                    // one clean, natural break point instead.
                    const at = link.label.indexOf("@");
                    return (
                      <li key={link.label}>
                        <a
                          href={link.href}
                          className="font-body text-sm text-[#FAFAF7]/75 transition-colors hover:text-[#16A34A]"
                        >
                          {at === -1 ? (
                            link.label
                          ) : (
                            <>
                              {link.label.slice(0, at + 1)}
                              <wbr />
                              {link.label.slice(at + 1)}
                            </>
                          )}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="font-body mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#FAFAF7]/40">
          <p>
            © 2026 Kaizen BMS.{" "}
            <a
              href="/terms-of-service"
              className="underline decoration-[#FAFAF7]/30 underline-offset-2 transition-colors hover:text-[#16A34A] hover:decoration-[#16A34A]"
            >
              All Rights Reserved.
            </a>
          </p>
          <a href="/privacy-policy" className="transition-colors hover:text-[#16A34A]">
            Privacy Policy
          </a>
          <a href="/terms-of-service" className="transition-colors hover:text-[#16A34A]">
            Terms of Service
          </a>
        </div>
      </div>
    </footer>
  );
}
