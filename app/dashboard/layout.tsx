import { type ReactNode } from "react";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAppAccess } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardNavigation } from "@/components/dashboard/dashboard-navigation";

// This layout must finish authorization before any child page can be rendered.
export const instant = false;

async function AuthenticatedDashboardLayout({ children }: { children: ReactNode }) {
  const access = await getAppAccess();

  if (process.env.NODE_ENV === "development") {
    console.info("[auth] dashboard access decision", {
      serverRecognizedUser: Boolean(access),
      role: access?.role ?? null,
      redirectDestination: !access ? "/" : !access.role ? "/access-denied" : null,
    });
  }

  if (!access) redirect("/");
  if (!access.role) redirect("/access-denied");

  const supabase = await createClient();
  const { data: catalog, error: catalogError } = await supabase.from("business_verticals").select("name").eq("is_active", true).order("name");
  let verticals = catalogError ? [] : (catalog ?? []).map((item) => item.name);
  if (access.role === "employee") {
    const { data: assignments, error: assignmentError } = await supabase.from("profile_verticals").select("vertical_name").eq("profile_id", access.userId);
    const permitted = new Set(assignmentError ? [] : (assignments ?? []).map((item) => item.vertical_name));
    verticals = verticals.filter((vertical) => permitted.has(vertical));
  }

  return <div className="dashboard-frame">
    <DashboardNavigation role={access.role} verticals={verticals} />
    <div className="dashboard-content">{children}</div>
  </div>;
}

function DashboardLoading() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
    <p role="status" className="rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-600 shadow-sm">
      Loading secure workspace…
    </p>
  </main>;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<DashboardLoading />}>
    <AuthenticatedDashboardLayout>{children}</AuthenticatedDashboardLayout>
  </Suspense>;
}
