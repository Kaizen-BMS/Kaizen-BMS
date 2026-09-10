@AGENTS.md

# Design system — Kaizen BMS marketing site

Scoped to the `(company)` route group only (`src/app/(company)/`), via the
`.kbms-site` wrapper + `kaizen.css`. Never leaks into other routes.

- **Palette:** off-white `--kbms-bg`, near-black `--kbms-ink`, muted `--kbms-ink-soft`,
  hairline `--kbms-line`, cyan `#08DCDC` accent (used sparingly). All theme-aware
  (light/dark) except three deliberately-permanent near-black blocks: the final
  `CTA`, the Technology flow panel, and the `Footer`.
- **Type:** serif display (`font-display`) for statements/headlines, sans (`font-body`)
  for everything functional.
- **Layout language:** thin borders, editorial rows (not cards), restrained
  display type (hero caps ~64px, section titles ~44px — refined, not poster-scale),
  compact vertical rhythm, calm motion.
- **Custom SVG only:** the abstract graphic system lives in `src/components/graphics/`
  (`primitives.jsx`, `ServiceGlyph.jsx`) plus `OrbitalGraphic.jsx`. No icon libraries,
  no stock imagery.
- **Service catalogue** is single-sourced from `src/lib/services.js`.

## Content density rules
- No "Why Choose Kaizen" / standalone value-proposition section on any page.
- Display type stays restrained — see the size scale in `SectionHeading.jsx`. Never scale headlines back up to poster size.
- Every section's supporting copy is one short line (~15 words max). Service / industry / step descriptions are short phrases, not sentences.
- The homepage's sector deep-dives (Healthcare, Technology, Digital Growth, Consulting, Case Studies) are consolidated into one tabbed `HowWeWork.jsx` section — don't split them back into separate full-screen sections.
- Before adding any new homepage section, check whether it restates something already on the page — if so, don't add it.

## Services & cross-property navigation
- There is no on-page "Services" section. Services live in `ServiceRail.jsx` — a slim fixed icon rail on the right edge of every page (md+; hidden on mobile), mounted in `(company)/layout.js`. Click an icon → a panel slides out with the service name, one line, and "Explore →" (its own page, or the enquiry form).
- Cross-property navigation (between Home, Hospital Management, Placement Services) is handled by the rail (the two entries with dedicated pages link straight to them), the header Services dropdown, and the footer Services column. There is no separate "network"/switcher section or header launcher — don't add one back.
