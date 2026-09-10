"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";

const COMPANY_LINKS = [
  { label: "About", href: "#about" },
  { label: "Services", href: "#how-we-work" },
  { label: "Industries", href: "#industries" },
  { label: "Insights", href: "#insights" },
  { label: "Contact", href: "#contact" },
];

const SERVICE_LINKS = [
  { label: "Hospital Management", href: "/services/hospital-management" },
  { label: "Education", href: "/#how-we-work" },
  { label: "Recruitment", href: "/services/placement-services" },
  { label: "Software", href: "/#how-we-work" },
  { label: "Consultancy", href: "/#how-we-work" },
  { label: "Website & SEO", href: "/#how-we-work" },
  { label: "Digital Marketing", href: "/#how-we-work" },
];

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
  const withHome = (hash) => (isHome ? hash : `/${hash}`);

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
    <footer className="bg-[#080808] pb-10 pt-14 md:pt-20">
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
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="font-body break-words text-sm text-[#FAFAF7]/75 transition-colors hover:text-[#08DCDC]"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <p className="font-body mt-8 text-xs text-[#FAFAF7]/40">
          © 2026 Kaizen BMS. All Rights Reserved.
        </p>
      </div>
    </footer>
  );
}
