import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ArrowRight, ArrowUpRight, BriefcaseBusiness, CalendarClock, CircleDollarSign, UsersRound } from "lucide-react";
import ProtectedRouteFallback from "@/components/dashboard/protected-route-fallback";
import { getAppAccess } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCrmPersonName, getRoleDisplayName } from "@/lib/crm/display-names";
import { isFinanceAdmin } from "@/lib/crm/permissions";

type DashboardLead = { id: string; name: string; vertical: string; status: string; followup: string | null; updated_at: string; owner: string | null };
type Collection = { amount: number | string | null };
type QueryValue = { data: unknown[] | null; count: number | null; error: { message: string } | null };
const money = (amount: number) => `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

async function DashboardContent() {
  await connection();
  const access = await getAppAccess();
  if (!access) redirect("/");
  if (!access.role) redirect("/access-denied");

  const supabase = await createClient();
  const isAdmin = isFinanceAdmin(access.role);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const { data: catalog, error: catalogError } = await supabase.from("business_verticals").select("name").eq("is_active", true).order("name");
  let verticals = (catalog ?? []).map((item) => item.name);
  let assignmentError = false;
  if (access.role === "employee") {
    const { data: assignments, error } = await supabase.from("profile_verticals").select("vertical_name").eq("profile_id", access.userId);
    assignmentError = Boolean(error);
    const permitted = new Set((assignments ?? []).map((item) => item.vertical_name));
    verticals = verticals.filter((vertical) => permitted.has(vertical));
  }
  const results = await Promise.allSettled([
    supabase.from("leads").select("id,name,vertical,status,followup,updated_at,owner").order("updated_at", { ascending: false }).limit(5),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("lifecycle", "active"),
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase.from("leads").select("id", { count: "exact", head: true }).lte("followup", today).neq("status", "Won").neq("status", "Lost"),
    ...verticals.map((vertical) => supabase.from("leads").select("id", { count: "exact", head: true }).eq("vertical", vertical)),
    ...(isAdmin ? [supabase.from("business_collections").select("amount")] : []),
  ]);
  const leadResult = results[0];
  const clientResult = results[1];
  const leadsCountResult = results[2];
  const dueResult = results[3];
  const leadRows = leadResult.status === "fulfilled" ? (leadResult.value.data ?? []) as DashboardLead[] : [];
  const leadError = leadResult.status !== "fulfilled" || Boolean((leadResult.value as QueryValue).error) || leadsCountResult.status !== "fulfilled" || Boolean((leadsCountResult.value as QueryValue).error);
  const clientError = clientResult.status !== "fulfilled" || Boolean((clientResult.value as QueryValue).error);
  const latest = leadRows;
  const totalLeads = leadsCountResult.status === "fulfilled" ? (leadsCountResult.value as QueryValue).count ?? 0 : 0;
  const dueFollowups = dueResult.status === "fulfilled" ? (dueResult.value as QueryValue).count ?? 0 : 0;
  const dueError = dueResult.status !== "fulfilled" || Boolean((dueResult.value as QueryValue).error);
  const verticalCounts = verticals.map((vertical, index) => {
    const result = results[4 + index];
    return { vertical, count: result.status === "fulfilled" ? (result.value as QueryValue).count ?? 0 : 0, failed: result.status !== "fulfilled" || Boolean((result.value as QueryValue).error) };
  });
  const verticalError = Boolean(catalogError) || assignmentError || verticalCounts.some((row) => row.failed);
  const maxVerticalCount = Math.max(...verticalCounts.map((row) => row.count), 1);
  const collectionResult = isAdmin ? results[4 + verticals.length] : null;
  const collections = collectionResult?.status === "fulfilled" ? (collectionResult.value.data ?? []) as Collection[] : [];
  const collectionError = Boolean(collectionResult && (collectionResult.status !== "fulfilled" || collectionResult.value.error));
  const collected = collections.reduce((total, row) => total + Number(row.amount ?? 0), 0);
  const name = getRoleDisplayName(access.role) || "there";

  return <main className="dashboard-home">
    <div className="dashboard-home__inner">
      <header className="welcome-header">
        <div><p className="eyebrow">WELANTERNS CAPITAL · GROUP WORKSPACE</p><h1>Good day, {name}</h1><p>Here’s your live overview across assigned business and client activity.</p></div>
        <Link className="button-primary" href="/dashboard/leads">Add a lead <ArrowRight size={17} /></Link>
      </header>

      <section className="overview-grid" aria-label="Business overview">
        <article className="overview-card"><div className="overview-card__icon"><BriefcaseBusiness size={19} /></div><p>Leads in view</p><strong>{leadError ? "Unavailable" : totalLeads.toLocaleString("en-IN")}</strong><Link href="/dashboard/leads">Open lead management <ArrowUpRight size={14} /></Link></article>
        <article className="overview-card"><div className="overview-card__icon overview-card__icon--gold"><UsersRound size={19} /></div><p>Active clients</p><strong>{clientError ? "Unavailable" : ((clientResult.value as QueryValue).count ?? 0).toLocaleString("en-IN")}</strong><Link href="/dashboard/clients">Open Client 360 <ArrowUpRight size={14} /></Link></article>
        <article className="overview-card"><div className="overview-card__icon overview-card__icon--gold"><CalendarClock size={19} /></div><p>Due / overdue follow-ups</p><strong>{dueError ? "Unavailable" : dueFollowups.toLocaleString("en-IN")}</strong><Link href="/dashboard/followups">Review follow-ups <ArrowUpRight size={14} /></Link></article>
        {isAdmin && <article className="overview-card"><div className="overview-card__icon"><CircleDollarSign size={19} /></div><p>Collections recorded</p><strong>{collectionError ? "Unavailable" : money(collected)}</strong><Link href="/dashboard/revenue">Open revenue <ArrowUpRight size={14} /></Link></article>}
      </section>

      <section className="dashboard-panels">
        <article className="workspace-panel">
          <div className="panel-heading"><div><h2>Business verticals</h2><p>Lead records currently visible to your account</p></div><Link href="/dashboard/reports">View reports <ArrowRight size={15} /></Link></div>
          {verticalError ? <div className="empty-state">Vertical summary is unavailable right now. Open Leads to review current records.</div> : <div className="vertical-bars">{verticalCounts.map(({ vertical, count }) => <div className="vertical-bar-row" key={vertical}><span>{vertical}</span><div className="vertical-bar-track"><i style={{ width: `${count === 0 ? 0 : Math.max(8, (count / maxVerticalCount) * 100)}%` }} /></div><strong>{count}</strong></div>)}</div>}
        </article>
        <article className="workspace-panel recent-panel">
          <div className="panel-heading"><div><h2>Recently updated opportunities</h2><p>Latest visible lead records</p></div><Link href="/dashboard/leads">All leads <ArrowRight size={15} /></Link></div>
          {leadError ? <div className="empty-state">Recent activity could not be loaded.</div> : latest.length === 0 ? <div className="empty-state">No lead activity yet. New opportunities will appear here.</div> : <ul className="recent-list">{latest.map((lead) => <li key={lead.id}><div className="recent-avatar">{lead.name.slice(0, 1).toUpperCase()}</div><div className="recent-copy"><strong>{lead.name}</strong><span>{lead.vertical} · {formatCrmPersonName(lead.owner) || "Unassigned"}</span></div><span className={`status-pill${lead.status === "Won" ? " status-pill--success" : lead.status === "Lost" ? " status-pill--muted" : ""}`}>{lead.status || "New"}</span></li>)}</ul>}
        </article>
      </section>
      <footer className="dashboard-home-footer">Live view based on records accessible to your signed-in role and existing Supabase policies.</footer>
    </div>
  </main>;
}

export default function DashboardPage() {
  return <Suspense fallback={<ProtectedRouteFallback />}><DashboardContent /></Suspense>;
}
