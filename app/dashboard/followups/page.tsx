import { redirect } from "next/navigation";
import { getAppAccess } from "@/lib/supabase/auth";
import FollowupsClient from "./followups-client";

export default async function FollowupsPage() {
  const access = await getAppAccess();
  if (!access) redirect("/");
  if (!access.role) redirect("/access-denied");
  return <FollowupsClient userId={access.userId} role={access.role} />;
}
