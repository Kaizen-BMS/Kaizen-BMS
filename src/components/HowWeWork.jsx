"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SectionHeading from "./SectionHeading";

const TABS = [
  { id: "industries", label: "Industries" },
  { id: "healthcare", label: "Healthcare" },
  { id: "technology", label: "Technology" },
  { id: "digital-growth", label: "Digital Growth" },
  { id: "consulting", label: "Consulting" },
  { id: "work", label: "Our Work" },
];

const INDUSTRIES = [
  {
    name: "Healthcare",
    copy: "Operations and digital systems for hospitals and clinics.",
    services: "Hospital Management, Custom Software",
  },
  {
    name: "Education",
    copy: "Academics, admissions and operations, strengthened together.",
    services: "Educational Services, Educational Consultancy",
  },
  {
    name: "Technology",
    copy: "Systems that scale with a growing tech business.",
    services: "Custom Software, Expert Consultancy",
  },
  {
    name: "Startups",
    copy: "Structure without losing momentum.",
    services: "Expert Consultancy, Digital Marketing",
  },
  {
    name: "Manufacturing",
    copy: "Operational visibility and process discipline.",
    services: "Expert Consultancy, Custom Software",
  },
  {
    name: "Retail",
    copy: "Digital presence and demand that convert to sales.",
    services: "Digital Marketing, Website Development & SEO",
  },
  {
    name: "Government",
    copy: "Institutional-grade process, accountability and compliance.",
    services: "Expert Consultancy, Custom Software",
  },
  {
    name: "Corporate",
    copy: "Enterprise workflows, reporting and accountability at scale.",
    services: "Custom Software, Expert Consultancy",
  },
  {
    name: "Real Estate",
    copy: "Brand presence and leads for competitive markets.",
    services: "Digital Marketing, Website Development & SEO",
  },
  {
    name: "Hospitality",
    copy: "Service consistency backed by better systems.",
    services: "Expert Consultancy, Digital Marketing",
  },
  {
    name: "E-Commerce",
    copy: "Storefronts, automation and marketing that convert.",
    services: "Custom Software, Digital Marketing",
  },
];

const CHANNELS = [
  "SEO",
  "Google Ads",
  "Meta Ads",
  "Social",
  "Content",
  "Email",
  "Branding",
  "Lead Gen",
];
const AREAS = [
  "Healthcare",
  "Education",
  "Technology",
  "Business Strategy",
  "Digital Transformation",
  "Startups",
  "Compliance",
  "Operational Excellence",
];
const STEPS = [
  { label: "Diagnosis", w: 34 },
  { label: "Strategy", w: 58 },
  { label: "Implementation", w: 82 },
  { label: "Measurement", w: 100 },
];
const CASES = [
  {
    industry: "Healthcare",
    title: "Hospital Transformation",
    challenge: "Fragmented operations, limited visibility.",
    outcome: "Better visibility, stronger accountability.",
  },
  {
    industry: "Education",
    title: "Institutional Digital Presence",
    challenge: "Weak digital presence, disconnected admissions.",
    outcome: "A clearer, consistent online presence.",
  },
  {
    industry: "Business Operations",
    title: "Workflow Digitization",
    challenge: "Manual processes, no central system.",
    outcome: "One system of record, clear ownership.",
  },
];

const spring = { duration: 0.5, ease: [0.16, 1, 0.3, 1] };

function PanelHead({ title, line }) {
  return (
    <div>
      <h3 className="font-display text-xl leading-tight text-(--kbms-ink) md:text-2xl">
        {title}
      </h3>
      <p className="font-body mt-2 max-w-md text-sm leading-relaxed text-(--kbms-ink-soft)">
        {line}
      </p>
    </div>
  );
}

