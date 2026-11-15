import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAppAccess } from "@/lib/supabase/auth";
import ProtectedRouteFallback from "@/components/dashboard/protected-route-fallback";
import LeadsClient from "./leads-client";

type LeadsPageProps = { searchParams: Promise<{ vertical?: string | string[]; followup?: string | string[] }> };

async function AuthenticatedLeadsPage({ searchParams }: LeadsPageProps) {
  const access = await getAppAccess();
  const params = await searchParams;

  if (!access) redirect("/");
  if (!access.role) redirect("/access-denied");

  return (
    <LeadsClient
      userId={access.userId}
      userEmail={access.email}
      role={access.role}
      initialVertical={typeof params.vertical === "string" ? params.vertical : "All"}
      initialFollowup={typeof params.followup === "string" ? params.followup : "All"}
    />
  );
}

export default function LeadsPage(props: LeadsPageProps) {
  return <Suspense fallback={<ProtectedRouteFallback />}><AuthenticatedLeadsPage {...props} /></Suspense>;
}
