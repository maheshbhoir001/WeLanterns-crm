"use client";

import { useEffect, useState } from "react";
import type { LeadRole } from "@/lib/crm/leads";
import { getProfileDisplayName } from "@/lib/crm/display-names";
import { useCrmVerticals } from "@/lib/crm/use-verticals";

type EmployeeOption = { id: string; full_name: string; role: LeadRole };
type ExportHistoryItem = { at: string; filters: string };
const statuses = ["New", "Contacted", "Qualified", "Proposal", "Won", "Lost", "Booked", "Confirmed", "Unpaid", "Paid", "Partially paid"];
const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100";

export default function ExportsClient({ userId, role }: { userId: string; role: LeadRole }) {
  const verticals = useCrmVerticals(userId, role);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [vertical, setVertical] = useState("");
  const [employee, setEmployee] = useState("");
  const [status, setStatus] = useState("");
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [history, setHistory] = useState<ExportHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem("welanterns:export-history");
        if (saved) setHistory(JSON.parse(saved) as ExportHistoryItem[]);
      } catch { setHistory([]); }
      void fetch("/api/exports?options=1").then(async (response) => {
        if (!response.ok) return;
        const result = await response.json() as { employees?: EmployeeOption[] };
        setEmployees(result.employees ?? []);
      }).catch(() => setError("Employee filter could not be loaded."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function downloadExport() {
    setLoading(true);
    setError("");
    setMessage("");
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (vertical) params.set("vertical", vertical);
    if (employee) params.set("employee", employee);
    if (status) params.set("status", status);
    try {
      const response = await fetch(`/api/exports?${params.toString()}`);
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || "Export failed.");
      }
      const blob = await response.blob();
      if (blob.type !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") throw new Error("The server did not return an XLSX workbook.");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `welanterns-crm-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      const filters = [from && `From ${from}`, to && `To ${to}`, vertical, (() => { const selected = employees.find((option) => option.id === employee); return selected ? getProfileDisplayName(selected) : ""; })(), status].filter(Boolean).join(" · ") || "All permitted records";
      const next = [{ at: new Date().toISOString(), filters }, ...history].slice(0, 20);
      setHistory(next);
      window.localStorage.setItem("welanterns:export-history", JSON.stringify(next));
      setMessage("XLSX export downloaded. The workbook includes an Export Notes sheet describing unavailable or schema-limited data.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Export failed.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="min-h-screen bg-slate-50 p-4 md:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <header><p className="text-sm font-semibold text-blue-700">WeLanterns Capital Advisory Pvt. Ltd.</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Data Export Centre</h1><p className="mt-2 max-w-3xl text-sm text-slate-600">Download authorized CRM data as an Excel workbook. Access remains limited by your account and Supabase row-level security.</p></header>
    <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-6">
      <h2 className="text-lg font-semibold text-slate-900">Export filters</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="grid gap-1 text-sm font-medium text-slate-700">From date<input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">To date<input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Vertical<select className={inputClass} value={vertical} onChange={(e) => setVertical(e.target.value)}><option value="">All permitted verticals</option>{verticals.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Status<select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
        {employees.length > 0 && <label className="grid gap-1 text-sm font-medium text-slate-700">Employee<select className={inputClass} value={employee} onChange={(e) => setEmployee(e.target.value)}><option value="">All authorized employees</option>{employees.filter((item) => item.role === "employee").map((item) => <option key={item.id} value={item.id}>{getProfileDisplayName(item)}</option>)}</select></label>}
      </div>
      <button type="button" disabled={loading} onClick={() => void downloadExport()} className="mt-5 rounded-lg bg-[#14234f] px-5 py-3 font-semibold text-white disabled:opacity-50">{loading ? "Preparing workbook…" : "Download XLSX"}</button>
      <p className="mt-3 text-xs text-slate-500">The workbook contains records permitted for your account. Export history on this page is stored only in this browser.</p>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}{message && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    </section>
    <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-6"><h2 className="text-lg font-semibold text-slate-900">Recent exports on this browser</h2>{history.length === 0 ? <p className="mt-3 text-sm text-slate-500">No exports recorded in this browser.</p> : <ol className="mt-3 divide-y divide-slate-100">{history.map((item, index) => <li key={`${item.at}-${index}`} className="py-3"><p className="text-sm font-medium text-slate-800">{new Date(item.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p><p className="mt-1 text-xs text-slate-500">{item.filters}</p></li>)}</ol>}</section>
  </div></main>;
}
