import { redirect } from "next/navigation";
import { getAppAccess } from "@/lib/supabase/auth";
import UsersClient from "./users-client";

export default async function UsersPage() {
  const access = await getAppAccess();
  if (!access) redirect("/");
  if (access.role !== "super_admin" && access.role !== "group_admin") redirect("/access-denied");
  return <UsersClient userId={access.userId} role={access.role} />;
}
