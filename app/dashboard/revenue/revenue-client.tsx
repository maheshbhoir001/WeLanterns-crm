"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getLeadVerticalOptionLabel } from "@/lib/crm/leads";
import { useCrmVerticals } from "@/lib/crm/use-verticals";
import { formatCrmPersonName } from "@/lib/crm/display-names";
import { getExpenseAuditAction, updateExpenseAction, voidExpenseAction, type ExpenseAuditEntry } from "@/app/actions/expenses";
import type { LeadRole } from "@/lib/crm/leads";

type RevenueRow = Record<string, unknown>;
type TabId = "overview" | "sales" | "invoices" | "collections" | "payouts" | "expenses";

const tabs: { id: TabId; label: string; table?: string; columns?: string[] }[] = [
  { id: "overview", label: "Overview" },
  { id: "sales", label: "Sales", table: "sales_transactions", columns: ["vertical", "product", "sale_value", "sale_date", "status", "notes"] },
  { id: "invoices", label: "Invoices", table: "business_invoices", columns: ["client_name", "invoice_number", "invoice_date", "due_date", "taxable_amount", "gst_amount", "total_amount", "collected", "outstanding", "status"] },
  { id: "collections", label: "Collections", table: "business_collections", columns: ["invoice_id", "amount", "payment_date", "payment_mode", "reference_number", "notes"] },
  { id: "payouts", label: "Payouts", table: "company_payouts", columns: ["vertical", "product", "client_name", "payout_type", "amount", "payout_date", "reference_number", "notes"] },
  { id: "expenses", label: "Expenses", table: "business_expenses", columns: ["vertical", "category", "description", "amount", "expense_date", "payment_mode", "status"] },
];
const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
const PAGE_SIZE = 25;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const money = (value: unknown) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
const text = (value: unknown) => value === null || value === undefined || value === "" ? "—" : String(value);
const moneyToPaise = (value: string) => {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
};
const isIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1 text-sm font-medium text-slate-700">{label}{children}</label>;
}

function VerticalSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
    {!value && <option value="" disabled>Select a vertical</option>}
    {[...new Set([...options, ...(value ? [value] : [])])].map((vertical) => <option key={vertical} value={vertical} disabled={!options.includes(vertical)}>
      {getLeadVerticalOptionLabel(vertical, options.includes(vertical))}
    </option>)}
  </select>;
}

