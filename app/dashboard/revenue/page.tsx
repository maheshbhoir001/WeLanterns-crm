import { redirect } from "next/navigation";
import { getAppAccess } from "@/lib/supabase/auth";
import RevenueClient from "./revenue-client";

export default async function RevenuePage() {
  const access = await getAppAccess();
  if (!access?.role) redirect("/");
  if (access.role === "employee") redirect("/dashboard");
  return <RevenueClient userId={access.userId} role={access.role} />;
}
