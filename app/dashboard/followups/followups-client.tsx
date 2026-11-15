"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatLeadDate, getFollowupState, type Lead, type LeadRole } from "@/lib/crm/leads";
import { useCrmVerticals } from "@/lib/crm/use-verticals";
import { formatCrmPersonName, getProfileDisplayName } from "@/lib/crm/display-names";

const inputClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100";
const todayIndia = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const localDateTime = () => {
  const value = new Date();
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
};

type CRMFollowup = {
  id: string; title: string; description: string | null; vertical: string;
  lead_id: string | null; client_id: string | null; assigned_to: string;
  due_at: string; status: "pending" | "completed" | "cancelled"; completed_at: string | null;
};

export default function FollowupsClient({ userId, role }: { userId: string; role: LeadRole }) {
  const supabase = useMemo(() => createClient(), []);
  const verticals = useCrmVerticals(userId, role);
  const [rows, setRows] = useState<Lead[]>([]);
  const [independentRows, setIndependentRows] = useState<CRMFollowup[]>([]);
  const [independentReady, setIndependentReady] = useState(false);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string; role: LeadRole }[]>([]);
  const [verticalAssignments, setVerticalAssignments] = useState<{ profile_id: string; vertical_name: string }[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string; primary_vertical: string; verticals: string[]; owner_id: string | null }[]>([]);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("Due today");
  const [activityFilter, setActivityFilter] = useState("open");
  const [leadSearch, setLeadSearch] = useState("");
  const [leadVertical, setLeadVertical] = useState("");
  const [reminderSearch, setReminderSearch] = useState("");
  const [reminderVertical, setReminderVertical] = useState("");
  const [editingFollowupId, setEditingFollowupId] = useState<string | null>(null);
  const [form, setForm] = useState({ lead_id: "", client_id: "", vertical: "", title: "", description: "", due_at: "", assigned_to: userId, status: "pending" as CRMFollowup["status"] });
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const isAdmin = role === "super_admin" || role === "group_admin";

  useEffect(() => {
    const timer = window.setTimeout(() => setToday(todayIndia()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [result, followupResult, profileResult, clientResult, clientVerticalResult, assignmentResult] = await Promise.all([
      supabase.from("leads").select("*").order("followup", { ascending: true, nullsFirst: false }),
      supabase.from("crm_followups").select("*").order("due_at", { ascending: true }),
      supabase.from("profiles").select("id,full_name,role").order("full_name"),
      supabase.from("clients").select("id,name,primary_vertical,owner_id").order("name"),
      supabase.from("client_verticals").select("client_id,vertical_name"),
      supabase.from("profile_verticals").select("profile_id,vertical_name"),
    ]);
    if (result.error) setError(`Could not load follow-ups: ${result.error.message}`);
    else setRows((result.data ?? []) as Lead[]);
    if (followupResult.error) {
      setIndependentReady(false);
      if (followupResult.error.code !== "PGRST205" && followupResult.error.code !== "42P01") {
        setError(`Independent reminders are unavailable under the current account permissions: ${followupResult.error.message}`);
      }
    } else {
      setIndependentReady(true);
      setIndependentRows((followupResult.data ?? []) as CRMFollowup[]);
    }
    if (profileResult.error) setError(`Reminder assignee options could not be loaded: ${profileResult.error.message}`);
    else setProfiles(profileResult.data ?? []);
    if (!clientResult.error && !clientVerticalResult.error) {
      const memberships = new Map<string, string[]>();
      for (const membership of clientVerticalResult.data ?? []) memberships.set(membership.client_id, [...(memberships.get(membership.client_id) ?? []), membership.vertical_name]);
      setClients((clientResult.data ?? []).map((client) => ({ ...client, verticals: Array.from(new Set([client.primary_vertical, ...(memberships.get(client.id) ?? [])])) })));
    } else if (clientResult.error) setError(`Clients could not be loaded: ${clientResult.error.message}`);
    else if (clientVerticalResult.error) setError(`Client vertical relationships could not be loaded: ${clientVerticalResult.error.message}`);
    if (assignmentResult.error) {
      setVerticalAssignments([]);
      setError(`Employee vertical assignments could not be loaded: ${assignmentResult.error.message}`);
    } else setVerticalAssignments(assignmentResult.data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visible = rows.filter((lead) => (filter === "All" || getFollowupState(lead, today) === filter)
    && (!leadVertical || lead.vertical === leadVertical)
    && (!leadSearch.trim() || [lead.name, lead.phone, lead.email, lead.product, lead.source].some((value) => String(value || "").toLocaleLowerCase().includes(leadSearch.trim().toLocaleLowerCase()))));
  const ownerNames = useMemo(() => new Map(profiles.map((profile) => [profile.id, getProfileDisplayName(profile, userId)])), [profiles, userId]);
  const leadNames = useMemo(() => new Map(rows.map((lead) => [lead.id, lead.name])), [rows]);
  const clientNames = useMemo(() => new Map(clients.map((client) => [client.id, client.name])), [clients]);
  const visibleIndependent = independentRows.filter((item) => (activityFilter === "all"
    || (activityFilter === "open" ? item.status === "pending" : item.status === activityFilter))
    && (!reminderVertical || item.vertical === reminderVertical)
    && (!reminderSearch.trim() || [item.title, item.description, leadNames.get(item.lead_id || ""), clientNames.get(item.client_id || "")].some((value) => String(value || "").toLocaleLowerCase().includes(reminderSearch.trim().toLocaleLowerCase()))));

  const selectedParent = rows.find((item) => item.id === form.lead_id);
  const selectedClient = clients.find((item) => item.id === form.client_id);
  const formVertical = selectedParent?.vertical || (selectedClient?.verticals.includes(form.vertical) ? form.vertical : selectedClient?.primary_vertical) || form.vertical;
  const eligibleAssignees = profiles.filter((profile) => profile.role !== "employee"
    || verticalAssignments.some((assignment) => assignment.profile_id === profile.id && assignment.vertical_name === formVertical));

  async function saveDate(lead: Lead) {
    setSavingId(lead.id);
    setMessage("");
    setError("");
    const { data, error: saveError } = await supabase.from("leads").update({ followup: dates[lead.id] || null }).eq("id", lead.id).select("id").maybeSingle();
    if (saveError || !data) setError(`Could not update the follow-up: ${saveError?.message || "The record was not changed under the current account permissions."}`);
    else {
      setMessage(`Follow-up updated for ${lead.name}.`);
      await load();
    }
    setSavingId("");
  }

  async function createFollowup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const lead = rows.find((item) => item.id === form.lead_id);
    const client = clients.find((item) => item.id === form.client_id);
    const due = new Date(form.due_at);
    const selectedVertical = lead?.vertical || form.vertical || client?.primary_vertical || "";
    if ((!lead && !client) || (lead && client) || !form.title.trim() || Number.isNaN(due.getTime()) || !verticals.includes(selectedVertical)) {
      setError("Choose one permitted lead or client, enter a title, and provide a valid reminder time.");
      return;
    }
    if (client && !client.verticals.includes(selectedVertical)) { setError("Choose a vertical linked to the selected client."); return; }
    if (isAdmin && !eligibleAssignees.some((profile) => profile.id === form.assigned_to)) { setError("Choose an assignee who is permitted to work in the selected vertical."); return; }
    setSaving(true);
    const payload = {
      title: form.title.trim(), description: form.description.trim() || null,
      vertical: selectedVertical, lead_id: lead?.id || null, client_id: client?.id || null,
      assigned_to: isAdmin ? form.assigned_to : userId, due_at: due.toISOString(),
      status: form.status, completed_at: form.status === "completed" ? new Date().toISOString() : null,
      ...(!editingFollowupId ? { created_by: userId } : {}),
    };
    const query = editingFollowupId
      ? supabase.from("crm_followups").update(payload).eq("id", editingFollowupId)
      : supabase.from("crm_followups").insert(payload);
    const { data, error: createError } = await query.select("id").maybeSingle();
    if (createError || !data?.id) setError(`Could not ${editingFollowupId ? "update" : "create"} reminder: ${createError?.message || "The database did not confirm the saved row."}`);
    else {
      setMessage(editingFollowupId ? "Independent follow-up updated." : "Independent follow-up saved.");
      setEditingFollowupId(null);
      setForm({ lead_id: "", client_id: "", vertical: verticals[0] || "", title: "", description: "", due_at: localDateTime(), assigned_to: userId, status: "pending" });
      await load();
    }
    setSaving(false);
  }

  function editFollowup(item: CRMFollowup) {
    setEditingFollowupId(item.id);
    const due = new Date(item.due_at);
    due.setMinutes(due.getMinutes() - due.getTimezoneOffset());
    setForm({ lead_id: item.lead_id || "", client_id: item.client_id || "", vertical: item.vertical, title: item.title, description: item.description || "", due_at: due.toISOString().slice(0, 16), assigned_to: item.assigned_to, status: item.status });
  }

  async function updateFollowup(item: CRMFollowup, status: CRMFollowup["status"]) {
    setSavingId(item.id);
    setError("");
    setMessage("");
    const { data, error: updateError } = await supabase.from("crm_followups").update({
      status, completed_at: status === "completed" ? new Date().toISOString() : null,
    }).eq("id", item.id).select("id").maybeSingle();
    if (updateError || !data) setError(`Could not update reminder: ${updateError?.message || "The record was not changed under the current account permissions."}`);
    else { setMessage("Reminder status updated."); await load(); }
    setSavingId("");
  }

  return <main className="min-h-screen bg-slate-50 p-4 md:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-blue-700">WeLanterns Capital Advisory Pvt. Ltd.</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Follow-ups</h1><p className="mt-2 text-sm text-slate-600">Schedule and review follow-up dates on leads visible to your account.</p></div><Link href="/dashboard/leads" className="rounded-lg bg-[#14234f] px-4 py-2.5 text-sm font-semibold text-white">Open Leads</Link></header>
    {!loading && !independentReady && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Existing lead follow-up dates remain available. Independent reminders are unavailable under the current account permissions.</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}{message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold text-slate-900">Lead follow-up queue</h2><label className="flex items-center gap-2 text-sm">Show<select className={inputClass} value={filter} onChange={(e) => setFilter(e.target.value)}>{["All", "Due today", "Overdue", "Upcoming", "Unscheduled", "Completed"].map((item) => <option key={item}>{item}</option>)}</select></label></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><input aria-label="Search lead follow-ups" className={inputClass} placeholder="Search lead, phone, product…" value={leadSearch} onChange={(event) => setLeadSearch(event.target.value)} /><select aria-label="Filter lead follow-ups by vertical" className={inputClass} value={leadVertical} onChange={(event) => setLeadVertical(event.target.value)}><option value="">All available verticals</option>{verticals.map((vertical) => <option key={vertical}>{vertical}</option>)}</select></div>
      {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading follow-ups…</p> : visible.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No {filter.toLowerCase()} follow-ups found in records visible to you.</p> : <div className="mt-4 divide-y divide-slate-100">{visible.map((lead) => <article key={lead.id} className="grid gap-3 py-4 md:grid-cols-[1fr_auto] md:items-center"><div><h3 className="font-semibold text-slate-900">{lead.name} <span className="font-normal text-slate-500">· {lead.product || lead.vertical}</span></h3><p className="mt-1 text-sm text-slate-600">{formatLeadDate(lead.followup)} · {getFollowupState(lead, today)} · {lead.status}</p>{isAdmin && <p className="mt-1 text-xs text-slate-500">Assigned to {ownerNames.get(lead.owner_id || "") || formatCrmPersonName(lead.owner) || "Unassigned"}</p>}</div><div className="flex flex-wrap items-center gap-2"><input aria-label={`New follow-up date for ${lead.name}`} type="date" className={inputClass} value={dates[lead.id] ?? lead.followup ?? ""} onChange={(e) => setDates((current) => ({ ...current, [lead.id]: e.target.value }))} /><button type="button" disabled={savingId === lead.id} onClick={() => void saveDate(lead)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">{savingId === lead.id ? "Saving…" : "Save date"}</button><Link href={`/dashboard/leads?edit=${encodeURIComponent(lead.id)}`} className="px-2 py-2 text-sm font-semibold text-blue-700">Edit lead</Link></div></article>)}</div>}
    </section>
    {independentReady && <>
      <form onSubmit={createFollowup} className="rounded-xl border border-slate-200 bg-white p-4 md:p-5"><h2 className="font-semibold text-slate-900">Schedule independent reminder</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm font-medium">Related lead (optional)<select className={inputClass} value={form.lead_id} onChange={(event) => { const lead = rows.find((item) => item.id === event.target.value); setForm({ ...form, lead_id: event.target.value, client_id: "", vertical: lead?.vertical || form.vertical }); }}><option value="">No linked lead</option>{rows.filter((lead) => verticals.includes(lead.vertical)).map((lead) => <option key={lead.id} value={lead.id}>{lead.name} · {lead.vertical}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-medium">Related client (optional)<select className={inputClass} value={form.client_id} onChange={(event) => { const client = clients.find((item) => item.id === event.target.value); const vertical = client?.verticals.find((value) => verticals.includes(value)) || form.vertical; setForm({ ...form, client_id: event.target.value, lead_id: "", vertical }); }}><option value="">No linked client</option>{clients.filter((client) => client.verticals.some((vertical) => verticals.includes(vertical))).map((client) => <option key={client.id} value={client.id}>{client.name} · {client.verticals.filter((vertical) => verticals.includes(vertical)).join(", ")}</option>)}</select></label>
        {!form.lead_id && <label className="grid gap-1 text-sm font-medium">Vertical<select required className={inputClass} value={form.vertical} onChange={(event) => setForm({ ...form, vertical: event.target.value })}>{verticals.map((vertical) => <option key={vertical}>{vertical}</option>)}</select></label>}
        <label className="grid gap-1 text-sm font-medium">Title<input required maxLength={180} className={inputClass} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label className="grid gap-1 text-sm font-medium">Due time<input required type="datetime-local" className={inputClass} value={form.due_at} onChange={(event) => setForm({ ...form, due_at: event.target.value })} /></label>
        {isAdmin && <label className="grid gap-1 text-sm font-medium">Assigned to<select required className={inputClass} value={form.assigned_to} onChange={(event) => setForm({ ...form, assigned_to: event.target.value })}>{eligibleAssignees.map((profile) => <option key={profile.id} value={profile.id}>{getProfileDisplayName(profile, userId)} · {profile.role.replaceAll("_", " ")}</option>)}</select></label>}
        {editingFollowupId && <label className="grid gap-1 text-sm font-medium">Status<select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as CRMFollowup["status"] })}>{["pending", "completed", "cancelled"].map((status) => <option key={status} value={status}>{status}</option>)}</select></label>}
        <label className="grid gap-1 text-sm font-medium sm:col-span-2 lg:col-span-4">Notes<textarea maxLength={4000} rows={2} className={inputClass} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      </div><div className="mt-4 flex gap-2"><button disabled={saving || (!editingFollowupId && !form.lead_id && !form.client_id)} className="rounded-lg bg-[#14234f] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : editingFollowupId ? "Save reminder" : "Schedule reminder"}</button>{editingFollowupId && <button type="button" onClick={() => { setEditingFollowupId(null); setForm({ lead_id: "", client_id: "", vertical: verticals[0] || "", title: "", description: "", due_at: localDateTime(), assigned_to: userId, status: "pending" }); }} className="rounded-lg border px-4 py-2.5 text-sm">Cancel edit</button>}</div></form>
      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold text-slate-900">Reminder activity</h2><label className="flex items-center gap-2 text-sm">Show<select className={inputClass} value={activityFilter} onChange={(event) => setActivityFilter(event.target.value)}><option value="open">Open</option><option value="all">All</option><option value="pending">Pending</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><input aria-label="Search reminders" className={inputClass} placeholder="Search reminders…" value={reminderSearch} onChange={(event) => setReminderSearch(event.target.value)} /><select aria-label="Filter reminders by vertical" className={inputClass} value={reminderVertical} onChange={(event) => setReminderVertical(event.target.value)}><option value="">All available verticals</option>{verticals.map((vertical) => <option key={vertical}>{vertical}</option>)}</select></div>
        {visibleIndependent.length === 0 ? <p className="py-7 text-center text-sm text-slate-500">No reminders match this view.</p> : <div className="mt-3 divide-y divide-slate-100">{visibleIndependent.map((item) => <article key={item.id} className="grid gap-3 py-4 md:grid-cols-[1fr_auto] md:items-center"><div><h3 className="font-semibold text-slate-900">{item.title}</h3><p className="mt-1 text-sm text-slate-600">{item.vertical} · {item.status} · {leadNames.get(item.lead_id || "") || clientNames.get(item.client_id || "") || "Linked CRM record"}</p><p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(item.due_at))} · Assigned to {ownerNames.get(item.assigned_to) || "Account"}</p>{item.description && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.description}</p>}</div><div className="flex flex-wrap gap-2">{item.status === "pending" && <button type="button" disabled={savingId === item.id} onClick={() => void updateFollowup(item, "completed")} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Complete</button>}{item.status === "pending" && <button type="button" disabled={savingId === item.id} onClick={() => void updateFollowup(item, "cancelled")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">Cancel reminder</button>}<button type="button" onClick={() => editFollowup(item)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Edit</button></div></article>)}</div>}
      </section>
    </>}
    <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5"><h2 className="font-semibold text-slate-900">Tasks</h2><p className="mt-2 text-sm text-slate-600">Tasks are managed separately from reminders, with independent deadlines, status, priority and assignment.</p><Link href="/dashboard/tasks" className="mt-3 inline-block text-sm font-semibold text-blue-700">Open task board →</Link></section>
  </div></main>;
}
