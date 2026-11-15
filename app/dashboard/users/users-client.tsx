"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LeadRole } from "@/lib/crm/leads";
import { getProfileDisplayName } from "@/lib/crm/display-names";

type Profile = { id: string; full_name: string; email: string | null; role: LeadRole; created_at: string };
type VerticalAssignment = { id: string; profile_id: string; vertical_name: string };
const inputClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100";

export default function UsersClient({ userId, role }: { userId: string; role: LeadRole }) {
  const supabase = useMemo(() => createClient(), []);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [verticals, setVerticals] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<VerticalAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [verticalsReady, setVerticalsReady] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isSuperAdmin = role === "super_admin";
  const isAdmin = isSuperAdmin || role === "group_admin";
  const displayName = (profile: Profile) => getProfileDisplayName(profile, userId);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [profileResult, verticalResult] = await Promise.all([
      supabase.from("profiles").select("id,full_name,email,role,created_at").order("full_name"),
      supabase.from("business_verticals").select("name,is_active").eq("is_active", true).order("name"),
    ]);
    if (profileResult.error) setError(`Profiles could not be loaded: ${profileResult.error.message}`);
    else setProfiles((profileResult.data ?? []) as Profile[]);

    if (verticalResult.error) {
      setVerticalsReady(false);
      if (verticalResult.error.code !== "PGRST205" && verticalResult.error.code !== "42P01") {
        setError(`Vertical assignments could not be loaded: ${verticalResult.error.message}`);
      }
      setVerticals([]);
      setAssignments([]);
    } else {
      const { data, error: assignmentsError } = await supabase.from("profile_verticals").select("id,profile_id,vertical_name");
      if (assignmentsError) {
        setVerticalsReady(false);
        setVerticals([]);
        setAssignments([]);
        setError(`Employee vertical access could not be loaded: ${assignmentsError.message}`);
      } else {
        setVerticalsReady(true);
        setVerticals((verticalResult.data ?? []).map((item) => item.name));
        setAssignments((data ?? []) as VerticalAssignment[]);
      }
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  async function toggleVertical(profile: Profile, vertical: string, checked: boolean) {
    if (!isAdmin || profile.role !== "employee") return;
    const key = `${profile.id}:${vertical}`;
    setSavingKey(key);
    setError("");
    setNotice("");
    if (checked) {
      const { data, error: insertError } = await supabase.from("profile_verticals").insert({ profile_id: profile.id, vertical_name: vertical, assigned_by: userId }).select("id,profile_id,vertical_name").single();
      if (insertError) setError(`Could not grant ${vertical} access to ${displayName(profile)}: ${insertError.message}`);
      else if (data) { setAssignments((current) => [...current, data as VerticalAssignment]); setNotice(`${vertical} assigned to ${displayName(profile)}.`); }
    } else {
      const assignment = assignments.find((item) => item.profile_id === profile.id && item.vertical_name === vertical);
      if (assignment) {
        const { error: deleteError } = await supabase.from("profile_verticals").delete().eq("id", assignment.id);
        if (deleteError) setError(`Could not remove ${vertical} access from ${displayName(profile)}: ${deleteError.message}`);
        else { setAssignments((current) => current.filter((item) => item.id !== assignment.id)); setNotice(`${vertical} removed from ${displayName(profile)}.`); }
      }
    }
    setSavingKey("");
  }

  async function changeRole(profile: Profile, nextRole: LeadRole) {
    if (!isSuperAdmin || (profile.id === userId && nextRole !== "super_admin")) return;
    if (!window.confirm(`Change ${displayName(profile)}'s CRM role to ${nextRole.replaceAll("_", " ")}? Their access changes immediately.`)) return;
    setSavingKey(`role:${profile.id}`);
    setError("");
    setNotice("");
    const { data, error: updateError } = await supabase.from("profiles").update({ role: nextRole }).eq("id", profile.id).select("id,role").single();
    if (updateError) setError(`Role was not changed: ${updateError.message}`);
    else if (data) {
      setProfiles((current) => current.map((item) => item.id === profile.id ? { ...item, role: data.role as LeadRole } : item));
      setNotice(`Role updated for ${displayName(profile)}.`);
    }
    setSavingKey("");
  }

  return <main className="min-h-screen bg-slate-50 p-4 md:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <header><p className="text-sm font-semibold text-blue-700">WeLanterns Capital Advisory Pvt. Ltd.</p><h1 className="mt-1 text-3xl font-bold text-slate-900">User Management</h1><p className="mt-2 text-sm text-slate-600">Profiles are read from Supabase Auth-linked records. Role changes are protected by the existing profile RLS policy.</p></header>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!verticalsReady && !loading && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Employee vertical assignments are unavailable under the current account permissions. Resolve the database access error before changing assignments.</p>}
    <div className="flex justify-end"><button type="button" onClick={() => void load()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">Refresh</button></div>
    {loading ? <section className="rounded-xl bg-white p-10 text-center text-slate-500">Loading profiles…</section> : <section className="space-y-4">{profiles.map((profile) => <article key={profile.id} className="rounded-xl border border-slate-200 bg-white p-4 md:p-5"><div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center"><div><h2 className="font-semibold text-slate-900">{displayName(profile)}</h2><p className="mt-1 text-sm text-slate-600">{profile.email || "No email on profile"} · Added {new Date(profile.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold capitalize text-blue-800">{profile.role.replaceAll("_", " ")}</span>{isSuperAdmin && <select aria-label={`Role for ${displayName(profile)}`} className={inputClass} value={profile.role} disabled={savingKey === `role:${profile.id}` || (profile.id === userId && profile.role === "super_admin")} onChange={(event) => void changeRole(profile, event.target.value as LeadRole)}><option value="super_admin">Super Admin</option><option value="group_admin">Group Admin</option><option value="employee">Employee</option></select>}</div></div>
        {profile.role === "employee" && verticalsReady && <fieldset className="mt-4 border-t border-slate-100 pt-4"><legend className="text-sm font-semibold text-slate-700">Permitted business verticals</legend><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{verticals.map((vertical) => { const checked = assignments.some((item) => item.profile_id === profile.id && item.vertical_name === vertical); const key = `${profile.id}:${vertical}`; return <label key={vertical} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm"><input type="checkbox" checked={checked} disabled={!isAdmin || savingKey === key} onChange={(event) => void toggleVertical(profile, vertical, event.target.checked)} />{vertical}</label>; })}</div></fieldset>}
      </article>)}</section>}
    <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Creating Auth invitations requires a server-side Supabase Auth admin credential, which is not configured in the current app environment. No browser-side service key is used.</p>
  </div></main>;
}
