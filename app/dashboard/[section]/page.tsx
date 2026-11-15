import { notFound, redirect } from "next/navigation";
import { getAppAccess } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const sectionVerticals: Record<string, string> = {
  capital: "WeLanterns Capital",
  media: "WeLanterns Media",
  tradestambh: "TradeStambh",
  "private-equity": "Private Equity",
  "sme-advisory": "SME Advisory",
  "loans-credit": "Loans & Credit Solutions",
  operations: "Group Operations",
};

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const vertical = sectionVerticals[section];
  if (!vertical) notFound();
  const access = await getAppAccess();
  if (!access) redirect("/");
  if (!access.role) redirect("/access-denied");
  const supabase = await createClient();
  const { data: activeVertical, error: catalogError } = await supabase.from("business_verticals").select("name").eq("name", vertical).eq("is_active", true).maybeSingle();
  if (catalogError || !activeVertical) redirect("/dashboard");
  if (access.role === "employee") {
    const { data: assignment, error } = await supabase.from("profile_verticals").select("id").eq("profile_id", access.userId).eq("vertical_name", vertical).maybeSingle();
    if (error || !assignment) redirect("/access-denied");
  }
  redirect(`/dashboard/leads?vertical=${encodeURIComponent(vertical)}`);
}