function IndustriesPanel() {
  const [active, setActive] = useState(0);
  const ind = INDUSTRIES[active];
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-12 md:gap-10">
      <div className="md:col-span-8">
        <PanelHead
          title="Built for Complex Organizations."
          line="Sectors we know well enough to move fast in."
        />
        <div className="mt-5 flex flex-wrap gap-2">
          {INDUSTRIES.map((x, i) => (
            <button
              key={x.name}
              type="button"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className={`font-body border px-3 py-1.5 text-sm transition-colors ${
                i === active
                  ? "border-[#08DCDC] bg-[#08DCDC] text-(--kbms-ink)"
                  : "border-(--kbms-line) text-(--kbms-ink) hover:bg-(--kbms-hover)"
              }`}
            >
              {x.name}
            </button>
          ))}
        </div>
      </div>
      <div className="md:col-span-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="border-l border-(--kbms-line) pl-6"
          >
            <p className="font-display text-lg text-(--kbms-ink)">{ind.name}</p>
            <p className="font-body mt-2 text-sm leading-relaxed text-(--kbms-ink-soft)">
              {ind.copy}
            </p>
            <p className="font-body mt-4 text-[11px] font-medium uppercase tracking-[0.14em] text-(--kbms-ink)">
              Relevant services
            </p>
            <p className="font-body mt-1 text-sm text-(--kbms-ink-soft)">
              {ind.services}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function RadialMetrics() {
  const metrics = [
    "Patients",
    "Depts",
    "Efficiency",
    "OPD",
    "Attendance",
    "Revenue",
  ];
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[260px]">
      <svg viewBox="0 0 260 260" className="h-full w-full" aria-hidden="true">
        <motion.circle
          cx="130"
          cy="130"
          r="100"
          fill="none"
          stroke="var(--kbms-line)"
          strokeWidth="1"
          initial={{ pathLength: 0, rotate: -90 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          style={{ transformOrigin: "130px 130px" }}
        />
        <circle cx="130" cy="130" r="20" fill="var(--kbms-ink)" />
        {metrics.map((_, i) => {
          const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
          return (
            <motion.line
              key={i}
              x1="130"
              y1="130"
              x2={130 + Math.cos(a) * 100}
              y2={130 + Math.sin(a) * 100}
              stroke="var(--kbms-ink)"
              strokeOpacity="0.14"
              strokeWidth="1"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.08 }}
            />
          );
        })}
        {metrics.map((_, i) => {
          const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
          return (
            <motion.circle
              key={`d${i}`}
              cx={130 + Math.cos(a) * 100}
              cy={130 + Math.sin(a) * 100}
              r="3"
              fill="#08DCDC"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.3, delay: 0.5 + i * 0.08 }}
            />
          );
        })}
      </svg>
      {metrics.map((m, i) => {
        const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
        return (
          <motion.span
            key={m}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.6 + i * 0.08 }}
            className="font-body absolute -translate-x-1/2 -translate-y-1/2 text-[10px] font-medium uppercase tracking-[0.06em] text-(--kbms-ink-soft)"
            style={{
              left: `${50 + Math.cos(a) * 46}%`,
              top: `${50 + Math.sin(a) * 46}%`,
            }}
          >
            {m}
          </motion.span>
        );
      })}
    </div>
  );
}

function Flow() {
  const stages = ["Business", "Data", "Automation", "Insight", "Growth"];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
      {stages.map((s, i, arr) => (
        <motion.span
          key={s}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: i * 0.12 }}
          className="flex items-center gap-3"
        >
          <span className="font-display text-base md:text-lg">{s}</span>
          {i < arr.length - 1 && <span className="text-[#08DCDC]">→</span>}
        </motion.span>
      ))}
    </div>
  );
}

function Funnel() {
  const stages = ["Visibility", "Leads", "Customers", "Revenue"];
  return (
    <div className="flex items-end gap-2">
      {stages.map((s, i) => (
        <div key={s} className="flex flex-1 flex-col items-center gap-2">
          <motion.div
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ ...spring, delay: i * 0.12 }}
            className={
              i === stages.length - 1
                ? "origin-bottom bg-[#08DCDC]"
                : "origin-bottom bg-(--kbms-ink)"
            }
            style={{ height: 104, width: `${100 - i * 20}%` }}
          />
          <span className="font-body text-[10px] font-medium uppercase tracking-[0.08em] text-(--kbms-ink-soft)">
            {s}
          </span>
        </div>
      ))}
    </div>
  );
}

