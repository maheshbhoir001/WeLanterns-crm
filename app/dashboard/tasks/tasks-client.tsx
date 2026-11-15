"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCrmVerticals } from "@/lib/crm/use-verticals";
import type { LeadProfile, LeadRole } from "@/lib/crm/leads";
import { getProfileDisplayName } from "@/lib/crm/display-names";

type Task = {
  id: string;
  title: string;
  description: string | null;
  vertical: string;
  lead_id: string | null;
  client_id: string | null;
  assigned_to: string;
  created_by: string;
  due_at: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  completed_at: string | null;
};
type Activity = { activity_id: number; action: string; entity: string; entity_id: string; occurred_at: string };

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100";
const nowLocal = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

export default function TasksClient({ userId, role }: { userId: string; role: LeadRole }) {
  const supabase = useMemo(() => createClient(), []);
  const verticals = useCrmVerticals(userId, role);
  const isAdmin = role === "super_admin" || role === "group_admin";
  const [rows, setRows] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<LeadProfile[]>([]);
  const [verticalAssignments, setVerticalAssignments] = useState<{ profile_id: string; vertical_name: string }[]>([]);
  const [leads, setLeads] = useState<{ id: string; name: string; vertical: string; owner_id: string | null }[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string; primary_vertical: string; verticals: string[]; owner_id: string | null }[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [activityAvailable, setActivityAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [schemaReady, setSchemaReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("open");
  const [verticalFilter, setVerticalFilter] = useState("all");
  const [taskSearch, setTaskSearch] = useState("");
  const [dueBefore, setDueBefore] = useState("");
  const [dueAfter, setDueAfter] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    title: "", description: "", vertical: "WeLanterns Capital", lead_id: "", client_id: "",
    assigned_to: userId, due_at: "", priority: "normal" as Task["priority"], status: "pending" as Task["status"],
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [tasksResult, profileResult, leadResult, assignmentResult, clientResult, clientVerticalResult, activityResult] = await Promise.all([
      supabase.from("crm_tasks").select("*").order("due_at", { ascending: true }),
      supabase.from("profiles").select("id,full_name,email,role").order("full_name"),
      supabase.from("leads").select("id,name,vertical,owner_id").order("name"),
      supabase.from("profile_verticals").select("profile_id,vertical_name"),
      supabase.from("clients").select("id,name,primary_vertical,owner_id").order("name"),
      supabase.from("client_verticals").select("client_id,vertical_name"),
      supabase.rpc("get_my_crm_activity"),
    ]);
    if (tasksResult.error) {
      setSchemaReady(false);
      const missing = tasksResult.error.code === "PGRST205" || tasksResult.error.code === "42P01";
      if (!missing) setError(`Tasks could not be loaded under the current account permissions: ${tasksResult.error.message}`);
    } else {
      setSchemaReady(true);
      setRows((tasksResult.data ?? []) as Task[]);
    }
    if (profileResult.error) setError(`Task assignee options could not be loaded: ${profileResult.error.message}`);
    else setProfiles((profileResult.data ?? []) as LeadProfile[]);
    if (!leadResult.error) setLeads(leadResult.data ?? []);
    if (assignmentResult.error) {
      setVerticalAssignments([]);
      setError(`Employee vertical assignments could not be loaded: ${assignmentResult.error.message}`);
    } else setVerticalAssignments(assignmentResult.data ?? []);
    if (!clientResult.error) {
      const memberships = new Map<string, string[]>();
      if (clientVerticalResult.error) {
        setError(`Client vertical relationships could not be loaded: ${clientVerticalResult.error.message}`);
      } else {
        for (const membership of clientVerticalResult.data ?? []) {
          memberships.set(membership.client_id, [...(memberships.get(membership.client_id) ?? []), membership.vertical_name]);
        }
      }
      setClients((clientResult.data ?? []).map((client) => ({
        ...client,
        verticals: Array.from(new Set([client.primary_vertical, ...(memberships.get(client.id) ?? [])])),
      })));
    }
    if (!activityResult.error) { setActivityAvailable(true); setActivity((activityResult.data ?? []) as Activity[]); }
    else setActivityAvailable(false);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!editingId && verticals.length && !verticals.includes(form.vertical)) {
      const timer = window.setTimeout(() => setForm((current) => ({ ...current, vertical: verticals[0] })), 0);
      return () => window.clearTimeout(timer);
    }
  }, [editingId, form.vertical, verticals]);

  const ownerNames = useMemo(() => new Map(profiles.map((profile) => [profile.id, getProfileDisplayName(profile, userId)])), [profiles, userId]);
  const visibleRows = useMemo(() => rows.filter((task) => (statusFilter === "all"
    || (statusFilter === "open" ? task.status === "pending" || task.status === "in_progress" : task.status === statusFilter))
    && (verticalFilter === "all" || task.vertical === verticalFilter)
    && (!dueAfter || task.due_at.slice(0, 10) >= dueAfter)
    && (!dueBefore || task.due_at.slice(0, 10) <= dueBefore)
    && (!taskSearch.trim() || [task.title, task.description, ownerNames.get(task.assigned_to)].some((value) => String(value || "").toLocaleLowerCase().includes(taskSearch.trim().toLocaleLowerCase())))), [rows, ownerNames, statusFilter, verticalFilter, dueAfter, dueBefore, taskSearch]);
  const eligibleAssignees = profiles.filter((profile) => profile.role !== "employee"
    || verticalAssignments.some((assignment) => assignment.profile_id === profile.id && assignment.vertical_name === form.vertical));

  function resetForm() {
    setForm({ title: "", description: "", vertical: verticals[0] || "WeLanterns Capital", lead_id: "", client_id: "", assigned_to: userId, due_at: nowLocal(), priority: "normal", status: "pending" });
    setEditingId(null);
  }

  function edit(task: Task) {
    setEditingId(task.id);
    const due = new Date(task.due_at);
    due.setMinutes(due.getMinutes() - due.getTimezoneOffset());
    setForm({ title: task.title, description: task.description || "", vertical: task.vertical, lead_id: task.lead_id || "", client_id: task.client_id || "", assigned_to: task.assigned_to, due_at: due.toISOString().slice(0, 16), priority: task.priority, status: task.status });
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const due = new Date(form.due_at);
    if (!form.title.trim() || Number.isNaN(due.getTime()) || !verticals.includes(form.vertical)) {
      setError("Enter a task title, valid deadline, and active business vertical.");
      return;
    }
    if (form.lead_id && !leads.some((lead) => lead.id === form.lead_id && lead.vertical === form.vertical)) {
      setError("Choose a lead that belongs to the selected vertical.");
      return;
    }
    if (form.client_id && !clients.some((client) => client.id === form.client_id && client.verticals.includes(form.vertical))) {
      setError("Choose a client that is assigned to the selected vertical.");
      return;
    }
    if (isAdmin && !eligibleAssignees.some((profile) => profile.id === form.assigned_to)) {
      setError("Choose an assignee who is permitted to work in the selected vertical.");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(), description: form.description.trim() || null,
      vertical: form.vertical, lead_id: form.lead_id || null, client_id: form.client_id || null,
      assigned_to: isAdmin ? form.assigned_to : userId,
      due_at: due.toISOString(), priority: form.priority, status: form.status,
      completed_at: form.status === "completed" ? new Date().toISOString() : null,
      ...(!editingId ? { created_by: userId } : {}),
    };
    const result = editingId
      ? await supabase.from("crm_tasks").update(payload).eq("id", editingId).select("id").single()
      : await supabase.from("crm_tasks").insert(payload).select("id").single();
    if (result.error) setError(`Task was not saved: ${result.error.message}`);
    else {
      setNotice(editingId ? "Task updated." : "Task created.");
      resetForm();
      await load();
    }
    setSaving(false);
  }

  async function updateStatus(task: Task, status: Task["status"]) {
    setError("");
    setNotice("");
    const { data, error: updateError } = await supabase.from("crm_tasks").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", task.id).select("id").maybeSingle();
    if (updateError || !data) setError(`Task status was not updated: ${updateError?.message || "The record was not changed under the current account permissions."}`);
    else { setNotice("Task status updated."); await load(); }
  }

  return <main className="min-h-screen bg-slate-50 p-4 md:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-blue-700">WeLanterns Capital Advisory Pvt. Ltd.</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Tasks</h1><p className="mt-2 text-sm text-slate-600">Independent assignments with owners, deadlines, status and priority.</p></div><Link href="/dashboard/followups" className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Open follow-ups</Link></header>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!schemaReady && !loading && <section className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950"><h2 className="font-semibold">Task storage is unavailable</h2><p className="mt-2">The task table could not be read for this account. Check the error above or ask an administrator to verify database access.</p><Link className="mt-3 inline-block font-semibold text-blue-800" href="/dashboard/followups">Manage existing lead follow-up dates</Link></section>}
    {!loading && !verticals.length && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">No active verticals are assigned to this account. Ask an administrator to grant access before creating or assigning work.</p>}
    {schemaReady && <>
      <form onSubmit={save} className="rounded-xl border border-slate-200 bg-white p-4 md:p-6"><h2 className="text-lg font-semibold">{editingId ? "Edit task" : "Create task"}</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium">Title<input required maxLength={180} className={inputClass} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label className="grid gap-1 text-sm font-medium">Vertical<select className={inputClass} value={form.vertical} onChange={(event) => { const vertical = event.target.value; const nextAssignees = profiles.filter((profile) => profile.role !== "employee" || verticalAssignments.some((assignment) => assignment.profile_id === profile.id && assignment.vertical_name === vertical)); setForm({ ...form, vertical, lead_id: leads.some((lead) => lead.id === form.lead_id && lead.vertical === vertical) ? form.lead_id : "", client_id: clients.some((client) => client.id === form.client_id && client.verticals.includes(vertical)) ? form.client_id : "", assigned_to: nextAssignees.some((profile) => profile.id === form.assigned_to) ? form.assigned_to : nextAssignees[0]?.id || userId }); }}>{verticals.map((vertical) => <option key={vertical}>{vertical}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-medium">Deadline<input required type="datetime-local" className={inputClass} value={form.due_at} onChange={(event) => setForm({ ...form, due_at: event.target.value })} /></label>
        {isAdmin && <label className="grid gap-1 text-sm font-medium">Assigned to<select className={inputClass} value={form.assigned_to} onChange={(event) => setForm({ ...form, assigned_to: event.target.value })}>{eligibleAssignees.map((profile) => <option key={profile.id} value={profile.id}>{getProfileDisplayName(profile, userId)} · {profile.role.replaceAll("_", " ")}</option>)}</select></label>}
        <label className="grid gap-1 text-sm font-medium">Related lead (optional)<select className={inputClass} value={form.lead_id} onChange={(event) => { const lead = leads.find((row) => row.id === event.target.value); if (!lead) { setForm({ ...form, lead_id: "" }); return; } const nextAssignees = profiles.filter((profile) => profile.role !== "employee" || verticalAssignments.some((assignment) => assignment.profile_id === profile.id && assignment.vertical_name === lead.vertical)); setForm({ ...form, lead_id: event.target.value, client_id: "", vertical: lead.vertical, assigned_to: nextAssignees.some((profile) => profile.id === form.assigned_to) ? form.assigned_to : nextAssignees[0]?.id || userId }); }}><option value="">No linked lead</option>{leads.filter((lead) => lead.vertical === form.vertical).map((lead) => <option key={lead.id} value={lead.id}>{lead.name} · {lead.vertical}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-medium">Related client (optional)<select className={inputClass} value={form.client_id} onChange={(event) => { const client = clients.find((row) => row.id === event.target.value); if (!client) { setForm({ ...form, client_id: "" }); return; } const vertical = client.verticals.includes(form.vertical) ? form.vertical : client.primary_vertical; const nextAssignees = profiles.filter((profile) => profile.role !== "employee" || verticalAssignments.some((assignment) => assignment.profile_id === profile.id && assignment.vertical_name === vertical)); setForm({ ...form, client_id: event.target.value, lead_id: "", vertical, assigned_to: nextAssignees.some((profile) => profile.id === form.assigned_to) ? form.assigned_to : nextAssignees[0]?.id || userId }); }}><option value="">No linked client</option>{clients.filter((client) => client.verticals.includes(form.vertical)).map((client) => <option key={client.id} value={client.id}>{client.name} · {form.vertical}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-medium">Priority<select className={inputClass} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Task["priority"] })}>{["low", "normal", "high", "urgent"].map((priority) => <option key={priority}>{priority}</option>)}</select></label>
        {editingId && <label className="grid gap-1 text-sm font-medium">Status<select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Task["status"] })}>{["pending", "in_progress", "completed", "cancelled"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>}
        <label className="grid gap-1 text-sm font-medium sm:col-span-2 lg:col-span-3">Details<textarea maxLength={4000} rows={3} className={inputClass} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      </div><div className="mt-4 flex gap-2"><button disabled={saving} className="rounded-lg bg-[#14234f] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : editingId ? "Save task" : "Create task"}</button>{editingId && <button type="button" onClick={resetForm} className="rounded-lg border px-4 py-2 text-sm">Cancel edit</button>}</div></form>
      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Task board</h2><button type="button" onClick={() => void load()} className="rounded-lg border px-3 py-2 text-sm font-semibold">Refresh</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><input aria-label="Search tasks" className={inputClass} placeholder="Search task or assignee…" value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} /><select aria-label="Filter task status" className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="open">Open</option><option value="all">All statuses</option>{["pending", "in_progress", "completed", "cancelled"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select><select aria-label="Filter task vertical" className={inputClass} value={verticalFilter} onChange={(event) => setVerticalFilter(event.target.value)}><option value="all">All verticals</option>{verticals.map((vertical) => <option key={vertical} value={vertical}>{vertical}</option>)}</select><label className="grid gap-1 text-xs text-slate-600">Due from<input aria-label="Tasks due from" type="date" className={inputClass} value={dueAfter} onChange={(event) => setDueAfter(event.target.value)} /></label><label className="grid gap-1 text-xs text-slate-600">Due through<input aria-label="Tasks due through" type="date" className={inputClass} value={dueBefore} onChange={(event) => setDueBefore(event.target.value)} /></label></div>
        {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading tasks…</p> : visibleRows.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No tasks match this view.</p> : <div className="mt-4 divide-y divide-slate-100">{visibleRows.map((task) => <article key={task.id} className="grid gap-3 py-4 md:grid-cols-[1fr_auto] md:items-center"><div><h3 className="font-semibold text-slate-900">{task.title}</h3><p className="mt-1 text-sm text-slate-600">{task.vertical} · {task.priority} · {task.status.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-500">Due {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(task.due_at))} · Assigned to {ownerNames.get(task.assigned_to) || "Account"}</p>{task.description && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{task.description}</p>}</div><div className="flex flex-wrap gap-2">{task.status !== "completed" && task.status !== "cancelled" && <button type="button" onClick={() => void updateStatus(task, "completed")} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Complete</button>}<button type="button" onClick={() => edit(task)} className="rounded-lg border px-3 py-2 text-sm font-semibold">Edit</button></div></article>)}</div>}</section>
      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-6"><h2 className="text-lg font-semibold">Recent CRM activity</h2>{!activityAvailable ? <p className="mt-2 text-sm text-slate-500">Activity history is unavailable under the current account permissions.</p> : activity.length === 0 ? <p className="mt-2 text-sm text-slate-500">No activity is visible to this account.</p> : <ol className="mt-3 divide-y divide-slate-100">{activity.slice(0, 30).map((event) => <li key={event.activity_id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{event.action === "INSERT" ? "Created" : event.action === "DELETE" ? "Removed" : "Updated"} {event.entity.replaceAll("_", " ")}</span><time className="text-xs text-slate-500">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(event.occurred_at))}</time></li>)}</ol>}</section>
    </>}
  </div></main>;
}
