import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAppAccess } from "@/lib/supabase/auth";
import ProtectedRouteFallback from "@/components/dashboard/protected-route-fallback";
import ClientsClient from "./clients-client";

async function AuthenticatedClientsPage() {
  const access = await getAppAccess();

  if (!access) redirect("/");
  if (!access.role) redirect("/access-denied");

  return <ClientsClient userId={access.userId} role={access.role} />;
}

export default function ClientsPage() {
  return (
    <Suspense fallback={<ProtectedRouteFallback />}>
      <AuthenticatedClientsPage />
    </Suspense>
  );
}