function ConsultingBars() {
  return (
    <div className="space-y-4">
      {STEPS.map((step, i) => (
        <div key={step.label} className="flex items-center gap-4">
          <span className="font-body w-28 shrink-0 text-xs font-medium text-(--kbms-ink) md:w-32 md:text-sm">
            {step.label}
          </span>
          <div className="h-1.5 flex-1 bg-(--kbms-track)">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${step.w}%` }}
              transition={{
                duration: 0.8,
                delay: i * 0.12,
                ease: [0.16, 1, 0.3, 1],
              }}
              className={`h-full ${i === STEPS.length - 1 ? "bg-[#08DCDC]" : "bg-(--kbms-ink)"}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HowWeWork() {
  const [tab, setTab] = useState(TABS[0].id);

  return (
    <section
      id="how-we-work"
      className="scroll-mt-24 border-b border-(--kbms-line) py-11 md:scroll-mt-28 md:py-16"
    >
      <div className="mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
        <SectionHeading
          eyebrow="What We Do"
          title="Depth Where It Counts."
          size="xl"
          supporting="The sectors we serve and the ways we go deep — one operating approach."
        />

        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-b border-(--kbms-line) pb-3 md:mt-10">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`font-body pb-1 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "border-b border-[#08DCDC] text-(--kbms-ink)"
                  : "text-(--kbms-ink-soft) hover:text-(--kbms-ink)"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-8 min-h-[300px] md:mt-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              {tab === "industries" && <IndustriesPanel />}

              {tab === "healthcare" && (
                <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-2">
                  <PanelHead
                    title="Transforming Healthcare Through Better Management."
                    line="Hospital operations with real visibility — not just another system to maintain."
                  />
                  <RadialMetrics />
                </div>
              )}

              {tab === "technology" && (
                <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:items-center">
                  <PanelHead
                    title="Technology Built Around Your Business."
                    line="ERP, portals, automation and enterprise apps — shaped around how you actually work."
                  />
                  <div className="bg-(--kbms-ink) px-6 py-8 text-(--kbms-bg)">
                    <Flow />
                  </div>
                </div>
              )}

              {tab === "digital-growth" && (
                <div className="grid grid-cols-1 gap-8 md:grid-cols-12 md:gap-10">
                  <div className="md:col-span-7">
                    <PanelHead
                      title="Turn Visibility Into Revenue."
                      line="SEO, paid media, content and brand — moving prospects to paying customers."
                    />
                    <div className="mt-6 max-w-sm">
                      <Funnel />
                    </div>
                  </div>
                  <div className="md:col-span-5">
                    <p className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-(--kbms-ink)">
                      Channels
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {CHANNELS.map((c) => (
                        <span
                          key={c}
                          className="font-body border border-(--kbms-line) px-2.5 py-1 text-xs text-(--kbms-ink)"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {tab === "consulting" && (
                <div className="grid grid-cols-1 gap-8 md:grid-cols-12 md:gap-10">
                  <div className="md:col-span-7">
                    <PanelHead
                      title="Strategy That Actually Gets Implemented."
                      line="Consulting that stays through implementation and measurement — not just the recommendation."
                    />
                    <div className="mt-6">
                      <ConsultingBars />
                    </div>
                  </div>
                  <div className="md:col-span-5">
                    <p className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-(--kbms-ink)">
                      Areas of practice
                    </p>
                    <ul className="mt-3 divide-y divide-(--kbms-line) border-t border-(--kbms-line)">
                      {AREAS.map((a) => (
                        <li
                          key={a}
                          className="font-body py-2 text-sm text-(--kbms-ink-soft)"
                        >
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {tab === "work" && (
                <div>
                  <PanelHead
                    title="Work That Moves Businesses Forward."
                    line="A structured mix of management, technology and analytics — measured by outcomes."
                  />
                  <div className="mt-6 border-t border-(--kbms-line)">
                    {CASES.map((c, i) => (
                      <motion.div
                        key={c.title}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...spring, delay: i * 0.1 }}
                        className="grid grid-cols-1 gap-2 border-b border-(--kbms-line) py-4 md:grid-cols-12 md:gap-6"
                      >
                        <div className="md:col-span-4">
                          <p className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-[#08DCDC]">
                            {c.industry}
                          </p>
                          <p className="font-display mt-1 text-base text-(--kbms-ink) md:text-lg">
                            {c.title}
                          </p>
                        </div>
                        <p className="font-body text-sm text-(--kbms-ink-soft) md:col-span-4">
                          {c.challenge}
                        </p>
                        <p className="font-body text-sm text-(--kbms-ink) md:col-span-4">
                          {c.outcome}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