export default function RevenueClient({ userId, role }: { userId: string; role: LeadRole }) {
  const supabase = useMemo(() => createClient(), []);
  const verticalOptions = useCrmVerticals(userId, role);
  const [tab, setTab] = useState<TabId>("overview");
  const [data, setData] = useState<Record<string, RevenueRow[]>>({});
  const [clients, setClients] = useState<{ id: string; name: string; primary_vertical: string; verticals: string[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidSchemaReady, setVoidSchemaReady] = useState(false);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<ExpenseAuditEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [recordSearch, setRecordSearch] = useState("");
  const [recordStatus, setRecordStatus] = useState("");
  const [recordFrom, setRecordFrom] = useState("");
  const [recordTo, setRecordTo] = useState("");
  const [recordPage, setRecordPage] = useState(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    client_name: "", client_id: "", vertical: "", product: "", sale_value: "", sale_date: "", sale_status: "Booked", sale_notes: "",
    invoice_number: "", invoice_date: "", due_date: "", taxable_amount: "", gst_amount: "", transaction_id: "",
    invoice_id: "", amount: "", payment_date: "", payment_mode: "Bank Transfer", reference_number: "", collection_notes: "",
    payout_type: "Commission", payout_date: "", payout_notes: "",
    category: "", description: "", expense_date: "", expense_mode: "Bank Transfer", expense_edit_reason: "",
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const currentDate = today();
      setForm((current) => ({
        ...current,
        sale_date: current.sale_date || currentDate,
        invoice_date: current.invoice_date || currentDate,
        payment_date: current.payment_date || currentDate,
        payout_date: current.payout_date || currentDate,
        expense_date: current.expense_date || currentDate,
      }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (verticalOptions.length && !verticalOptions.includes(form.vertical)) {
      const timer = window.setTimeout(() => setForm((current) => ({ ...current, vertical: verticalOptions[0] })), 0);
      return () => window.clearTimeout(timer);
    }
  }, [form.vertical, verticalOptions]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    const [results, clientsResult, clientVerticalsResult, expenseSchemaResult, expenseAuditResult] = await Promise.all([Promise.all(tabs.filter((item) => item.table).map(async (item) => {
      const response = await supabase.from(item.table!).select("*").order("created_at", { ascending: false });
      return { id: item.id, rows: response.data || [], error: response.error?.message };
    })), supabase.from("clients").select("id,name,primary_vertical").order("name"), supabase.from("client_verticals").select("client_id,vertical_name"), supabase.from("business_expenses").select("voided_at").limit(0), supabase.from("business_expense_audit").select("actor_name").limit(0)]);
    const failed = results.find((result) => result.error);
    if (failed) setError(`Could not load ${failed.id}: ${failed.error}`);
    setData(Object.fromEntries(results.map((result) => [result.id, result.rows as RevenueRow[]])));
    if (clientsResult.error) setError(`Could not load clients: ${clientsResult.error.message}`);
    else if (clientVerticalsResult.error) setError(`Client vertical relationships could not be loaded: ${clientVerticalsResult.error.message}`);
    else {
      const memberships = new Map<string, string[]>();
      for (const membership of clientVerticalsResult.data ?? []) memberships.set(membership.client_id, [...(memberships.get(membership.client_id) ?? []), membership.vertical_name]);
      setClients((clientsResult.data ?? []).map((client) => ({ ...client, verticals: Array.from(new Set([client.primary_vertical, ...(memberships.get(client.id) ?? [])])) })));
    }
    setVoidSchemaReady(!expenseSchemaResult.error && !expenseAuditResult.error);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadData(); }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);
  const sales = data.sales || [];
  const invoices = data.invoices || [];
  const collections = data.collections || [];
  const payouts = data.payouts || [];
  const currentTab = tabs.find((item) => item.id === tab)!;

  function collectedAmount(invoiceId: string) {
    return collections.filter((collection) => collection.invoice_id === invoiceId)
      .reduce((sum, collection) => sum + Number(collection.amount || 0), 0);
  }

  function outstandingAmount(invoice: RevenueRow) {
    return Math.max(0, Number(invoice.total_amount || 0) - collectedAmount(String(invoice.id)));
  }

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startEdit(recordTab: Exclude<TabId, "overview">, row: RevenueRow) {
    if (recordTab === "expenses" && row.voided_at) {
      setError("Voided expenses are retained for audit and cannot be edited.");
      return;
    }
    setTab(recordTab);
    setEditingRecordId(String(row.id));
    const common = {
      client_name: String(row.client_name || ""),
      product: String(row.product || ""),
      vertical: String(row.vertical || verticalOptions[0] || ""),
      invoice_date: String(row.invoice_date || today()),
      due_date: String(row.due_date || ""),
      invoice_number: String(row.invoice_number || ""),
      taxable_amount: String(row.taxable_amount ?? ""),
      gst_amount: String(row.gst_amount ?? ""),
      transaction_id: String(row.transaction_id || ""),
      invoice_id: String(row.invoice_id || ""),
      amount: String(row.amount ?? ""),
      payment_date: String(row.payment_date || today()),
      payment_mode: String(row.payment_mode || "Bank Transfer"),
      reference_number: String(row.reference_number || ""),
      collection_notes: String(row.notes || ""),
      payout_type: String(row.payout_type || "Commission"),
      payout_date: String(row.payout_date || today()),
      payout_notes: String(row.notes || ""),
      category: String(row.category || ""),
      description: String(row.description || ""),
      expense_date: String(row.expense_date || today()),
      expense_mode: String(row.payment_mode || "Bank Transfer"),
      expense_edit_reason: "",
      sale_value: String(row.sale_value ?? ""),
      sale_date: String(row.sale_date || today()),
      sale_status: String(row.status || "Booked"),
      sale_notes: String(row.notes || ""),
      client_id: String(row.client_id || ""),
    };
    setForm((current) => ({ ...current, ...common }));
    setError("");
    setNotice("");
  }

  function cancelEdit() {
    setEditingRecordId(null);
    setError("");
    setNotice("");
    setForm((current) => ({ ...current, client_name: "", client_id: "", product: "", sale_value: "", sale_notes: "", invoice_number: "", due_date: "", taxable_amount: "", gst_amount: "", transaction_id: "", invoice_id: "", amount: "", reference_number: "", collection_notes: "", payout_notes: "", category: "", description: "", expense_edit_reason: "", sale_date: today(), invoice_date: today(), payment_date: today(), payout_date: today(), expense_date: today() }));
  }

  async function saveRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);

    const failValidation = (message: string) => {
      setError(message);
      setSaving(false);
    };
    if (["sales", "payouts", "expenses"].includes(tab) && !verticalOptions.includes(form.vertical)) {
      failValidation("Choose an active business vertical.");
      return;
    }
    if (tab === "sales" && form.client_id) {
      const client = clients.find((row) => row.id === form.client_id);
      if (!client || !client.verticals.includes(form.vertical)) {
        failValidation("Choose a client linked to the selected business vertical.");
        return;
      }
    }
    if (tab === "invoices" && form.transaction_id) {
      const sale = sales.find((row) => String(row.id) === form.transaction_id);
      if (!sale) {
        failValidation("Choose a valid related sale.");
        return;
      }
      if (sale.client_id) {
        const client = clients.find((row) => row.id === sale.client_id);
        if (!client || client.name.trim().toLocaleLowerCase() !== form.client_name.trim().toLocaleLowerCase()) {
          failValidation("The invoice client must match the canonical client linked to the selected sale.");
          return;
        }
      }
    }
    const dateByTab: Partial<Record<TabId, string>> = {
      sales: form.sale_date,
      invoices: form.invoice_date,
      collections: form.payment_date,
      payouts: form.payout_date,
      expenses: form.expense_date,
    };
    if (!dateByTab[tab] || !isIsoDate(dateByTab[tab]!)) {
      failValidation("Enter a valid record date.");
      return;
    }
    if (tab === "invoices" && form.due_date && (!isIsoDate(form.due_date) || form.due_date < form.invoice_date)) {
      failValidation("The invoice due date must be valid and on or after the invoice date.");
      return;
    }

    const amountCents = moneyToPaise(form.amount);
    const saleCents = moneyToPaise(form.sale_value);
    const taxableCents = moneyToPaise(form.taxable_amount);
    const gstCents = moneyToPaise(form.gst_amount);
    if (tab === "sales" && (!form.product.trim() || saleCents === null || saleCents <= 0)) {
      failValidation("Enter a product or service and a sale amount greater than ₹0, with no more than two decimal places.");
      return;
    }
    if (tab === "invoices" && (!form.client_name.trim() || !form.invoice_number.trim() || taxableCents === null || gstCents === null || taxableCents < 0 || gstCents < 0 || taxableCents + gstCents <= 0)) {
      failValidation("Enter the client, invoice number, and valid non-negative taxable and GST amounts. The invoice total must be greater than ₹0.");
      return;
    }
    if (tab === "invoices" && editingRecordId && taxableCents !== null && gstCents !== null) {
      const alreadyCollectedCents = Math.round(collectedAmount(editingRecordId) * 100);
      if (taxableCents + gstCents < alreadyCollectedCents) {
        failValidation(`Invoice total cannot be lower than the ${money(alreadyCollectedCents / 100)} already collected.`);
        return;
      }
    }
    if (tab === "collections") {
      const invoice = invoices.find((row) => String(row.id) === form.invoice_id);
      const currentCollection = editingRecordId ? collections.find((row) => String(row.id) === editingRecordId) : null;
      const creditBackCents = currentCollection?.invoice_id === form.invoice_id ? Math.round(Number(currentCollection.amount || 0) * 100) : 0;
      const balanceCents = invoice ? Math.max(0, Math.round(outstandingAmount(invoice) * 100) + creditBackCents) : 0;
      if (!invoice || amountCents === null || amountCents <= 0 || amountCents > balanceCents) {
        failValidation(`Enter a collection amount up to the selected invoice balance of ${money(balanceCents / 100)}.`);
        return;
      }
    }
    if (tab === "payouts" && (!form.product.trim() || !form.payout_type.trim() || amountCents === null || amountCents <= 0)) {
      failValidation("Enter a payout type, product or service, and an amount greater than ₹0 with no more than two decimal places.");
      return;
    }
    if (tab === "expenses" && (!form.category.trim() || amountCents === null || amountCents < 0)) {
      failValidation("Enter an expense category and a non-negative amount with no more than two decimal places.");
      return;
    }
    if (tab === "expenses" && editingRecordId && voidSchemaReady && !form.expense_edit_reason.trim()) {
      failValidation("Enter a reason for this expense edit.");
      return;
    }

    let table = "";
    let payload: Record<string, unknown> = {};

    if (tab === "sales") {
      table = "sales_transactions";
      payload = { client_id: form.client_id || null, vertical: form.vertical, product: form.product.trim(), sale_value: saleCents! / 100, sale_date: form.sale_date, status: form.sale_status, notes: form.client_name.trim() ? `Client: ${form.client_name.trim()}${form.sale_notes.trim() ? `\n${form.sale_notes.trim()}` : ""}` : form.sale_notes.trim() || null };
    } else if (tab === "invoices") {
      const taxable = taxableCents! / 100;
      const gst = gstCents! / 100;
      table = "business_invoices";
      const existingStatus = editingRecordId ? invoices.find((invoice) => String(invoice.id) === editingRecordId)?.status : null;
      payload = { transaction_id: form.transaction_id || null, client_name: form.client_name.trim(), invoice_number: form.invoice_number.trim(), invoice_date: form.invoice_date, due_date: form.due_date || null, taxable_amount: taxable, gst_amount: gst, total_amount: (taxableCents! + gstCents!) / 100, status: String(existingStatus || "Unpaid") };
    } else if (tab === "collections") {
      table = "business_collections";
      payload = { invoice_id: form.invoice_id, amount: amountCents! / 100, payment_date: form.payment_date, payment_mode: form.payment_mode, reference_number: form.reference_number.trim() || null, notes: form.collection_notes.trim() || null };
    } else if (tab === "payouts") {
      table = "company_payouts";
      payload = { vertical: form.vertical, product: form.product.trim(), client_name: form.client_name.trim() || null, payout_type: form.payout_type, amount: amountCents! / 100, payout_date: form.payout_date, reference_number: form.reference_number.trim() || null, notes: form.payout_notes.trim() || null };
    } else if (tab === "expenses") {
      table = "business_expenses";
      payload = { vertical: form.vertical, category: form.category.trim(), description: form.description.trim() || null, amount: amountCents! / 100, expense_date: form.expense_date, payment_mode: form.expense_mode };
    }

    if (!table) { setSaving(false); return; }
    if (tab === "expenses" && editingRecordId && voidSchemaReady) {
      const result = await updateExpenseAction(editingRecordId, {
        vertical: form.vertical,
        category: form.category.trim(),
        description: form.description.trim() || null,
        amount: amountCents! / 100,
        expense_date: form.expense_date,
        payment_mode: form.expense_mode,
        editReason: form.expense_edit_reason,
      });
      if (!result.ok) {
        setError(`Could not update expense: ${result.error}`);
        setSaving(false);
        return;
      }
    } else {
      const query = editingRecordId
        ? supabase.from(table).update(payload).eq("id", editingRecordId)
        : supabase.from(table).insert(payload);
      const result = await query.select("id").maybeSingle();
      if (result.error || !result.data) {
        setError(`Could not ${editingRecordId ? "update" : "save"} ${currentTab.label.toLowerCase()} record: ${result.error?.message || "The database did not confirm a saved row under this account."}`);
        setSaving(false);
        return;
      }
    }

    setNotice(`${currentTab.label.slice(0, -1) || currentTab.label} ${editingRecordId ? "updated" : "saved"}.`);
    setEditingRecordId(null);
    setForm((current) => ({ ...current, client_name: "", client_id: "", product: "", sale_value: "", sale_notes: "", invoice_number: "", due_date: "", taxable_amount: "", gst_amount: "", transaction_id: "", invoice_id: "", amount: "", reference_number: "", collection_notes: "", payout_notes: "", category: "", description: "", expense_edit_reason: "", sale_date: today(), invoice_date: today(), payment_date: today(), payout_date: today(), expense_date: today() }));
    await loadData();
    setSaving(false);
  }

  async function voidExpense(row: RevenueRow) {
    const id = String(row.id || "");
    if (!id || !voidSchemaReady || row.voided_at) return;
    if (!window.confirm("Void this expense? It will remain in the audit history and be excluded from active totals.")) return;
    const reason = window.prompt("Enter the reason for voiding this expense (required):");
    if (reason === null) return;
    if (!reason.trim()) {
      setError("A reason is required to void an expense.");
      return;
    }
    setError("");
    setNotice("");
    setVoidingId(id);
    const result = await voidExpenseAction(id, reason);
    if (!result.ok) {
      setError(`Could not void expense: ${result.error}`);
      setVoidingId(null);
      return;
    }
    setNotice("Expense voided. Its audit history is preserved and active totals have been refreshed.");
    await loadData();
    setVoidingId(null);
  }

  async function toggleExpenseHistory(id: string) {
    if (historyId === id) {
      setHistoryId(null);
      return;
    }
    setHistoryId(id);
    setHistoryLoading(true);
    const result = await getExpenseAuditAction(id);
    if (!result.ok) {
      setError(`Expense history could not be loaded: ${result.error}`);
      setHistoryEntries([]);
    } else {
      setHistoryEntries(result.entries);
      setError("");
    }
    setHistoryLoading(false);
  }

  function renderEntryForm() {
    const selectedInvoice = invoices.find((invoice) => String(invoice.id) === form.invoice_id);
    const editedCollection = editingRecordId ? collections.find((row) => String(row.id) === editingRecordId) : null;
    const collectionAmountLimit = selectedInvoice
      ? outstandingAmount(selectedInvoice) + (editedCollection?.invoice_id === form.invoice_id ? Number(editedCollection.amount || 0) : 0)
      : 0;
    return <form onSubmit={saveRecord} className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 md:p-5">
      <h3 className="font-semibold text-slate-900">{editingRecordId ? "Edit" : "Add"} {currentTab.label.slice(0, -1)}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tab === "sales" && <>
          <Field label="Canonical client (optional)"><select className={inputClass} value={form.client_id} onChange={(event) => { const client = clients.find((row) => row.id === event.target.value); const vertical = client?.verticals.find((value) => verticalOptions.includes(value)) || form.vertical; setForm((current) => ({ ...current, client_id: event.target.value, ...(client ? { client_name: client.name, vertical } : {}) })); }}><option value="">No linked client</option>{clients.filter((client) => client.verticals.some((value) => verticalOptions.includes(value))).map((client) => <option key={client.id} value={client.id}>{client.name} · {client.verticals.filter((value) => verticalOptions.includes(value)).join(", ")}</option>)}</select></Field>
          <Field label="Client name (optional)"><input className={inputClass} maxLength={160} value={form.client_name} onChange={(e) => update("client_name", e.target.value)} /></Field>
          <Field label="Vertical"><VerticalSelect value={form.vertical} options={verticalOptions} onChange={(value) => update("vertical", value)} /></Field>
          <Field label="Product / service"><input required maxLength={160} className={inputClass} value={form.product} onChange={(e) => update("product", e.target.value)} /></Field>
          <Field label="Sale amount (₹)"><input required type="number" min="0.01" step="0.01" className={inputClass} value={form.sale_value} onChange={(e) => update("sale_value", e.target.value)} /></Field>
          <Field label="Sale date"><input required type="date" className={inputClass} value={form.sale_date} onChange={(e) => update("sale_date", e.target.value)} /></Field>
          <Field label="Status"><select className={inputClass} value={form.sale_status} onChange={(e) => update("sale_status", e.target.value)}><option>Booked</option><option>Confirmed</option><option>Cancelled</option></select></Field>
          <Field label="Notes"><textarea className={inputClass} rows={2} maxLength={4000} value={form.sale_notes} onChange={(e) => update("sale_notes", e.target.value)} /></Field>
        </>}
        {tab === "invoices" && <>
          <Field label="Client name"><input required maxLength={160} className={inputClass} value={form.client_name} onChange={(e) => update("client_name", e.target.value)} /></Field>
          <Field label="Invoice number"><input required maxLength={80} className={inputClass} value={form.invoice_number} onChange={(e) => update("invoice_number", e.target.value)} /></Field>
          <Field label="Invoice date"><input required type="date" className={inputClass} value={form.invoice_date} onChange={(e) => update("invoice_date", e.target.value)} /></Field>
          <Field label="Due date"><input type="date" className={inputClass} value={form.due_date} onChange={(e) => update("due_date", e.target.value)} /></Field>
          <Field label="Related sale (optional)"><select className={inputClass} value={form.transaction_id} onChange={(event) => { const sale = sales.find((row) => String(row.id) === event.target.value); const client = clients.find((row) => row.id === sale?.client_id); setForm((current) => ({ ...current, transaction_id: event.target.value, ...(client ? { client_name: client.name } : {}) })); }}><option value="">No linked sale</option>{sales.map((sale) => { const clientName = clients.find((client) => client.id === sale.client_id)?.name; return <option key={String(sale.id)} value={String(sale.id)}>{clientName ? `${clientName} · ` : ""}{String(sale.product)} · {money(sale.sale_value)} · {String(sale.sale_date)}</option>; })}</select></Field>
          <Field label="Taxable amount (₹)"><input required type="number" min="0" step="0.01" className={inputClass} value={form.taxable_amount} onChange={(e) => update("taxable_amount", e.target.value)} /></Field>
          <Field label="GST amount (₹)"><input required type="number" min="0" step="0.01" className={inputClass} value={form.gst_amount} onChange={(e) => update("gst_amount", e.target.value)} /></Field>
        </>}
        {tab === "collections" && <>
          <Field label="Invoice"><select required className={inputClass} value={form.invoice_id} onChange={(e) => update("invoice_id", e.target.value)}><option value="">{invoices.some((invoice) => outstandingAmount(invoice) > 0) ? "Select an invoice" : "No invoices with an outstanding balance"}</option>{invoices.filter((invoice) => outstandingAmount(invoice) > 0 || String(invoice.id) === form.invoice_id).map((invoice) => <option key={String(invoice.id)} value={String(invoice.id)}>{String(invoice.invoice_number)} · {String(invoice.client_name)} · balance {money(outstandingAmount(invoice))}</option>)}</select></Field>
          <Field label="Amount received (₹)"><input required type="number" min="0.01" max={String(collectionAmountLimit)} step="0.01" className={inputClass} value={form.amount} onChange={(e) => update("amount", e.target.value)} /></Field>
          <Field label="Payment date"><input required type="date" className={inputClass} value={form.payment_date} onChange={(e) => update("payment_date", e.target.value)} /></Field>
          <Field label="Payment mode"><select className={inputClass} value={form.payment_mode} onChange={(e) => update("payment_mode", e.target.value)}><option>Bank Transfer</option><option>UPI</option><option>Cash</option><option>Cheque</option><option>Card</option><option>Other</option></select></Field>
          <Field label="Reference number"><input className={inputClass} maxLength={120} value={form.reference_number} onChange={(e) => update("reference_number", e.target.value)} /></Field>
          <Field label="Notes"><input className={inputClass} maxLength={1000} value={form.collection_notes} onChange={(e) => update("collection_notes", e.target.value)} /></Field>
        </>}
        {tab === "payouts" && <>
          <Field label="Vertical"><VerticalSelect value={form.vertical} options={verticalOptions} onChange={(value) => update("vertical", value)} /></Field>
          <Field label="Product / service"><input required maxLength={160} className={inputClass} value={form.product} onChange={(e) => update("product", e.target.value)} /></Field>
          <Field label="Client name (optional)"><input className={inputClass} maxLength={160} value={form.client_name} onChange={(e) => update("client_name", e.target.value)} /></Field>
          <Field label="Payout type"><select className={inputClass} value={form.payout_type} onChange={(e) => update("payout_type", e.target.value)}><option>Commission</option><option>Brokerage</option><option>Consultancy</option><option>Referral</option><option>Other</option></select></Field>
          <Field label="Amount (₹)"><input required type="number" min="0.01" step="0.01" className={inputClass} value={form.amount} onChange={(e) => update("amount", e.target.value)} /></Field>
          <Field label="Payout date"><input required type="date" className={inputClass} value={form.payout_date} onChange={(e) => update("payout_date", e.target.value)} /></Field>
          <Field label="Reference number"><input className={inputClass} value={form.reference_number} onChange={(e) => update("reference_number", e.target.value)} /></Field>
          <Field label="Notes"><input className={inputClass} value={form.payout_notes} onChange={(e) => update("payout_notes", e.target.value)} /></Field>
        </>}
        {tab === "expenses" && <>
          <Field label="Vertical"><VerticalSelect value={form.vertical} options={verticalOptions} onChange={(value) => update("vertical", value)} /></Field>
          <Field label="Category"><input required maxLength={120} className={inputClass} value={form.category} onChange={(e) => update("category", e.target.value)} /></Field>
          <Field label="Description"><input className={inputClass} maxLength={500} value={form.description} onChange={(e) => update("description", e.target.value)} /></Field>
          <Field label="Amount (₹)"><input required type="number" min="0" step="0.01" className={inputClass} value={form.amount} onChange={(e) => update("amount", e.target.value)} /></Field>
          <Field label="Expense date"><input required type="date" className={inputClass} value={form.expense_date} onChange={(e) => update("expense_date", e.target.value)} /></Field>
          <Field label="Payment mode"><select className={inputClass} value={form.expense_mode} onChange={(e) => update("expense_mode", e.target.value)}><option>Bank Transfer</option><option>UPI</option><option>Cash</option><option>Cheque</option><option>Card</option><option>Other</option></select></Field>
          {editingRecordId && voidSchemaReady && <Field label="Reason for edit (required for audit)"><input required maxLength={1000} className={inputClass} value={form.expense_edit_reason} onChange={(e) => update("expense_edit_reason", e.target.value)} /></Field>}
        </>}
      </div>
      <div className="mt-5 flex flex-wrap gap-2"><button disabled={saving} className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : editingRecordId ? "Save changes" : "Save record"}</button>{editingRecordId && <button type="button" disabled={saving} onClick={cancelEdit} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold">Cancel edit</button>}</div>
    </form>;
  }

  function renderRecordTable({ id }: { id: TabId }) {
    const config = tabs.find((item) => item.id === id)!;
    const list = data[id] || [];
    const dateColumn: Partial<Record<Exclude<TabId, "overview">, string>> = { sales: "sale_date", invoices: "invoice_date", collections: "payment_date", payouts: "payout_date", expenses: "expense_date" };
    const dateField = dateColumn[id as Exclude<TabId, "overview">];
    const filtered = list.filter((row) => {
      const rowDate = String(row[dateField || ""] || "").slice(0, 10);
      const statusValue = id === "invoices"
        ? (outstandingAmount(row) === 0 ? "Paid" : collectedAmount(String(row.id)) > 0 ? "Partially paid" : String(row.status || "Unpaid"))
        : id === "expenses" ? (row.voided_at ? "Voided" : "Active") : String(row.status || "");
      const matchesSearch = !recordSearch.trim() || Object.values(row).some((value) => String(value ?? "").toLocaleLowerCase().includes(recordSearch.trim().toLocaleLowerCase()));
      return matchesSearch
        && (!recordStatus || statusValue === recordStatus)
        && (!recordFrom || !rowDate || rowDate >= recordFrom)
        && (!recordTo || !rowDate || rowDate <= recordTo);
    });
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageRows = filtered.slice((Math.min(recordPage, pageCount) - 1) * PAGE_SIZE, Math.min(recordPage, pageCount) * PAGE_SIZE);
    if (!loading && list.length === 0) return <p className="mt-5 rounded-xl bg-white p-8 text-center text-sm text-slate-500">No {config.label.toLowerCase()} recorded yet.</p>;
    function cell(row: RevenueRow, column: string) {
      if (id === "invoices") {
        const collected = collectedAmount(String(row.id));
        const balance = outstandingAmount(row);
        if (column === "collected") return money(collected);
        if (column === "outstanding") return money(balance);
        if (column === "status") return balance === 0 ? "Paid" : collected > 0 ? "Partially paid" : text(row.status);
      }
      if (id === "collections" && column === "invoice_id") {
        const invoice = invoices.find((candidate) => candidate.id === row.invoice_id);
        return invoice ? `${text(invoice.invoice_number)} · ${text(invoice.client_name)}` : text(row.invoice_id);
      }
      if (id === "expenses" && column === "status") return row.voided_at ? "Voided" : "Active";
      return column.includes("amount") || column === "sale_value" ? money(row[column]) : text(row[column]);
    }
    return <div className="mt-5 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input aria-label={`Search ${config.label}`} placeholder={`Search ${config.label.toLowerCase()}…`} className={inputClass} value={recordSearch} onChange={(event) => { setRecordSearch(event.target.value); setRecordPage(1); }} />
        <input aria-label="Filter from date" type="date" className={inputClass} value={recordFrom} onChange={(event) => { setRecordFrom(event.target.value); setRecordPage(1); }} />
        <input aria-label="Filter to date" type="date" className={inputClass} value={recordTo} onChange={(event) => { setRecordTo(event.target.value); setRecordPage(1); }} />
        {(id === "sales" || id === "invoices" || id === "expenses") && <select aria-label="Filter record status" className={inputClass} value={recordStatus} onChange={(event) => { setRecordStatus(event.target.value); setRecordPage(1); }}><option value="">All statuses</option>{(id === "sales" ? ["Booked", "Confirmed", "Cancelled"] : id === "invoices" ? ["Unpaid", "Partially paid", "Paid"] : ["Active", "Voided"]).map((status) => <option key={status}>{status}</option>)}</select>}
      </div>
      {id === "expenses" && !loading && !voidSchemaReady && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Expense audit history and void controls are unavailable under the current database permissions.</p>}
      {filtered.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No records match these filters.</p> : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-max text-left text-sm"><thead className="bg-slate-100 text-slate-600"><tr>{config.columns!.map((column) => <th key={column} className="px-4 py-3 font-semibold capitalize">{column.replaceAll("_", " ")}</th>)}<th className="px-4 py-3 font-semibold">Actions</th></tr></thead><tbody>{pageRows.map((row, index) => {
        const rowId = String(row.id ?? index);
        const voided = id === "expenses" && Boolean(row.voided_at);
        return <Fragment key={rowId}>
          <tr key={rowId} className={`border-t${voided ? " bg-slate-50 text-slate-500" : ""}`}>
            {config.columns!.map((column) => <td key={column} className="px-4 py-3 text-slate-700">{cell(row, column)}</td>)}
            <td className="px-4 py-3"><div className="flex items-center gap-3">
              {!voided && <button type="button" onClick={() => startEdit(id as Exclude<TabId, "overview">, row)} className="text-sm font-semibold text-blue-700">Edit</button>}
              {id === "expenses" && !voided && voidSchemaReady && <button type="button" disabled={voidingId === rowId} onClick={() => void voidExpense(row)} className="text-sm font-semibold text-red-700 disabled:opacity-50">{voidingId === rowId ? "Voiding…" : "Void"}</button>}
              {id === "expenses" && voidSchemaReady && <button type="button" onClick={() => void toggleExpenseHistory(rowId)} className="text-sm font-semibold text-slate-700">{historyId === rowId ? "Hide history" : "History"}</button>}
            </div></td>
          </tr>
          {id === "expenses" && historyId === rowId && <tr key={`${rowId}-history`}><td colSpan={config.columns!.length + 1} className="border-t bg-slate-50 px-4 py-4">
            <h3 className="font-semibold text-slate-800">Expense audit history</h3>
            {historyLoading ? <p className="mt-2 text-sm text-slate-500">Loading history…</p> : historyEntries.length === 0 ? <p className="mt-2 text-sm text-slate-500">No audit events are available for this expense.</p> : <ol className="mt-3 space-y-3">{historyEntries.map((entry) => <li key={entry.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2"><strong className="capitalize">{entry.action}</strong><time className="text-xs text-slate-500">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(entry.created_at))}</time></div>
              <p className="mt-1 text-xs text-slate-600">By {formatCrmPersonName(entry.actor_name) || entry.actor_id || "Unknown user"}{entry.reason ? ` · Reason: ${entry.reason}` : ""}</p>
              {(entry.old_values || entry.new_values) && <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-slate-600">View preserved expense details</summary><pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-50 p-2 text-[11px]">{JSON.stringify({ old: entry.old_values, new: entry.new_values }, null, 2)}</pre></details>}
            </li>)}</ol>}
          </td></tr>}
        </Fragment>;
      })}</tbody></table></div>}
      <div className="flex items-center justify-between text-sm text-slate-600"><span>{filtered.length} records · Page {Math.min(recordPage, pageCount)} of {pageCount}</span><div className="flex gap-2"><button type="button" disabled={recordPage <= 1} onClick={() => setRecordPage((page) => Math.max(1, page - 1))} className="rounded border px-3 py-1.5 disabled:opacity-40">Previous</button><button type="button" disabled={recordPage >= pageCount} onClick={() => setRecordPage((page) => Math.min(pageCount, page + 1))} className="rounded border px-3 py-1.5 disabled:opacity-40">Next</button></div></div>
    </div>;
  }

  return <main className="min-h-screen bg-slate-50 p-4 md:p-8"><div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-medium text-blue-700">WeLanterns Capital Advisory Pvt. Ltd.</p><h1 className="text-3xl font-bold text-slate-900">Revenue Management</h1><p className="mt-1 text-sm text-slate-500">Record and review sales, invoices, collections, payouts and expenses.</p></div><button type="button" onClick={() => void loadData()} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Refresh data</button></header>
    <nav className="flex flex-wrap gap-2" aria-label="Revenue sections">{tabs.map((item) => <button key={item.id} type="button" onClick={() => { setTab(item.id); setEditingRecordId(null); setRecordStatus(""); setRecordPage(1); setError(""); setNotice(""); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === item.id ? "bg-blue-700 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{item.label}</button>)}</nav>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {loading ? <p className="rounded-xl bg-white p-10 text-center text-slate-500">Loading revenue records…</p> : tab === "overview" ? <><section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[["Sales", sales.reduce((sum, row) => sum + Number(row.sale_value || 0), 0)],["Invoices", invoices.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)],["Collections", collections.reduce((sum, row) => sum + Number(row.amount || 0), 0)],["Payouts", payouts.reduce((sum, row) => sum + Number(row.amount || 0), 0)],["Expenses", (data.expenses || []).filter((row) => !row.voided_at).reduce((sum, row) => sum + Number(row.amount || 0), 0)]].map(([label, value]) => <article key={String(label)} className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Total {label}</p><p className="mt-2 text-xl font-bold text-slate-900">{money(value)}</p></article>)}</section><div className="grid gap-4 lg:grid-cols-2"><section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Recent sales</h2>{renderRecordTable({ id: "sales" })}</section><section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Recent collections</h2>{renderRecordTable({ id: "collections" })}</section></div></> : <><section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5"><h2 className="text-xl font-bold text-slate-900">{currentTab.label}</h2>{renderEntryForm()}</section>{renderRecordTable({ id: tab })}</>}
    <p className="text-xs text-slate-500">Finance records are restricted to group administrators.</p>
  </div></main>;
}
