import { apiRoute, json } from "@/lib/apiRoute";
import { categoriesFor, requiredCategories, SERVICE_LABEL, SERVICE_DEFAULT_PURPOSE } from "@/lib/partnerCatalog";

export const dynamic = "force-dynamic";

export const GET = apiRoute("partner:manage", async () => {
  const services = {};
  for (const s of ["LAB", "PHARMACY", "REFERRAL"]) {
    services[s] = {
      label: SERVICE_LABEL[s],
      defaultPurpose: SERVICE_DEFAULT_PURPOSE[s],
      categories: categoriesFor(s),
      requiredCategories: requiredCategories(s),
    };
  }
  return json({ services });
});
