"use client";

import { motion } from "framer-motion";
import SectionHeading from "./SectionHeading";
import ServiceGlyph from "./graphics/ServiceGlyph";

/**
 * Editorial service-detail rows — richer than the homepage's ServiceIndex
 * (each entry carries a feature checklist, not just a one-line teaser),
 * but still full-width numbered rows rather than a card grid.
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

        <div className="mt-10 border-t border-(--kbms-line) md:mt-12">
          {services.map((service, i) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -10% 0px" }}
              transition={{
                duration: 0.55,
                delay: (i % 3) * 0.08,
                ease: "easeOut",
              }}
              className="grid grid-cols-1 gap-8 border-b border-(--kbms-line) py-10 md:grid-cols-12 md:gap-10 md:py-12"
            >
              <div className="md:col-span-5">
                <span className="font-body text-sm text-(--kbms-ink-soft)">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display mt-3 text-xl leading-tight text-(--kbms-ink) md:text-2xl">
                  {service.title}
                </h3>
                <p className="font-body mt-4 max-w-md text-sm leading-relaxed text-(--kbms-ink-soft) md:text-base">
                  {service.description}
                </p>
                {service.ctaLabel && (
                  <a
                    href={service.ctaHref || "#contact"}
                    className="group mt-6 inline-flex items-center gap-2 border-b border-(--kbms-ink)/30 pb-1 font-body text-sm font-medium text-(--kbms-ink) transition-colors hover:border-(--kbms-ink)"
                  >
                    {service.ctaLabel}
                    <span className="transition-transform duration-300 group-hover:translate-x-1">
                      →
                    </span>
                  </a>
                )}
              </div>

              <div className="md:col-span-5 md:col-start-7">
                <ul className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  {service.features.map((feature) => (
                    <li
                      key={feature}
                      className="font-body flex items-start gap-2.5 text-sm text-(--kbms-ink)"
                    >
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#08DCDC]" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="hidden md:col-span-2 md:flex md:items-center md:justify-end">
                <ServiceGlyph index={i} size={88} />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
