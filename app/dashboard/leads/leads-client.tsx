"use client";

import Link from "next/link";
import { Fragment, useCallback } from "react";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCrmVerticalCatalog } from "@/lib/crm/use-verticals";
import { formatCrmPersonName, getProfileDisplayName } from "@/lib/crm/display-names";
import {
  formatLeadDate,
  getFollowupState,
  getPhoneLinks,
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  getLeadVerticalOptionLabel,
  normalizePhone,
  type Lead,
  type LeadProfile,
  type LeadRole,
} from "@/lib/crm/leads";

type LeadForm = {
  name: string;
  phone: string;
  email: string;
  vertical: string;
  product: string;
  source: string;
  status: string;
  priority: string;
  followup: string;
  value: string;
  notes: string;
  ownerId: string;
};

type AuditEvent = {
  id: number;
  actor_id: string | null;
  action: string;
  created_at: string;
  details: Record<string, Record<string, unknown>> | null;
};

const emptyForm: LeadForm = {
  name: "",
  phone: "",
  email: "",
  vertical: "",
  product: "",
  source: "",
  status: "New",
  priority: "Warm",
  followup: "",
  value: "",
  notes: "",
  ownerId: "",
};

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
const labelClass = "grid gap-1 text-sm font-medium text-slate-700";
const terminalStatuses = new Set(["Won", "Lost"]);
const indiaToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

function formatHistoryAction(event: AuditEvent) {
  if (event.action === "INSERT") return "Lead created";
  if (event.action === "DELETE") return "Lead deleted";

  const oldValues = event.details?.old ?? {};
  const newValues = event.details?.new ?? {};
  const names: Record<string, string> = {
    name: "name",
    phone: "mobile",
    email: "email",
    vertical: "vertical",
    product: "product",
    source: "source",
    status: "status",
    priority: "priority",
    followup: "follow-up date",
    value: "expected value",
    owner_id: "assignment",
    notes: "notes",
  };
  const changed = Object.keys(names).filter(
    (key) => JSON.stringify(oldValues[key] ?? null) !== JSON.stringify(newValues[key] ?? null)
  );
  return changed.length ? `Updated ${changed.map((key) => names[key]).join(", ")}` : "Lead updated";
}

