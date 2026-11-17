"use client";

import { motion } from "framer-motion";
import SectionHeading from "./SectionHeading";
import ServiceGlyph from "./graphics/ServiceGlyph";

/**
 * Service-detail cards — each entry carries a feature checklist and its own
 * "Learn More" link, matching the reference template's card language
 * (rounded, shadowed, icon-badge) rather than the site's older editorial
 * rows.
 */
export default function ServiceDetailGrid({
  eyebrow,
  title,
  supporting,
  services,
}) {
  return (
    <section
      id="services"
      className="border-b border-(--kbms-line) py-11 md:py-16"
    >
      <div className="mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          size="xl"
          supporting={supporting}
        />

        {/* flex-wrap + justify-center (not CSS grid) so a trailing row that
            doesn't fill all 3 columns — 4, 5, 7 items, etc. — centers
            itself instead of sitting flush-left with empty space beside it. */}
        <div className="mt-10 flex flex-wrap justify-center gap-3 md:mt-12">
          {services.map((service, i) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, y: [0, -8, 0] }}
              transition={{
                opacity: { duration: 0.4, delay: (i % 4) * 0.08 },
                y: {
                  duration: 1.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.12,
                },
              }}
              className="flex w-full flex-col rounded-xl border border-(--kbms-line) bg-(--kbms-hover) p-4 shadow-[0_2px_10px_rgba(10,42,67,0.04)] transition-shadow hover:shadow-[0_12px_26px_rgba(10,42,67,0.12)] sm:w-[calc(50%-0.375rem)] lg:w-[calc(33.333%-0.5rem)]"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#16A34A]/10 text-[#16A34A]">
                <ServiceGlyph index={i} size={18} />
              </div>

              <h3 className="font-display mt-3 text-sm leading-tight text-(--kbms-ink)">
                {service.title}
              </h3>
              <p className="font-body mt-1.5 text-xs leading-snug text-(--kbms-ink-soft)">
                {service.description}
              </p>

              <ul className="mt-3 space-y-1.5">
                {service.features.map((feature) => (
                  <li
                    key={feature}
                    className="font-body flex items-start gap-2 text-xs text-(--kbms-ink)"
                  >
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#16A34A]" />
                    {feature}
                  </li>
                ))}
              </ul>

              {service.ctaLabel && (
                <a
                  href={service.ctaHref || "#contact"}
                  className="group mt-3 inline-flex items-center gap-1.5 font-body text-xs font-medium text-[#16A34A] hover:text-[#15803D]"
                >
                  {service.ctaLabel}
                  <span className="transition-transform duration-300 group-hover:translate-x-1">
                    →
                  </span>
                </a>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
