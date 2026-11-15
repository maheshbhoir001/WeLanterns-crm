"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCrmVerticals } from "@/lib/crm/use-verticals";
import { formatCrmPersonName, getProfileDisplayName } from "@/lib/crm/display-names";
import {
  formatLeadDate,
  getFollowupState,
  getPhoneLinks,
  LEAD_STATUSES,
  getLeadVerticalOptionLabel,
  normalizePhone,
  type Lead,
  type LeadProfile,
  type LeadRole,
} from "@/lib/crm/leads";

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
const indiaToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

type ClientGroup = {
  key: string;
  clientId?: string;
  canonical: boolean;
  name: string;
  phone: string;
  email: string | null;
  companyName: string | null;
  lifecycle: string | null;
  ownerId: string | null;
  primaryVertical: string | null;
  verticals: string[];
  updatedAt: string | null;
  leads: Lead[];
};

type CanonicalClient = {
  id: string; name: string; phone: string | null; email: string | null;
  company_name: string | null; primary_vertical: string; lifecycle: string;
  notes: string | null; owner_id: string | null; created_by: string | null;
  created_at: string; updated_at: string;
};

function groupClientLeads(leads: Lead[]): ClientGroup[] {
  const groups = new Map<string, ClientGroup>();
  for (const lead of leads) {
    const phoneKey = normalizePhone(lead.phone) || `lead:${lead.id}`;
    const existing = groups.get(phoneKey);
    if (existing) {
      existing.leads.push(lead);
    } else {
      groups.set(phoneKey, {
        key: phoneKey,
        canonical: false,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        companyName: null,
        lifecycle: null,
        ownerId: lead.owner_id,
        primaryVertical: null,
        verticals: Array.from(new Set([lead.vertical])),
        updatedAt: lead.updated_at,
        leads: [lead],
      });
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function opportunityFollowup(lead: Lead, today: string) {
  return getFollowupState(lead, today);
}

function ClientActivity({ clientId, leadIds }: { clientId: string; leadIds: string[] }) {
  const supabase = useMemo(() => createClient(), []);
  const leadKey = leadIds.join(",");
  const [events, setEvents] = useState<{ activity_id: number; action: string; entity: string; occurred_at: string }[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void Promise.all([
        supabase.rpc("get_my_crm_activity"),
        supabase.from("crm_tasks").select("id").eq("client_id", clientId),
        supabase.from("crm_followups").select("id").eq("client_id", clientId),
      ]).then(([activityResult, taskResult, followupResult]) => {
        if (!active) return;
        if (activityResult.error || taskResult.error || followupResult.error) { setState("unavailable"); return; }
        const rows = (activityResult.data ?? []) as { activity_id: number; action: string; entity: string; entity_id: string; occurred_at: string }[];
        const taskIds = new Set((taskResult.data ?? []).map((row) => row.id));
        const followupIds = new Set((followupResult.data ?? []).map((row) => row.id));
        setEvents(rows.filter((row) => (row.entity === "clients" && row.entity_id === clientId)
          || (row.entity === "leads" && leadKey.split(",").includes(row.entity_id))
          || (row.entity === "crm_tasks" && taskIds.has(row.entity_id))
          || (row.entity === "crm_followups" && followupIds.has(row.entity_id))));
        setState("ready");
      });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [clientId, leadKey, supabase]);

  return <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4"><h3 className="font-semibold text-slate-900">Client activity</h3>
    {state === "loading" ? <p className="mt-2 text-sm text-slate-500">Loading activity…</p>
      : state === "unavailable" ? <p className="mt-2 text-sm text-slate-500">Activity metadata is unavailable under the current account permissions.</p>
        : events.length === 0 ? <p className="mt-2 text-sm text-slate-500">No client changes recorded.</p>
          : <ol className="mt-3 space-y-2">{events.map((event) => <li key={event.activity_id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{event.action === "INSERT" ? "Created" : event.action === "DELETE" ? "Removed" : "Updated"} {event.entity.replaceAll("_", " ")}</span><time className="text-xs text-slate-500">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(event.occurred_at))}</time></li>)}</ol>}
  </section>;
}

export default function ClientsClient({ userId, role }: { userId: string; role: LeadRole }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const availableVerticals = useCrmVerticals(userId, role);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [canonicalClients, setCanonicalClients] = useState<CanonicalClient[]>([]);
  const [clientVerticals, setClientVerticals] = useState<Record<string, string[]>>({});
  const [verticalAssignments, setVerticalAssignments] = useState<{ profile_id: string; vertical_name: string }[]>([]);
  const [canonicalAvailable, setCanonicalAvailable] = useState(false);
  const [profiles, setProfiles] = useState<LeadProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [verticalFilter, setVerticalFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [leadToLink, setLeadToLink] = useState<Record<string, string>>({});
  const [linkingLead, setLinkingLead] = useState(false);
  const [verticalToAdd, setVerticalToAdd] = useState<Record<string, string>>({});
  const [addingVertical, setAddingVertical] = useState(false);
  const [today, setToday] = useState("");
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [savingClient, setSavingClient] = useState(false);
  const [clientForm, setClientForm] = useState({ name: "", phone: "", email: "", company_name: "", primary_vertical: "", lifecycle: "prospect", notes: "", owner_id: userId });

  const isAdmin = role === "super_admin" || role === "group_admin";

  useEffect(() => {
    const timer = window.setTimeout(() => setToday(indiaToday()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    const [leadResult, profileResult, clientResult, assignmentResult] = await Promise.all([
      supabase.from("leads").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id,full_name,email,role").order("full_name"),
      supabase.from("clients").select("*").order("name"),
      supabase.from("profile_verticals").select("profile_id,vertical_name"),
    ]);

    if (leadResult.error) {
      setError(`Could not load client records: ${leadResult.error.message}`);
    } else {
      setLeads((leadResult.data ?? []) as Lead[]);
    }
    const noClientTable = clientResult.error?.code === "PGRST205" || clientResult.error?.code === "42P01";
    if (noClientTable) {
      setCanonicalAvailable(false);
      setCanonicalClients([]);
      setClientVerticals({});
    } else if (clientResult.error) {
      setCanonicalAvailable(false);
      setError(`Canonical clients could not be loaded: ${clientResult.error.message}`);
    } else {
      setCanonicalAvailable(true);
      const clients = (clientResult.data ?? []) as CanonicalClient[];
      setCanonicalClients(clients);
      const verticalResult = await supabase.from("client_verticals").select("client_id,vertical_name");
      if (verticalResult.error) {
        setError(`Client vertical relationships could not be loaded: ${verticalResult.error.message}`);
      } else {
        const mapping: Record<string, string[]> = {};
        for (const row of verticalResult.data ?? []) (mapping[row.client_id] ||= []).push(row.vertical_name);
        setClientVerticals(mapping);
      }
    }
    if (!profileResult.error) {
      const availableProfiles = (profileResult.data ?? []) as LeadProfile[];
      setProfiles(availableProfiles.length ? availableProfiles : [{ id: userId, full_name: "My account", email: null, role }]);
    }
    if (assignmentResult.error) {
      setVerticalAssignments([]);
      if (isAdmin) setError(`Employee vertical assignments could not be loaded: ${assignmentResult.error.message}`);
    } else setVerticalAssignments(assignmentResult.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupedClients = useMemo(() => {
    const linked = new Set<string>();
    const canonical = canonicalClients.map((client): ClientGroup => {
      const clientLeads = leads.filter((lead) => lead.client_id === client.id);
      clientLeads.forEach((lead) => linked.add(lead.id));
      const verticals = Array.from(new Set([client.primary_vertical, ...(clientVerticals[client.id] || []), ...clientLeads.map((lead) => lead.vertical)].filter(Boolean))) as string[];
      return {
        key: client.id, clientId: client.id, canonical: true, name: client.name,
        phone: client.phone || "", email: client.email, companyName: client.company_name,
        lifecycle: client.lifecycle, ownerId: client.owner_id, primaryVertical: client.primary_vertical,
        verticals, updatedAt: client.updated_at, leads: clientLeads,
      };
    });
    const unlinked = groupClientLeads(leads.filter((lead) => !lead.client_id));
    return [...canonical, ...unlinked].sort((a, b) => a.name.localeCompare(b.name));
  }, [canonicalClients, clientVerticals, leads]);
  const profileNames = useMemo(() => new Map(profiles.map((profile) => [profile.id, getProfileDisplayName(profile, userId)])), [profiles, userId]);
  const eligibleClientOwners = profiles.filter((profile) => profile.role !== "employee"
    || verticalAssignments.some((assignment) => assignment.profile_id === profile.id && assignment.vertical_name === clientForm.primary_vertical));

  function changeClientVertical(vertical: string) {
    const owners = profiles.filter((profile) => profile.role !== "employee"
      || verticalAssignments.some((assignment) => assignment.profile_id === profile.id && assignment.vertical_name === vertical));
    const owner_id = owners.some((profile) => profile.id === clientForm.owner_id)
      ? clientForm.owner_id
      : owners.find((profile) => profile.role === "super_admin")?.id || owners.find((profile) => profile.role === "group_admin")?.id || owners[0]?.id || userId;
    setClientForm({ ...clientForm, primary_vertical: vertical, owner_id });
  }

  const visibleClients = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return groupedClients.filter((client) => {
      const groupMatches = client.leads.filter((lead) => {
        const matchesSearch = !query || [client.name, client.phone, client.email, lead.product, lead.source, profileNames.get(lead.owner_id || "")]
          .some((value) => String(value || "").toLocaleLowerCase().includes(query));
        const matchesVertical = verticalFilter === "All" || lead.vertical === verticalFilter;
        const matchesStatus = statusFilter === "All" || lead.status === statusFilter;
        const matchesOwner = ownerFilter === "All" || lead.owner_id === ownerFilter;
        return matchesSearch && matchesVertical && matchesStatus && matchesOwner;
      });
      const matchesClientSearch = !query || [client.name, client.phone, client.email, client.companyName, profileNames.get(client.ownerId || "")]
        .some((value) => String(value || "").toLocaleLowerCase().includes(query));
      const matchesClientVertical = verticalFilter === "All" || client.verticals.includes(verticalFilter);
      const matchesClientOwner = ownerFilter === "All" || client.ownerId === ownerFilter;
      const canonicalWithoutMatchingLead = client.canonical && groupMatches.length === 0 && statusFilter === "All";
      return groupMatches.length > 0 || (canonicalWithoutMatchingLead && matchesClientSearch && matchesClientVertical && matchesClientOwner);
    });
  }, [groupedClients, ownerFilter, profileNames, search, statusFilter, verticalFilter]);

  function filteredOpportunities(client: ClientGroup) {
    const query = search.trim().toLocaleLowerCase();
    return client.leads.filter((lead) => {
      const matchesSearch = !query || [client.name, client.phone, client.email, lead.product, lead.source, profileNames.get(lead.owner_id || "")]
        .some((value) => String(value || "").toLocaleLowerCase().includes(query));
      const matchesVertical = verticalFilter === "All" || lead.vertical === verticalFilter;
      const matchesStatus = statusFilter === "All" || lead.status === statusFilter;
      const matchesOwner = ownerFilter === "All" || lead.owner_id === ownerFilter;
      return matchesSearch && matchesVertical && matchesStatus && matchesOwner;
    });
  }

  function addOpportunity(client: ClientGroup) {
    try {
      window.sessionStorage.setItem("welanterns:lead-draft", JSON.stringify({ name: client.name, phone: client.phone }));
    } catch {
      // Navigation still works if the browser blocks session storage.
    }
    router.push("/dashboard/leads?new=1");
  }

  function editClient(client: CanonicalClient) {
    setEditingClientId(client.id);
    setClientForm({
      name: client.name, phone: client.phone || "", email: client.email || "",
      company_name: client.company_name || "", primary_vertical: client.primary_vertical,
      lifecycle: client.lifecycle, notes: client.notes || "", owner_id: client.owner_id || userId,
    });
    setShowClientForm(true);
  }

  async function saveClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSavingClient(true);
    if (!clientForm.name.trim() || !availableVerticals.includes(clientForm.primary_vertical)) {
      setError(isAdmin
        ? "Enter a client name and choose an active vertical."
        : "Enter a client name and choose a vertical assigned to your account. Ask an administrator to grant access if needed.");
      setSavingClient(false);
      return;
    }
    if (isAdmin && !eligibleClientOwners.some((profile) => profile.id === clientForm.owner_id)) {
      setError("Choose a client owner assigned to the selected business vertical.");
      setSavingClient(false);
      return;
    }
    const payload = {
      name: clientForm.name.trim(), phone: clientForm.phone.trim() || null,
      email: clientForm.email.trim() || null, company_name: clientForm.company_name.trim() || null,
      primary_vertical: clientForm.primary_vertical, lifecycle: clientForm.lifecycle,
      notes: clientForm.notes.trim() || null, owner_id: isAdmin ? clientForm.owner_id : userId,
      ...(!editingClientId ? { created_by: userId } : {}),
    };
    const result = editingClientId
      ? await supabase.from("clients").update(payload).eq("id", editingClientId).select("id").single()
      : await supabase.from("clients").insert(payload).select("id").single();
    if (result.error) setError(`Client was not saved: ${result.error.message}`);
    else {
      setMessage(`Client ${editingClientId ? "updated" : "created"}.`);
      setShowClientForm(false);
      setEditingClientId(null);
      await load();
    }
    setSavingClient(false);
  }

  async function linkLead(client: ClientGroup) {
    if (!client.clientId) return;
    const leadId = leadToLink[client.clientId];
    if (!leadId) return;
    const lead = leads.find((item) => item.id === leadId && !item.client_id);
    if (!lead) { setError("Choose an unlinked opportunity visible to this account."); return; }
    setLinkingLead(true);
    setError("");
    setMessage("");
    const { data, error: linkError } = await supabase.from("leads").update({ client_id: client.clientId }).eq("id", lead.id).is("client_id", null).select("id").maybeSingle();
    if (linkError || !data) setError(`Opportunity was not linked: ${linkError?.message || "The record was not changed under the current account permissions."}`);
    else {
      setMessage(`${lead.name}'s opportunity was linked to ${client.name}.`);
      setLeadToLink((current) => ({ ...current, [client.clientId!]: "" }));
      await load();
    }
    setLinkingLead(false);
  }

  async function addClientVertical(client: ClientGroup) {
    if (!client.clientId) return;
    const vertical = verticalToAdd[client.clientId];
    if (!vertical || vertical === client.primaryVertical || (clientVerticals[client.clientId] || []).includes(vertical)) return;
    setAddingVertical(true);
    setError("");
    setMessage("");
    const { data, error: addError } = await supabase.from("client_verticals").insert({ client_id: client.clientId, vertical_name: vertical, created_by: userId }).select("id").maybeSingle();
    if (addError || !data) setError(`Could not add ${vertical} to ${client.name}: ${addError?.message || "The database did not confirm the assignment."}`);
    else {
      setClientVerticals((current) => ({ ...current, [client.clientId!]: [...(current[client.clientId!] || []), vertical] }));
      setVerticalToAdd((current) => ({ ...current, [client.clientId!]: "" }));
      setMessage(`${vertical} added to ${client.name}.`);
    }
    setAddingVertical(false);
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard" className="text-sm font-semibold text-blue-700">← Dashboard</Link>
          <Link href="/dashboard/leads" className="text-sm font-semibold text-blue-700">Lead Management →</Link>
        </div>

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-wider text-blue-700">WeLanterns Capital Advisory Pvt. Ltd.</p>
            <h1 className="text-3xl font-bold text-slate-900">Client 360</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">A single contact view with the opportunities currently visible to your account.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className={`rounded-lg border px-3 py-2 text-xs ${canonicalAvailable ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
              {canonicalAvailable ? "Canonical client records are connected." : "Showing lead-derived contacts because canonical client records are unavailable under the current account permissions."}
            </div>
            {canonicalAvailable && <button type="button" onClick={() => { setEditingClientId(null); setClientForm({ name: "", phone: "", email: "", company_name: "", primary_vertical: availableVerticals[0] || "", lifecycle: "prospect", notes: "", owner_id: userId }); setShowClientForm(true); }} className="rounded-lg bg-[#14234f] px-4 py-2.5 text-sm font-semibold text-white">+ New client</button>}
          </div>
        </header>

        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

        {showClientForm && canonicalAvailable && <form onSubmit={saveClient} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-semibold text-slate-900">{editingClientId ? "Edit client profile" : "Create canonical client"}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium">Client name<input required maxLength={180} className={inputClass} value={clientForm.name} onChange={(event) => setClientForm({ ...clientForm, name: event.target.value })} /></label>
            <label className="grid gap-1 text-sm font-medium">Mobile<input type="tel" maxLength={40} className={inputClass} value={clientForm.phone} onChange={(event) => setClientForm({ ...clientForm, phone: event.target.value })} /></label>
            <label className="grid gap-1 text-sm font-medium">Email<input type="email" maxLength={254} className={inputClass} value={clientForm.email} onChange={(event) => setClientForm({ ...clientForm, email: event.target.value })} /></label>
            <label className="grid gap-1 text-sm font-medium">Company<input maxLength={180} className={inputClass} value={clientForm.company_name} onChange={(event) => setClientForm({ ...clientForm, company_name: event.target.value })} /></label>
            <label className="grid gap-1 text-sm font-medium">Primary vertical<select required disabled={!availableVerticals.length} className={inputClass} value={clientForm.primary_vertical} onChange={(event) => changeClientVertical(event.target.value)}>{[...new Set([...availableVerticals, ...(availableVerticals.includes(clientForm.primary_vertical) || !clientForm.primary_vertical ? [] : [clientForm.primary_vertical])])].map((vertical) => <option key={vertical} disabled={!availableVerticals.includes(vertical)}>{getLeadVerticalOptionLabel(vertical, availableVerticals.includes(vertical))}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">Lifecycle<select className={inputClass} value={clientForm.lifecycle} onChange={(event) => setClientForm({ ...clientForm, lifecycle: event.target.value })}>{["prospect", "active", "inactive", "former"].map((lifecycle) => <option key={lifecycle}>{lifecycle}</option>)}</select></label>
            {isAdmin && <label className="grid gap-1 text-sm font-medium">Owner<select className={inputClass} value={clientForm.owner_id} onChange={(event) => setClientForm({ ...clientForm, owner_id: event.target.value })}>{eligibleClientOwners.map((profile) => <option key={profile.id} value={profile.id}>{getProfileDisplayName(profile, userId)} · {profile.role.replaceAll("_", " ")}</option>)}</select></label>}
            <label className="grid gap-1 text-sm font-medium sm:col-span-2 lg:col-span-3">Notes<textarea maxLength={4000} rows={3} className={inputClass} value={clientForm.notes} onChange={(event) => setClientForm({ ...clientForm, notes: event.target.value })} /></label>
          </div>
          <div className="mt-4 flex gap-2"><button disabled={savingClient} className="rounded-lg bg-[#14234f] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{savingClient ? "Saving…" : editingClientId ? "Save client" : "Create client"}</button><button type="button" onClick={() => { setShowClientForm(false); setEditingClientId(null); }} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold">Cancel</button></div>
        </form>}

        <section className="grid gap-3 rounded-xl bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
          <label className="lg:col-span-2">
            <span className="sr-only">Search clients and opportunities</span>
            <input className={inputClass} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client, mobile, email, product…" />
          </label>
          <label>
            <span className="sr-only">Filter vertical</span>
            <select className={inputClass} value={verticalFilter} onChange={(event) => setVerticalFilter(event.target.value)}>
              <option value="All">All verticals</option>
              {availableVerticals.map((vertical) => <option key={vertical}>{vertical}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter opportunity status</span>
            <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="All">All statuses</option>
              {LEAD_STATUSES.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
          {isAdmin && (
            <label>
              <span className="sr-only">Filter owner</span>
              <select className={inputClass} value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
                <option value="All">All assignees</option>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{getProfileDisplayName(profile, userId)}</option>)}
              </select>
            </label>
          )}
          <button type="button" onClick={() => void load()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Refresh</button>
        </section>

        <section className="space-y-3" aria-label="Clients">
          {loading ? <div className="rounded-xl bg-white p-10 text-center text-slate-500">Loading visible client records…</div>
            : visibleClients.length === 0 ? <div className="rounded-xl bg-white p-10 text-center text-slate-500">No clients match these filters.</div>
              : visibleClients.map((client) => {
                const opportunities = filteredOpportunities(client);
                const selected = selectedKey === client.key;
                const links = getPhoneLinks(client.phone);
                const updated = [...opportunities].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
                return (
                  <article key={client.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <button type="button" onClick={() => setSelectedKey(selected ? null : client.key)} className="grid w-full gap-3 p-4 text-left sm:grid-cols-[1fr_auto] sm:items-center md:p-5">
                      <span>
                        <span className="block text-lg font-bold text-slate-900">{client.name}</span>
                        <span className="mt-1 block text-sm text-slate-600">{client.phone}{client.email ? ` · ${client.email}` : ""}</span>
                        {client.companyName && <span className="mt-1 block text-xs text-slate-500">{client.companyName}</span>}
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-blue-50 px-3 py-1.5 font-semibold text-blue-800">{opportunities.length} visible {opportunities.length === 1 ? "opportunity" : "opportunities"}</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">Updated {formatLeadDate(updated?.updated_at?.slice(0, 10) || client.updatedAt?.slice(0, 10) || null)}</span>
                        <span className="font-semibold text-blue-700">{selected ? "Close" : "Open profile"}</span>
                      </span>
                    </button>

                    {selected && (
                      <div className="border-t border-slate-200 bg-slate-50 p-4 md:p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex gap-4 text-sm font-semibold">
                            {links.telephone && <a className="text-blue-700" href={links.telephone}>Call</a>}
                            {links.whatsapp && <a className="text-emerald-700" href={links.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a>}
                          </div>
                          {client.clientId && <button type="button" onClick={() => { const record = canonicalClients.find((item) => item.id === client.clientId); if (record) editClient(record); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Edit client</button>}
                          <button type="button" onClick={() => addOpportunity(client)} className="rounded-lg bg-[#14234f] px-4 py-2 text-sm font-semibold text-white">+ Add opportunity</button>
                        </div>

                        {client.canonical && client.clientId && <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-slate-800">{client.lifecycle?.replaceAll("_", " ")} · {client.verticals.join(" · ") || client.primaryVertical}</p><p className="mt-1 text-xs text-slate-500">Client owner: {profileNames.get(client.ownerId || "") || "Unassigned"}</p></div><div className="flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs font-medium text-slate-600">Add permitted vertical<select className={inputClass} value={verticalToAdd[client.clientId] || ""} onChange={(event) => setVerticalToAdd((current) => ({ ...current, [client.clientId!]: event.target.value }))}><option value="">Choose vertical</option>{availableVerticals.filter((vertical) => vertical !== client.primaryVertical && !(clientVerticals[client.clientId!] || []).includes(vertical)).map((vertical) => <option key={vertical}>{vertical}</option>)}</select></label><button type="button" disabled={!verticalToAdd[client.clientId] || addingVertical} onClick={() => void addClientVertical(client)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">{addingVertical ? "Adding…" : "Add vertical"}</button></div></div>{canonicalClients.find((record) => record.id === client.clientId)?.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{canonicalClients.find((record) => record.id === client.clientId)?.notes}</p>}<ClientActivity clientId={client.clientId} leadIds={client.leads.map((lead) => lead.id)} /></div>}

                        {client.canonical && client.clientId && <div className="mt-4 flex flex-col gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-4 sm:flex-row"><label className="grid flex-1 gap-1 text-sm font-medium">Link an existing unlinked opportunity<select className={inputClass} value={leadToLink[client.clientId] || ""} onChange={(event) => setLeadToLink((current) => ({ ...current, [client.clientId!]: event.target.value }))}><option value="">Select opportunity (no records are linked automatically)</option>{leads.filter((lead) => !lead.client_id && client.verticals.includes(lead.vertical)).map((lead) => <option key={lead.id} value={lead.id}>{lead.name} · {lead.vertical} · {lead.status}</option>)}</select></label><button type="button" disabled={!leadToLink[client.clientId] || linkingLead} onClick={() => void linkLead(client)} className="self-end rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{linkingLead ? "Linking…" : "Link opportunity"}</button></div>}

                        <h2 className="mt-5 text-sm font-bold uppercase tracking-wide text-slate-600">Opportunities</h2>
                        {opportunities.length === 0 ? <p className="mt-3 text-sm text-slate-500">No permitted opportunities are linked to this client yet.</p> : <div className="mt-3 grid gap-3 lg:grid-cols-2">
                          {opportunities.map((lead) => (
                            <div key={lead.id} className="rounded-lg border border-slate-200 bg-white p-4">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <h3 className="font-semibold text-slate-900">{lead.product || "Unspecified opportunity"}</h3>
                                  <p className="mt-1 text-sm text-slate-600">{lead.vertical} · {lead.status} · {lead.priority || "No priority"}</p>
                                </div>
                                <Link href={`/dashboard/leads?edit=${encodeURIComponent(lead.id)}`} className="text-sm font-semibold text-blue-700">Edit</Link>
                              </div>
                              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                                <div><dt className="font-semibold">Next follow-up</dt><dd className="mt-1">{formatLeadDate(lead.followup)} · {opportunityFollowup(lead, today)}</dd></div>
                                <div><dt className="font-semibold">Assigned to</dt><dd className="mt-1">{profileNames.get(lead.owner_id || "") || formatCrmPersonName(lead.owner) || "Unassigned"}</dd></div>
                                <div><dt className="font-semibold">Expected value</dt><dd className="mt-1">₹{Number(lead.value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</dd></div>
                                <div><dt className="font-semibold">Last updated</dt><dd className="mt-1">{formatLeadDate(lead.updated_at?.slice(0, 10) || null)}</dd></div>
                              </dl>
                              {lead.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{lead.notes}</p>}
                            </div>
                          ))}
                        </div>}
                      </div>
                    )}
                  </article>
                );
              })}
        </section>

        <p className="text-xs text-slate-500">This contact grouping respects existing Leads RLS. Employees only see opportunities assigned to them; administrator views include all visible leads.</p>
      </div>
    </main>
  );
}
