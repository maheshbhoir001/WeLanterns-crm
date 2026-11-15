import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { getAppAccess } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { groupClients, validDate } from "@/lib/crm/export-utils";
import { canAccessAssignedRecord, isFinanceAdmin } from "@/lib/crm/permissions";

type Row = Record<string, unknown>;
type Filter = { from: string; to: string; vertical: string; employee: string; status: string };
const PAGE_SIZE = 1000;
const MAX_ROWS = 100_000;
const dateColumns: Record<string, { name: string; timestamp: boolean }> = {
  leads: { name: "created_at", timestamp: true },
  clients: { name: "created_at", timestamp: true },
  sales_transactions: { name: "sale_date", timestamp: false },
  business_invoices: { name: "invoice_date", timestamp: false },
  business_collections: { name: "payment_date", timestamp: false },
  company_payouts: { name: "payout_date", timestamp: false },
  business_expenses: { name: "expense_date", timestamp: false },
  audit_log: { name: "created_at", timestamp: true },
  crm_followups: { name: "due_at", timestamp: true },
  crm_tasks: { name: "due_at", timestamp: true },
};

function jsonNoStore(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function readPaged(supabase: Awaited<ReturnType<typeof createClient>>, table: string, filter: Filter, columns = "*") {
  const rows: Row[] = [];
  const dateColumn = dateColumns[table];
  const expenseVoidSupport = table === "business_expenses"
    ? await supabase.from("business_expenses").select("voided_at").limit(0)
    : null;
  if (expenseVoidSupport?.error && !["42703", "PGRST204"].includes(expenseVoidSupport.error.code || "")) {
    throw new Error(`Expense void status could not be verified: ${expenseVoidSupport.error.message}`);
  }
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    let query = supabase.from(table).select(columns);
    if (table === "business_expenses" && expenseVoidSupport && !expenseVoidSupport.error) query = query.is("voided_at", null);
    if (dateColumn && filter.from) query = query.gte(dateColumn.name, dateColumn.timestamp ? `${filter.from}T00:00:00+05:30` : filter.from);
    if (dateColumn && filter.to) query = query.lte(dateColumn.name, dateColumn.timestamp ? `${filter.to}T23:59:59.999+05:30` : filter.to);
    const { data, error } = await query.order("id", { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Unable to export ${table}: ${error.message}`);
    const page = (data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}


export async function GET(request: NextRequest) {
  const access = await getAppAccess();
  if (!access?.role) return jsonNoStore({ error: "Sign in with an authorized CRM account." }, 401);
  const params = request.nextUrl.searchParams;
  const filter: Filter = {
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    vertical: params.get("vertical") ?? "",
    employee: params.get("employee") ?? "",
    status: params.get("status") ?? "",
  };
  if (!validDate(filter.from) || !validDate(filter.to) || (filter.from && filter.to && filter.from > filter.to)) {
    return jsonNoStore({ error: "Choose a valid date range." }, 400);
  }
  const supabase = await createClient();
  const { data: catalog, error: catalogError } = await supabase.from("business_verticals").select("name").eq("is_active", true);
  if (catalogError) return jsonNoStore({ error: "Active business verticals could not be verified." }, 503);
  let permittedVerticals = new Set((catalog ?? []).map((row) => row.name));
  if (access.role === "employee") {
    const { data: assignments, error: assignmentError } = await supabase.from("profile_verticals").select("vertical_name").eq("profile_id", access.userId);
    if (assignmentError) return jsonNoStore({ error: "Your business vertical access could not be verified." }, 503);
    const assigned = new Set((assignments ?? []).map((row) => row.vertical_name));
    permittedVerticals = new Set([...permittedVerticals].filter((vertical) => assigned.has(vertical)));
  }
  if (filter.vertical && !permittedVerticals.has(filter.vertical)) {
    return jsonNoStore({ error: "Choose an active business vertical permitted for your account." }, 403);
  }
  if (params.get("options") === "1") {
    if (!isFinanceAdmin(access.role)) return jsonNoStore({ employees: [] });
    const { data, error } = await supabase.from("profiles").select("id,full_name,role").order("full_name");
    if (error) return jsonNoStore({ error: "Employee filters are unavailable." }, 503);
    return jsonNoStore({ employees: data ?? [] });
  }

  try {
    const notes: string[] = [];
    const read = async (table: string, columns = "*") => {
      const result = await readPaged(supabase, table, filter, columns);
      if (result.truncated) notes.push(`${table}: export limited to ${MAX_ROWS.toLocaleString()} rows.`);
      return result.rows;
    };
    const readOptional = async (table: string, columns = "*") => {
      const probe = await supabase.from(table).select("id").limit(0);
      if (probe.error) {
        if (probe.error.code === "PGRST205" || probe.error.code === "42P01") return null;
        throw new Error(`Unable to access ${table}: ${probe.error.message}`);
      }
      return read(table, columns);
    };

    const allLeadRows = await readPaged(supabase, "leads", { ...filter, from: "", to: "" });
    if (allLeadRows.truncated) notes.push(`leads: follow-up dates limited to the first ${MAX_ROWS.toLocaleString()} rows.`);
    const allLeads = allLeadRows.rows.filter((row) => canAccessAssignedRecord(
      access.role,
      access.userId,
      typeof row.owner_id === "string" ? row.owner_id : null,
    ));
    let leads = allLeads.filter((row) => (!filter.from || String(row.created_at ?? "").slice(0, 10) >= filter.from)
      && (!filter.to || String(row.created_at ?? "").slice(0, 10) <= filter.to));
    leads = leads.filter((row) => (!filter.vertical || row.vertical === filter.vertical)
      && (!filter.employee || row.owner_id === filter.employee)
      && (!filter.status || row.status === filter.status));
    const clients = await readOptional("clients");
    const clientMembershipResult = clients && filter.vertical
      ? await supabase.from("client_verticals").select("client_id,vertical_name").eq("vertical_name", filter.vertical)
      : null;
    if (clientMembershipResult?.error) throw new Error(`Unable to verify client vertical relationships: ${clientMembershipResult.error.message}`);
    const clientsInVertical = new Set((clientMembershipResult?.data ?? []).map((row) => row.client_id));
    const clientRows = clients
      ? clients.filter((row) => canAccessAssignedRecord(access.role, access.userId, typeof row.owner_id === "string" ? row.owner_id : null)
        && (!filter.vertical || row.primary_vertical === filter.vertical || clientsInVertical.has(String(row.id)))
        && (!filter.employee || row.owner_id === filter.employee)
        && (!filter.status || row.lifecycle === filter.status))
      : groupClients(leads);
    const authorizedLeadIds = new Set(allLeads.map((row) => String(row.id ?? "")));
    const authorizedClientIds = new Set(clientRows.map((row) => String(row.id ?? "")));
    if (!clients) notes.push("Canonical client records are unavailable under the current account permissions; the Clients sheet is derived from authorized leads.");
    let followups = await readOptional("crm_followups");
    if (followups) {
      followups = followups.filter((row) => canAccessAssignedRecord(access.role, access.userId, typeof row.assigned_to === "string" ? row.assigned_to : null)
        && (!row.lead_id || authorizedLeadIds.has(String(row.lead_id)))
        && (!row.client_id || authorizedClientIds.has(String(row.client_id)))
        && (!filter.vertical || row.vertical === filter.vertical)
        && (!filter.employee || row.assigned_to === filter.employee)
        && (!filter.status || row.status === filter.status));
    } else {
      followups = allLeads.filter((row) => canAccessAssignedRecord(access.role, access.userId, typeof row.owner_id === "string" ? row.owner_id : null)
      && (!filter.vertical || row.vertical === filter.vertical)
      && (!filter.employee || row.owner_id === filter.employee)
      && (!filter.status || row.status === filter.status)
      && Boolean(row.followup)
      && (!filter.from || String(row.followup) >= filter.from)
      && (!filter.to || String(row.followup) <= filter.to));
      notes.push("The independent follow-up table is unavailable; the Follow-ups sheet uses existing lead follow-up dates.");
    }
    let tasks = await readOptional("crm_tasks");
    if (tasks) {
      tasks = tasks.filter((row) => canAccessAssignedRecord(access.role, access.userId, typeof row.assigned_to === "string" ? row.assigned_to : null)
        && (!row.lead_id || authorizedLeadIds.has(String(row.lead_id)))
        && (!row.client_id || authorizedClientIds.has(String(row.client_id)))
        && (!filter.vertical || row.vertical === filter.vertical)
        && (!filter.employee || row.assigned_to === filter.employee)
        && (!filter.status || row.status === filter.status));
    } else {
      tasks = [];
      notes.push("Independent tasks are unavailable under the current account permissions.");
    }

    const isAdmin = isFinanceAdmin(access.role);
    const salesAll = isAdmin ? await read("sales_transactions") : [];
    if (!isAdmin) notes.push("Financial worksheets are empty for employees; Revenue is an administrator-only module.");
    const sales = salesAll.filter((row) => (!filter.vertical || row.vertical === filter.vertical)
      && (!filter.employee || row.assigned_to === filter.employee)
      && (!filter.status || row.status === filter.status));
    const saleIds = new Set(sales.map((row) => String(row.id)));
    const invoices = (isAdmin ? await read("business_invoices") : []).filter((row) => !filter.employee && !filter.vertical
      || Boolean(row.transaction_id && saleIds.has(String(row.transaction_id))));
    const collections = (isAdmin ? await read("business_collections") : []).filter((row) => !filter.employee && !filter.vertical
      || Boolean(row.invoice_id && invoices.some((invoice) => invoice.id === row.invoice_id)));
    let payouts = isAdmin ? await read("company_payouts") : [];
    let expenses = isAdmin ? await read("business_expenses") : [];
    if (filter.vertical) {
      payouts = payouts.filter((row) => row.vertical === filter.vertical);
      expenses = expenses.filter((row) => row.vertical === filter.vertical);
    }
    if (filter.employee) {
      payouts = [];
      expenses = [];
      notes.push("Payouts and expenses have no employee assignment field; those sheets are empty for employee-filtered exports.");
    }
    if (filter.status) {
      payouts = [];
      expenses = [];
      notes.push("Payouts and expenses have no status field; those sheets are empty for status-filtered exports.");
    }

    const collectedByInvoice = new Map<string, number>();
    for (const row of collections) {
      const id = String(row.invoice_id ?? "");
      collectedByInvoice.set(id, (collectedByInvoice.get(id) ?? 0) + Number(row.amount ?? 0));
    }
    let invoiceRows: Row[] = invoices.map((invoice) => {
      const total = Number(invoice.total_amount ?? 0);
      const collected_amount = collectedByInvoice.get(String(invoice.id)) ?? 0;
      return { ...invoice, collected_amount, outstanding_amount: Math.max(0, total - collected_amount), calculated_status: total > 0 && collected_amount >= total ? "Paid" : collected_amount > 0 ? "Partially paid" : String(invoice.status ?? "Unpaid") } as Row;
    });
    if (filter.status) {
      invoiceRows = invoiceRows.filter((row) => row.calculated_status === filter.status || row.status === filter.status);
      const matching = new Set(invoiceRows.map((row) => String(row.id)));
      for (let index = collections.length - 1; index >= 0; index -= 1) if (!matching.has(String(collections[index].invoice_id))) collections.splice(index, 1);
      if (filter.status !== "Paid" && filter.status !== "Partially paid" && filter.status !== "Unpaid") collections.length = 0;
    }

    const authorizedIds = new Set([
      ...allLeads.filter((row) => (!filter.vertical || row.vertical === filter.vertical)
        && (!filter.employee || row.owner_id === filter.employee)
        && (!filter.status || row.status === filter.status)).map((row) => String(row.id)),
      ...clientRows.map((row) => String(row.id ?? "")),
      ...tasks.map((row) => String(row.id ?? "")),
      ...followups.map((row) => String(row.id ?? "")),
    ]);
    let activity: Row[] = [];
    if (!isAdmin) {
      const { data, error } = await supabase.rpc("get_my_crm_activity");
      if (error) notes.push("Employee activity metadata is unavailable under the current account permissions.");
      else activity = ((data ?? []) as Row[]).filter((row) => authorizedIds.has(String(row.entity_id))
        && (!filter.from || String(row.occurred_at ?? "").slice(0, 10) >= filter.from)
        && (!filter.to || String(row.occurred_at ?? "").slice(0, 10) <= filter.to));
    } else {
      try {
        activity = (await read("audit_log", "id,actor_id,action,entity,entity_id,created_at"))
          .filter((row) => authorizedIds.has(String(row.entity_id))
            && ["leads", "clients", "crm_tasks", "crm_followups"].includes(String(row.entity))
            && (!filter.from || String(row.created_at ?? "").slice(0, 10) >= filter.from)
            && (!filter.to || String(row.created_at ?? "").slice(0, 10) <= filter.to));
      } catch {
        notes.push("Activity report is not readable for this account.");
      }
    }

    const mis = [
      { metric: "Leads", records: leads.length, amount: "" },
      { metric: clients ? "Clients" : "Clients (derived)", records: clientRows.length, amount: "" },
      { metric: "Sales", records: sales.length, amount: sales.reduce((sum, row) => sum + Number(row.sale_value ?? 0), 0) },
      { metric: "Invoices", records: invoiceRows.length, amount: invoiceRows.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0) },
      { metric: "Collections", records: collections.length, amount: collections.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) },
      { metric: "Payouts", records: payouts.length, amount: payouts.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) },
      { metric: "Expenses", records: expenses.length, amount: expenses.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) },
      { metric: "Follow-ups", records: followups.length, amount: "" },
      { metric: "Tasks", records: tasks.length, amount: "" },
    ];
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "WeLanterns Capital Advisory Pvt. Ltd.";
    workbook.created = new Date();
    const addSheet = (name: string, rows: Row[]) => {
      const sheet = workbook.addWorksheet(name);
      const source = rows.length ? rows : [{ message: "No authorized records match these filters." }];
      const columns = Array.from(new Set(source.flatMap((row) => Object.keys(row))));
      sheet.columns = columns.map((key) => ({ header: key.replaceAll("_", " "), key, width: Math.min(36, Math.max(14, key.length + 3)) }));
      for (const row of source) {
        const safe = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value && typeof value === "object" && !(value instanceof Date) ? JSON.stringify(value) : value]));
        sheet.addRow(safe);
      }
      if (columns.length > 0) {
        sheet.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: source.length + 1, column: columns.length },
        };
      }
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14234F" } };
    };
    addSheet("Leads", leads);
    addSheet("Clients", clientRows);
    addSheet("Sales", sales);
    addSheet("Invoices", invoiceRows);
    addSheet("Collections", collections);
    addSheet("Payouts", payouts);
    addSheet("Expenses", expenses);
    addSheet("Follow-ups", followups);
    addSheet("Tasks", tasks);
    addSheet("Activity", activity);
    addSheet("Consolidated MIS", mis as unknown as Row[]);
    addSheet("Export Notes", [
      { item: "Generated at (UTC)", value: new Date().toISOString() },
      { item: "Role", value: access.role },
      { item: "Date from", value: filter.from || "All dates" },
      { item: "Date to", value: filter.to || "All dates" },
      { item: "Vertical", value: filter.vertical || "All verticals" },
      { item: "Employee", value: filter.employee || "All permitted employees" },
      { item: "Status", value: filter.status || "All statuses" },
      ...notes.map((value) => ({ item: "Limitation", value })),
    ]);
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="welanterns-crm-export-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return jsonNoStore({ error: "The export could not be prepared. Check the available schema and authorized records, then try again." }, 500);
  }
}
