import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAppAccess } from "@/lib/supabase/auth";
import { isFinanceAdmin } from "@/lib/crm/permissions";

export default async function RevenueLayout({ children }: { children: ReactNode }) {
  const access = await getAppAccess();

  if (!access) redirect("/");
  if (!isFinanceAdmin(access.role)) {
    redirect("/access-denied");
  }

  return children;
}
