import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAppAccess } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isFinanceAdmin } from "@/lib/crm/permissions";
import ProtectedRouteFallback from "@/components/dashboard/protected-route-fallback";

type MetricRow = { id?: string; amount?: number | string | null; sale_value?: number | string | null; total_amount?: number | string | null; transaction_id?: string | null; invoice_id?: string | null; followup?: string | null; status?: string | null; vertical?: string | null };
const PAGE_SIZE = 1000;
const MAX_ROWS = 100_000;

async function readRows(table: string, column: string) {
  const supabase = await createClient();
  const rows: MetricRow[] = [];
  const expenseVoidSupport = table === "business_expenses"
    ? await supabase.from("business_expenses").select("voided_at").limit(0)
    : null;
  if (expenseVoidSupport?.error && !["42703", "PGRST204"].includes(expenseVoidSupport.error.code || "")) {
    throw new Error(`Expense void status could not be verified: ${expenseVoidSupport.error.message}`);
  }
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    let query = supabase.from(table).select(column);
    if (table === "business_expenses" && expenseVoidSupport && !expenseVoidSupport.error) query = query.is("voided_at", null);
    const { data, error } = await query.order("id").range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as MetricRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { rows, capped: false };
  }
  return { rows, capped: true };
}

function sum(rows: MetricRow[], field: keyof MetricRow) {
  return rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
}

async function ReportsContent() {
  await connection();
  const access = await getAppAccess();
  if (!access) redirect("/");
  if (!access.role) redirect("/access-denied");
  const isAdmin = isFinanceAdmin(access.role);
  const supabase = await createClient();
  const { data: catalog } = isAdmin
    ? await supabase.from("business_verticals").select("name").eq("is_active", true).order("name")
    : { data: [] as { name: string }[] };
  const verticals = (catalog ?? []).map((item) => item.name);
  const reportSources = [
    { label: "Sales", table: "sales_transactions", columns: "id,vertical,sale_value", field: "sale_value" as const },
    { label: "Invoices", table: "business_invoices", columns: "id,transaction_id,total_amount", field: "total_amount" as const },
    { label: "Collections", table: "business_collections", columns: "id,invoice_id,amount", field: "amount" as const },
    { label: "Payouts", table: "company_payouts", columns: "id,vertical,amount", field: "amount" as const },
    { label: "Expenses", table: "business_expenses", columns: "id,vertical,amount", field: "amount" as const },
  ];
  const results = await Promise.allSettled([
    readRows("leads", "id,followup,status"),
    ...(isAdmin ? reportSources.map((source) => readRows(source.table, source.columns)) : []),
  ]);
  const failures = results.filter((result) => result.status === "rejected");
  const datasets = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const leadData = results[0]?.status === "fulfilled" ? results[0].value.rows : [];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const dueFollowups = leadData.filter((row) => row.followup && String(row.followup) <= today && !["Won", "Lost"].includes(String(row.status))).length;
  const report = isAdmin ? results.slice(1).flatMap((result, index) => result.status === "fulfilled"
    ? [{ label: reportSources[index].label, count: result.value.rows.length, total: sum(result.value.rows, reportSources[index].field) }]
    : []) : [];
  const verticalPerformance = verticals.map((vertical) => {
    const bySource = results.slice(1).map((result, index) => ({ result, source: reportSources[index] }));
    const rowsFor = (table: string) => {
      const dataset = bySource.find((item) => item.source.table === table)?.result;
      return dataset?.status === "fulfilled" ? dataset.value.rows : [];
    };
    const sales = rowsFor("sales_transactions");
    const invoices = rowsFor("business_invoices");
    const collections = rowsFor("business_collections");
    const saleById = new Map(sales.map((sale) => [sale.id, sale]));
    const linkedInvoices = invoices.filter((invoice) => invoice.transaction_id && saleById.get(invoice.transaction_id)?.vertical === vertical);
    const linkedInvoiceIds = new Set(linkedInvoices.map((invoice) => invoice.id));
    const linkedCollections = collections.filter((collection) => linkedInvoiceIds.has(collection.invoice_id || ""));
    return {
      vertical,
      sales: sum(sales.filter((row) => row.vertical === vertical), "sale_value"),
      invoices: sum(linkedInvoices, "total_amount"),
      collections: sum(linkedCollections, "amount"),
      payouts: sum(rowsFor("company_payouts").filter((row) => row.vertical === vertical), "amount"),
      expenses: sum(rowsFor("business_expenses").filter((row) => row.vertical === vertical), "amount"),
    };
  });
  const capped = datasets.some((item) => item.capped);

  return <main className="min-h-screen bg-slate-50 p-4 md:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <header><p className="text-sm font-semibold text-blue-700">WeLanterns Capital Advisory Pvt. Ltd.</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Reports and MIS</h1><p className="mt-2 text-sm text-slate-600">Live figures from records visible to your signed-in account.</p></header>
    {failures.length > 0 && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Some report data could not be loaded. Refresh or use the authorized export for details.</p>}
    {capped && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">A table reached the 100,000-row report limit. Use the export filters to produce a narrower workbook.</p>}
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <article className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">Visible leads</p><p className="mt-2 text-3xl font-bold text-[#14234f]">{leadData.length.toLocaleString("en-IN")}</p></article>
      <article className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">Due or overdue follow-ups</p><p className="mt-2 text-3xl font-bold text-[#14234f]">{dueFollowups.toLocaleString("en-IN")}</p><Link href="/dashboard/followups" className="mt-3 inline-block text-sm font-semibold text-blue-700">Open follow-ups</Link></article>
      {report.map((item) => <article key={item.label} className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">{item.label}</p><p className="mt-2 text-xl font-bold text-[#14234f]">₹{item.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p><p className="mt-1 text-xs text-slate-500">{item.count.toLocaleString("en-IN")} records</p></article>)}
    </section>
    {isAdmin && <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-6"><h2 className="text-lg font-semibold text-slate-900">Vertical performance</h2><p className="mt-1 text-sm text-slate-500">Invoices and collections are attributed through their linked sale. Unlinked invoices stay in overall totals and are not assigned to a vertical.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-100 text-slate-600"><tr>{["Vertical", "Sales", "Invoices", "Collections", "Payouts", "Expenses"].map((title) => <th key={title} className="px-3 py-3 font-semibold">{title}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{verticalPerformance.map((row) => <tr key={row.vertical}><th className="px-3 py-3 font-medium text-slate-900">{row.vertical}</th>{(["sales", "invoices", "collections", "payouts", "expenses"] as const).map((field) => <td key={field} className="px-3 py-3">₹{row[field].toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>)}</tr>)}</tbody></table></div></section>}
    {!isAdmin && <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Financial metrics are restricted to administrators. Lead figures reflect the rows permitted by your account and Supabase policies.</p>}
    <Link href="/dashboard/exports" className="inline-flex rounded-lg bg-[#14234f] px-4 py-3 text-sm font-semibold text-white">Open Data Export Centre</Link>
  </div></main>;
}

export default function ReportsPage() {
  return <Suspense fallback={<ProtectedRouteFallback />}><ReportsContent /></Suspense>;
}
