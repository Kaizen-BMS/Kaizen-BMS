import { apiRoute, json } from "@/lib/apiRoute";
import { resolveForm, FORM_TYPES } from "@/lib/forms";

export const dynamic = "force-dynamic";

// The field list (core + this hospital's owner-added fields) that any staff
// form should render.
export const GET = apiRoute("formtemplate:read", async (request, ctx) => {
  const { formType } = await ctx.params;
  if (!FORM_TYPES.includes(formType)) {
    return json({ error: "unknown_form_type" }, 404);
  }
  const form = await resolveForm(ctx.session.tenantId, formType);
  return json({ form });
});
