import PrintDesigner from "@/components/hms/PrintDesigner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Print designer" };

export default async function Page({ searchParams }) {
  const { doc } = await searchParams;
  return <PrintDesigner doc={doc === "invoice" ? "invoice" : "slip"} />;
}