function StatusPill({ value, tone = "slate" }: { value: string; tone?: "slate" | "blue" | "red" | "green" | "amber" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-800",
    red: "bg-red-100 text-red-800",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{value}</span>;
}

export default function LeadsClient({
  userId,
  userEmail,
  role,
  initialVertical,
  initialFollowup,
}: {
  userId: string;
  userEmail: string | null;
  role: LeadRole;
  initialVertical: string;
  initialFollowup: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { verticals: availableVerticals, loading: verticalsLoading, error: verticalsError, reload: reloadVerticals } = useCrmVerticalCatalog(userId, role);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [profiles, setProfiles] = useState<LeadProfile[]>([]);
  const [verticalAssignments, setVerticalAssignments] = useState<{ profile_id: string; vertical_name: string }[]>([]);
  const [form, setForm] = useState<LeadForm>({ ...emptyForm, ownerId: userId });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [verticalFilter, setVerticalFilter] = useState(initialVertical || "All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [followupFilter, setFollowupFilter] = useState(() => ["All", "Due today", "Upcoming", "Overdue", "Unscheduled", "Completed"].includes(initialFollowup) ? initialFollowup : "All");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const [today] = useState(indiaToday);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [historyByLead, setHistoryByLead] = useState<Record<string, AuditEvent[]>>({});
  const [historyErrors, setHistoryErrors] = useState<Record<string, string>>({});
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);

  const isAdmin = role === "super_admin" || role === "group_admin";

  async function loadData() {
    setLoading(true);
    setMessage(null);

    const [leadResult, profileResult, assignmentResult] = await Promise.all([
      supabase.from("leads").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id,full_name,email,role").order("full_name"),
      supabase.from("profile_verticals").select("profile_id,vertical_name"),
    ]);

    if (leadResult.error) {
      setMessage({ kind: "error", text: `Could not load leads: ${leadResult.error.message}` });
    } else {
      setLeads((leadResult.data ?? []) as Lead[]);
    }

    if (profileResult.error) {
      setMessage({ kind: "error", text: `Could not load assignment options: ${profileResult.error.message}` });
      setProfiles([{ id: userId, full_name: userEmail || "My account", email: userEmail, role }]);
    } else {
      const availableProfiles = (profileResult.data ?? []) as LeadProfile[];
      setProfiles(availableProfiles.length ? availableProfiles : [{ id: userId, full_name: userEmail || "My account", email: userEmail, role }]);
    }
    if (assignmentResult.error) {
      setVerticalAssignments([]);
      if (isAdmin) setMessage({ kind: "error", text: `Employee vertical assignments could not be loaded: ${assignmentResult.error.message}` });
    } else setVerticalAssignments(assignmentResult.data ?? []);

    setLoading(false);
  }

  const editLead = useCallback((lead: Lead) => {
    setEditingId(lead.id);
    setForm({
      name: lead.name || "",
      phone: lead.phone || "",
      email: lead.email || "",
      vertical: lead.vertical || availableVerticals[0] || "",
      product: lead.product || "",
      source: lead.source || "",
      status: lead.status || "New",
      priority: lead.priority || "Warm",
      followup: lead.followup || "",
      value: lead.value === null || lead.value === undefined ? "" : String(lead.value),
      notes: lead.notes || "",
      ownerId: lead.owner_id || userId,
    });
    setMessage(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [availableVerticals, userId]);

  useEffect(() => {
    if (!verticalsLoading && !verticalsError && !availableVerticals.includes(form.vertical) && !editingId) {
      const timer = window.setTimeout(() => setForm((current) => ({ ...current, vertical: availableVerticals[0] || "" })), 0);
      return () => window.clearTimeout(timer);
    }
  }, [availableVerticals, editingId, form.vertical, verticalsError, verticalsLoading]);

  useEffect(() => {
    if (!verticalsLoading && !verticalsError && verticalFilter !== "All" && !availableVerticals.includes(verticalFilter)) {
      const timer = window.setTimeout(() => setVerticalFilter("All"), 0);
      return () => window.clearTimeout(timer);
    }
  }, [availableVerticals, verticalFilter, verticalsError, verticalsLoading]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData(); }, 0);
    return () => window.clearTimeout(timer);
    // Load once on mount; refresh is available as an explicit action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      let draft = { name: "", phone: "" };
      try {
        const stored = window.sessionStorage.getItem("welanterns:lead-draft");
        if (stored) {
          const parsed: unknown = JSON.parse(stored);
          if (parsed && typeof parsed === "object") {
            const values = parsed as Record<string, unknown>;
            draft = {
              name: typeof values.name === "string" ? values.name : "",
              phone: typeof values.phone === "string" ? values.phone : "",
            };
          }
        }
      } catch {
        // An invalid draft should never prevent ordinary lead entry.
      }
      window.sessionStorage.removeItem("welanterns:lead-draft");
      setForm({ ...emptyForm, name: draft.name, phone: draft.phone, vertical: availableVerticals[0] || "", ownerId: userId });
      setEditingId(null);
      setShowForm(true);
      window.history.replaceState(null, "", "/dashboard/leads");
      return;
    }

    const editId = params.get("edit");
    if (!editId || loading) return;
    const lead = leads.find((row) => row.id === editId);
    if (lead) {
      editLead(lead);
    } else {
      setMessage({ kind: "error", text: "That lead is not available in your assigned records." });
    }
    window.history.replaceState(null, "", "/dashboard/leads");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [availableVerticals, editLead, leads, loading, userId]);

  function resetForm() {
    setForm({ ...emptyForm, vertical: availableVerticals[0] || "", ownerId: userId });
    setEditingId(null);
    setShowForm(false);
  }

  const duplicateMatches = useMemo(() => {
    const phoneKey = normalizePhone(form.phone);
    if (!phoneKey) return [];
    return leads.filter((lead) => lead.id !== editingId && normalizePhone(lead.phone) === phoneKey);
  }, [editingId, form.phone, leads]);
  const eligibleOwners = profiles.filter((profile) => profile.role !== "employee"
    || verticalAssignments.some((assignment) => assignment.profile_id === profile.id && assignment.vertical_name === form.vertical));

  function changeLeadVertical(vertical: string) {
    const owners = profiles.filter((profile) => profile.role !== "employee"
      || verticalAssignments.some((assignment) => assignment.profile_id === profile.id && assignment.vertical_name === vertical));
    const ownerId = owners.some((profile) => profile.id === form.ownerId)
      ? form.ownerId
      : owners.find((profile) => profile.role === "super_admin")?.id || owners.find((profile) => profile.role === "group_admin")?.id || owners[0]?.id || userId;
    setForm({ ...form, vertical, ownerId });
  }

  async function saveLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (verticalsLoading || verticalsError) {
      setMessage({ kind: "error", text: verticalsError || "Loading active business verticals. Try again when the list has loaded." });
      return;
    }
    if (!availableVerticals.includes(form.vertical)) {
      setMessage({ kind: "error", text: `${form.vertical} is not active in the business vertical catalog. Choose an active vertical.` });
      return;
    }
    if (isAdmin && !eligibleOwners.some((profile) => profile.id === form.ownerId)) {
      setMessage({ kind: "error", text: "Choose an owner assigned to the selected business vertical." });
      return;
    }
    const expectedValue = form.value.trim() ? Number(form.value) : 0;
    if (!form.name.trim()) {
      setMessage({ kind: "error", text: "Enter a company or client name. Add a phone number after verifying the correct contact." });
      return;
    }
    if (!Number.isFinite(expectedValue) || expectedValue < 0 || Math.round(expectedValue * 100) !== expectedValue * 100) {
      setMessage({ kind: "error", text: "Expected value must be a non-negative amount with no more than two decimal places." });
      return;
    }

    setSaving(true);

    const owner = profiles.find((profile) => profile.id === form.ownerId);
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      vertical: form.vertical,
      product: form.product.trim() || null,
      source: form.source.trim() || null,
      status: form.status,
      priority: form.priority,
      followup: form.followup || null,
      value: expectedValue,
      notes: form.notes.trim() || null,
      owner_id: isAdmin ? form.ownerId : userId,
      owner: owner?.email || owner?.full_name || (isAdmin ? null : userEmail),
      ...(!editingId ? { created_by: userId } : {}),
    };

    try {
      const query = editingId
        ? supabase.from("leads").update(payload).eq("id", editingId)
        : supabase.from("leads").insert(payload);
      const result = await query.select("id").maybeSingle();

      if (result.error || !result.data) {
        setMessage({ kind: "error", text: `Could not save this lead: ${result.error?.message || "The database did not confirm a saved row under this account."}` });
        return;
      }

      const successMessage = editingId ? "Lead updated." : "Lead added.";
      resetForm();
      await loadData();
      setMessage({ kind: "success", text: successMessage });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not save this lead." });
    } finally {
      setSaving(false);
    }
  }

  async function toggleHistory(leadId: string) {
    if (expandedLeadId === leadId) {
      setExpandedLeadId(null);
      return;
    }

    setExpandedLeadId(leadId);
    if (historyByLead[leadId] || historyErrors[leadId]) return;

    setHistoryLoadingId(leadId);
    if (isAdmin) {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id,actor_id,action,created_at,details")
        .eq("entity", "leads")
        .eq("entity_id", leadId)
        .order("created_at", { ascending: false });

      if (error) {
        setHistoryErrors((current) => ({ ...current, [leadId]: error.message }));
      } else {
        setHistoryByLead((current) => ({ ...current, [leadId]: (data ?? []) as AuditEvent[] }));
      }
    } else {
      const { data, error } = await supabase.rpc("get_my_lead_activity");
      if (error) {
        setHistoryErrors((current) => ({
          ...current,
          [leadId]: `Employee-safe activity history is unavailable: ${error.message}`,
        }));
      } else {
        const events = (data ?? []) as { activity_id: number; action: string; lead_id: string; occurred_at: string }[];
        const leadEvents: AuditEvent[] = events
          .filter((event) => event.lead_id === leadId)
          .map((event) => ({ id: event.activity_id, action: event.action, created_at: event.occurred_at, actor_id: null, details: null }));
        setHistoryByLead((current) => ({ ...current, [leadId]: leadEvents }));
      }
    }
    setHistoryLoadingId(null);
  }

  const ownerNames = useMemo(() => new Map(profiles.map((profile) => [profile.id, getProfileDisplayName(profile, userId)])), [profiles, userId]);
  const visibleLeads = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return leads.filter((lead) => {
      const matchesSearch = !query || [lead.name, lead.phone, lead.email, lead.product, lead.source, ownerNames.get(lead.owner_id || "")]
        .some((value) => String(value || "").toLocaleLowerCase().includes(query));
      const matchesVertical = verticalFilter === "All" || lead.vertical === verticalFilter;
      const matchesStatus = statusFilter === "All" || lead.status === statusFilter;
      const matchesOwner = ownerFilter === "All" || lead.owner_id === ownerFilter;
      const matchesFollowup = followupFilter === "All" || getFollowupState(lead, today) === followupFilter;
      return matchesSearch && matchesVertical && matchesStatus && matchesOwner && matchesFollowup;
    });
  }, [followupFilter, leads, ownerNames, ownerFilter, search, statusFilter, today, verticalFilter]);

  const dueTodayCount = leads.filter((lead) => getFollowupState(lead, today) === "Due today").length;
  const overdueCount = leads.filter((lead) => getFollowupState(lead, today) === "Overdue").length;
  const openCount = leads.filter((lead) => !terminalStatuses.has(lead.status)).length;

  const messageClasses = message?.kind === "error"
    ? "border-red-200 bg-red-50 text-red-800"
    : message?.kind === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-blue-200 bg-blue-50 text-blue-800";

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard" className="text-sm font-semibold text-blue-700">← Dashboard</Link>
          <Link href="/dashboard/clients" className="text-sm font-semibold text-blue-700">Client 360 →</Link>
        </div>

        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold tracking-wider text-blue-700">WeLanterns Capital Advisory Pvt. Ltd.</p>
            <h1 className="text-3xl font-bold text-slate-900">Lead Management</h1>
            <p className="mt-1 text-sm text-slate-600">Manage assigned opportunities, next steps, and client conversations.</p>
          </div>
          <button
            type="button"
            onClick={() => { if (showForm) resetForm(); else { setForm({ ...emptyForm, ownerId: userId }); setEditingId(null); setShowForm(true); } }}
            className="rounded-lg bg-[#14234f] px-5 py-3 font-semibold text-white hover:bg-[#20376f]"
          >
            {showForm ? "Close form" : "+ Add lead"}
          </button>
        </header>

        {message && <p role="status" className={`rounded-lg border p-3 text-sm ${messageClasses}`}>{message.text}</p>}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Lead summary">
          {[
            ["Visible leads", leads.length],
            ["Open", openCount],
            ["Due today", dueTodayCount],
            ["Overdue", overdueCount],
          ].map(([title, count]) => (
            <div key={String(title)} className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">{title}</p>
              <p className="mt-1 text-2xl font-bold text-[#14234f]">{count}</p>
            </div>
          ))}
        </section>

        {showForm && (
          <form onSubmit={saveLead} className="space-y-5 rounded-xl bg-white p-5 shadow-sm md:p-7">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{editingId ? "Edit lead" : "New lead / opportunity"}</h2>
              <p className="mt-1 text-sm text-slate-500">Name and mobile are required. Other details can be completed later.</p>
              {verticalsLoading && <p role="status" className="mt-1 text-sm text-slate-600">Loading active business verticals…</p>}
              {verticalsError && <div role="alert" className="mt-2 flex flex-wrap items-center gap-3 text-sm text-red-700"><span>{verticalsError}</span><button type="button" onClick={() => void reloadVerticals()} className="font-semibold underline">Retry</button></div>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className={labelClass}>Client name *
                <input className={inputClass} required maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </label>
              <label className={labelClass}>Mobile number (optional)
                <input className={inputClass} type="tel" maxLength={32} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </label>
              <label className={labelClass}>Email
                <input className={inputClass} type="email" maxLength={254} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              </label>
              <label className={labelClass}>Business vertical
                <select className={inputClass} disabled={verticalsLoading || !!verticalsError} value={form.vertical} onChange={(event) => changeLeadVertical(event.target.value)}>
                  {[...new Set([...availableVerticals, ...(availableVerticals.includes(form.vertical) ? [] : [form.vertical])])].map((vertical) => <option key={vertical} disabled={!availableVerticals.includes(vertical)}>
                    {getLeadVerticalOptionLabel(vertical, availableVerticals.includes(vertical))}
                  </option>)}
                </select>
              </label>
              <label className={labelClass}>Product / opportunity
                <input className={inputClass} list={form.vertical === "SME Advisory" ? "sme-advisory-opportunities" : undefined} maxLength={160} value={form.product} onChange={(event) => setForm({ ...form, product: event.target.value })} placeholder={form.vertical === "SME Advisory" ? "Pre-seed advisory, SME IPO, fundraising, business advisory" : "e.g. SIP, Pre-IPO shares"} />
                {form.vertical === "SME Advisory" && <datalist id="sme-advisory-opportunities"><option value="Pre-seed advisory" /><option value="SME IPO" /><option value="Fundraising" /><option value="Business advisory" /></datalist>}
              </label>
              <label className={labelClass}>Lead source
                <input className={inputClass} maxLength={120} value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="Referral, website, event..." />
              </label>
              <label className={labelClass}>Status
                <select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  {LEAD_STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
              <label className={labelClass}>Priority
                <select className={inputClass} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                  {LEAD_PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}
                </select>
              </label>
              <label className={labelClass}>Next follow-up
                <input className={inputClass} type="date" value={form.followup} onChange={(event) => setForm({ ...form, followup: event.target.value })} />
              </label>
              <label className={labelClass}>Expected value (₹)
                <input className={inputClass} type="number" min="0" step="0.01" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} />
              </label>
              <label className={labelClass}>Assigned to
                <select className={inputClass} disabled={!isAdmin} value={form.ownerId || userId} onChange={(event) => setForm({ ...form, ownerId: event.target.value })}>
                  {(isAdmin ? eligibleOwners : profiles).map((profile) => <option key={profile.id} value={profile.id}>{getProfileDisplayName(profile, userId)}</option>)}
                </select>
                {!isAdmin && <span className="text-xs font-normal text-slate-500">Employees can manage their own assigned leads.</span>}
              </label>
            </div>

            {duplicateMatches.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="status">
                <p className="font-semibold">This mobile number matches {duplicateMatches.length} visible lead{duplicateMatches.length === 1 ? "" : "s"}.</p>
                <p className="mt-1">Check whether this is an existing opportunity. You can continue to add another product for the same client.</p>
                <ul className="mt-2 list-inside list-disc">
                  {duplicateMatches.slice(0, 4).map((lead) => <li key={lead.id}>{lead.name} · {lead.product || lead.vertical} · {lead.status}</li>)}
                </ul>
                {duplicateMatches.length > 4 && <p className="mt-1">And {duplicateMatches.length - 4} more.</p>}
              </div>
            )}

            <label className={labelClass}>Notes / client requirements
              <textarea rows={3} maxLength={4000} className={inputClass} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </label>

            <div className="flex flex-wrap gap-3">
              <button disabled={saving || verticalsLoading || !!verticalsError || !availableVerticals.includes(form.vertical)} className="rounded-lg bg-yellow-400 px-6 py-3 font-bold text-slate-950 disabled:opacity-50">
                {saving ? "Saving…" : editingId ? "Save changes" : "Save lead"}
              </button>
              <button type="button" onClick={resetForm} className="rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-700">Cancel</button>
            </div>
          </form>
        )}

        <section className="space-y-4 rounded-xl bg-white p-4 shadow-sm md:p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className={`${labelClass} lg:col-span-2`}>
              <span className="sr-only">Search leads</span>
              <input className={inputClass} placeholder="Search name, mobile, email, product…" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <label className={labelClass}><span className="sr-only">Filter vertical</span>
              <select className={inputClass} value={verticalFilter} onChange={(event) => setVerticalFilter(event.target.value)}>
                <option value="All">All verticals</option>{[...new Set([...availableVerticals, ...(availableVerticals.includes(verticalFilter) || verticalFilter === "All" ? [] : [verticalFilter])])].map((vertical) => <option key={vertical}>{vertical}</option>)}
              </select>
            </label>
            <label className={labelClass}><span className="sr-only">Filter status</span>
              <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="All">All statuses</option>{LEAD_STATUSES.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <label className={labelClass}><span className="sr-only">Filter follow-up</span>
              <select className={inputClass} value={followupFilter} onChange={(event) => setFollowupFilter(event.target.value)}>
                {["All", "Due today", "Upcoming", "Overdue", "Unscheduled", "Completed"].map((state) => <option key={state}>{state}</option>)}
              </select>
            </label>
            {isAdmin && (
              <label className={labelClass}><span className="sr-only">Filter assignee</span>
                <select className={inputClass} value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
                  <option value="All">All assignees</option>
                  {profiles.map((profile) => <option key={profile.id} value={profile.id}>{getProfileDisplayName(profile, userId)}</option>)}
                </select>
              </label>
            )}
            <button type="button" onClick={() => void loadData()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Refresh</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>{["Client", "Mobile", "Opportunity", "Vertical", "Status", "Follow-up", "Assigned to", "Actions"].map((heading) => <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>)}</tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="p-8 text-center text-slate-500">Loading assigned leads…</td></tr>
                ) : visibleLeads.map((lead) => {
                  const followupState = getFollowupState(lead, today);
                  const links = getPhoneLinks(lead.phone);
                  const tone = followupState === "Overdue" ? "red" : followupState === "Due today" ? "amber" : followupState === "Completed" ? "green" : followupState === "Upcoming" ? "blue" : "slate";
                  return (
                    <Fragment key={lead.id}>
                      <tr className="border-b border-slate-100 align-top hover:bg-slate-50">
                        <td className="px-3 py-3 font-semibold text-slate-900">{lead.name}<div className="mt-1 text-xs font-normal text-slate-500">{lead.email || ""}</div></td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-slate-800">{lead.phone}</div>
                          <div className="mt-1 flex gap-3 text-xs font-semibold">
                            {links.telephone && <a href={links.telephone} className="text-blue-700">Call</a>}
                            {links.whatsapp && /WHATSAPP OPT-IN: (YES|TRUE|CONSENTED)/i.test(lead.notes || "") && <a href={links.whatsapp} target="_blank" rel="noreferrer" className="text-emerald-700">WhatsApp (opted-in)</a>}
                          </div>
                        </td>
                        <td className="px-3 py-3">{lead.product || "—"}</td>
                        <td className="px-3 py-3">{lead.vertical}</td>
                        <td className="px-3 py-3"><StatusPill value={lead.status} tone={lead.status === "Won" ? "green" : lead.status === "Lost" ? "slate" : "blue"} /></td>
                        <td className="px-3 py-3"><div>{formatLeadDate(lead.followup)}</div><div className="mt-1"><StatusPill value={followupState} tone={tone} /></div></td>
                        <td className="px-3 py-3">{ownerNames.get(lead.owner_id || "") || formatCrmPersonName(lead.owner) || "Unassigned"}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-x-3 gap-y-2 font-semibold">
                            <button type="button" onClick={() => editLead(lead)} className="text-blue-700">Edit</button>
                            <button type="button" onClick={() => void toggleHistory(lead.id)} className="text-indigo-700">{expandedLeadId === lead.id ? "Hide history" : "History"}</button>
                          </div>
                        </td>
                      </tr>
                      {expandedLeadId === lead.id && (
                        <tr key={`${lead.id}-history`} className="border-b border-slate-100 bg-slate-50">
                          <td colSpan={8} className="px-4 py-4">
                            <h3 className="font-semibold text-slate-900">Activity history</h3>
                            {historyLoadingId === lead.id ? <p className="mt-2 text-sm text-slate-500">Loading history…</p>
                              : historyErrors[lead.id] ? <p role="alert" className="mt-2 text-sm text-red-700">Could not load history: {historyErrors[lead.id]}</p>
                                : (historyByLead[lead.id] || []).length === 0 ? <p className="mt-2 text-sm text-slate-500">No recorded changes are available.</p>
                                  : <ol className="mt-3 space-y-3 border-l-2 border-slate-200 pl-4">
                                    {historyByLead[lead.id].map((event) => (
                                      <li key={event.id} className="relative">
                                        <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-blue-600" />
                                        <p className="text-sm font-medium text-slate-800">{formatHistoryAction(event)}</p>
                                        <p className="mt-0.5 text-xs text-slate-500">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(event.created_at))} · {ownerNames.get(event.actor_id || "") || (event.actor_id ? `User ${event.actor_id.slice(0, 8)}` : "System")}</p>
                                      </li>
                                    ))}
                                  </ol>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {!loading && visibleLeads.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-500">No leads match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">Rows and duplicate checks follow your existing Supabase access: employees see their assigned leads; administrators see all leads.</p>
        </section>

        {!isAdmin && <p className="text-xs text-slate-500">Employee activity shows permitted event metadata only. Full audit snapshots remain restricted to administrators.</p>}
      </div>
    </main>
  );
}
