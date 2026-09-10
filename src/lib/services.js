// Single source of truth for the service catalogue — used by the homepage's
// ServiceIndex rows and by the Header's Services dropdown, so the two never
// drift apart. Entries with an explicit `href` link straight to their own
// page; the rest deep-link to their row in the homepage's services section.

export const SERVICES = [
  {
    slug: "hospital-management",
    title: "Hospital Management",
    description: "Healthcare operations, digital transformation and growth.",
    href: "/services/hospital-management",
  },
  {
    slug: "educational-services",
    title: "Educational Services",
    description:
      "Academic support, career counselling, STEM and institutional development.",
  },
  {
    slug: "jobs-placement",
    title: "Jobs & Placement",
    description: "Recruitment, placement and career advancement.",
    href: "/services/placement-services",
  },
  {
    slug: "custom-software",
    title: "Custom Software",
    description: "ERP, portals, automation and enterprise apps, built to fit.",
  },
  {
    slug: "expert-consultancy",
    title: "Expert Consultancy",
    description: "Strategy, process optimization and digital transformation.",
  },
  {
    slug: "website-development-seo",
    title: "Website Development & SEO",
    description: "Websites, portals, SEO and digital presence.",
  },
  {
    slug: "digital-marketing",
    title: "Digital Marketing",
    description:
      "SEO, paid ads, social, content, branding and lead generation.",
  },
  {
    slug: "educational-consultancy",
    title: "Educational Consultancy",
    description:
      "University admissions, scholarships, visas and study-abroad support.",
  },
  {
    slug: "online-marketplace",
    title: "Online Marketplace",
    description: "Medical, laboratory and institutional supplies.",
    status: "coming-soon",
  },
];

/** Where a service entry points — its own page if it has one, else the enquiry form. */
export function serviceHref(service) {
  return service.href || "/#contact";
}
