import OrganizationsClient from "./OrganizationsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Organizations" };

export default function Page() {
  return <OrganizationsClient />;
}
