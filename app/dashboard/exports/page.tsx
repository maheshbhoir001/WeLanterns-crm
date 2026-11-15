import ExportsClient from "./exports-client";
import { redirect } from "next/navigation";
import { getAppAccess } from "@/lib/supabase/auth";

export default async function ExportsPage() {
  const access = await getAppAccess();
  if (!access?.role) redirect("/");
  return <ExportsClient userId={access.userId} role={access.role} />;
}
