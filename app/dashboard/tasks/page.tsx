import { redirect } from "next/navigation";
import { getAppAccess } from "@/lib/supabase/auth";
import TasksClient from "./tasks-client";

export default async function TasksPage() {
  const access = await getAppAccess();
  if (!access) redirect("/");
  if (!access.role) redirect("/access-denied");
  return <TasksClient userId={access.userId} role={access.role} />;
}
