"use client";

import { motion } from "framer-motion";
import SectionHeading from "./SectionHeading";
import ServiceIcon from "./graphics/ServiceIcon";
import { SERVICES, serviceHref } from "@/lib/services";

/**
 * The homepage's one, single services section — the full catalogue as
 * cards, nothing else mixed in (no industries, no case studies). Doubles
 * as the "#how-we-work" anchor target that the Header's Services link and
 * every page's "Explore Services" CTA already points at.
 */
const displayUrl = (href) => href.replace(/^https?:\/\//, "").replace(/\/$/, "");

export default function ServicesOverview() {
  return (
    <section
      id="how-we-work"
      className="scroll-mt-24 border-b border-(--kbms-line) py-11 md:scroll-mt-28 md:py-16"
    >
      <div className="mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
        <SectionHeading
          eyebrow="Our Services"
          title="Comprehensive Advisory Solutions."
          size="xl"
          supporting="Tailored strategies. Measurable results."
        />

        <div className="mt-10 grid grid-cols-2 gap-3 md:mt-12 lg:grid-cols-3 lg:gap-4">
          {SERVICES.map((service, i) => {
            const comingSoon = service.status === "coming-soon";
            const isExternal = /^https?:\/\//.test(service.href || "");
            const Tag = comingSoon ? "div" : motion.a;

            return (
              <Tag
                key={service.slug}
                href={comingSoon ? undefined : serviceHref(service)}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noopener noreferrer" : undefined}
                initial={{ opacity: 0 }}
                animate={
                  comingSoon
                    ? { opacity: 1 }
                    : { opacity: 1, y: [0, -8, 0] }
                }
                transition={
                  comingSoon
                    ? { duration: 0.4, delay: (i % 6) * 0.05 }
                    : {
                        opacity: { duration: 0.4, delay: (i % 6) * 0.05 },
                        y: {
                          duration: 1.6,
                          repeat: Infinity,
                          ease: "easeInOut",
                          delay: i * 0.12,
                        },
                      }
                }
                className={`group flex flex-col rounded-xl border border-(--kbms-line) p-4 shadow-[0_2px_10px_rgba(10,42,67,0.04)] transition-shadow ${
                  comingSoon
                    ? "bg-(--kbms-surface) opacity-70"
                    : "bg-(--kbms-hover) hover:shadow-[0_12px_26px_rgba(10,42,67,0.12)]"
                }`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    comingSoon
                      ? "bg-(--kbms-ink)/5 text-(--kbms-ink-soft)"
                      : "bg-[#16A34A]/10 text-[#16A34A]"
                  }`}
                >
                  <ServiceIcon slug={service.slug} size={18} />
                </div>
                <h3 className="font-display mt-3 text-sm leading-tight text-(--kbms-ink)">
                  {service.title}
                </h3>
                <p className="font-body mt-1.5 text-xs leading-snug text-(--kbms-ink-soft)">
                  {service.description}
                </p>
                {comingSoon ? (
                  <span className="font-body mt-3 inline-flex w-fit items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.08em] text-(--kbms-ink-soft)">
                    Coming Soon
                  </span>
                ) : (
                  <span className="mt-3 inline-flex items-center gap-1 font-body text-xs font-medium text-[#16A34A]">
                    {isExternal ? displayUrl(service.href) : "Learn More"}
                    <span className="transition-transform duration-300 group-hover:translate-x-1">
                      →
                    </span>
                  </span>
                )}
              </Tag>
            );
          })}
        </div>
      </div>
    </section>
  );
}
