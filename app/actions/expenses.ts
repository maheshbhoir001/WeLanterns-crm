"use server";

import { getAppAccess } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isFinanceAdmin } from "@/lib/crm/permissions";

export type ExpenseChanges = {
  vertical: string;
  category: string;
  description: string | null;
  amount: number;
  expense_date: string;
  payment_mode: string | null;
  editReason: string;
};

export type ExpenseAuditEntry = {
  id: string | number;
  expense_id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: "baseline" | "created" | "edited" | "voided";
  reason: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
};

async function requireFinanceAdmin() {
  const access = await getAppAccess();
  if (!access || !isFinanceAdmin(access.role)) {
    throw new Error("Only a Super Admin or Group Admin can manage expenses.");
  }
  return access;
}

function validateExpense(changes: ExpenseChanges) {
  if (!changes.category.trim() || changes.category.trim().length > 120) {
    throw new Error("Enter an expense category of 1–120 characters.");
  }
  if (!Number.isFinite(changes.amount) || changes.amount < 0 || Math.round(changes.amount * 100) !== changes.amount * 100) {
    throw new Error("Enter a non-negative amount with no more than two decimal places.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(changes.expense_date)) {
    throw new Error("Enter a valid expense date.");
  }
  const expenseDate = new Date(`${changes.expense_date}T00:00:00.000Z`);
  if (Number.isNaN(expenseDate.getTime()) || expenseDate.toISOString().slice(0, 10) !== changes.expense_date) {
    throw new Error("Enter a valid expense date.");
  }
  if (changes.description && changes.description.length > 500) {
    throw new Error("Description must be 500 characters or fewer.");
  }
}

export async function updateExpenseAction(id: string, changes: ExpenseChanges) {
  try {
    await requireFinanceAdmin();
    validateExpense(changes);
    const editReason = changes.editReason.trim();
    if (!editReason || editReason.length > 1000) {
      throw new Error("A reason of 1–1000 characters is required for an expense edit.");
    }
    const supabase = await createClient();
    const { data: vertical, error: verticalError } = await supabase.from("business_verticals").select("name").eq("name", changes.vertical).eq("is_active", true).maybeSingle();
    if (verticalError || !vertical) throw new Error("Choose an active business vertical.");
    const expenseFields = {
      vertical: changes.vertical,
      category: changes.category,
      description: changes.description,
      amount: changes.amount,
      expense_date: changes.expense_date,
      payment_mode: changes.payment_mode,
    };
    const { data, error } = await supabase
      .from("business_expenses")
      .update({
        ...expenseFields,
        edit_reason: editReason,
        category: changes.category.trim(),
        description: changes.description?.trim() || null,
      })
      .eq("id", id)
      .is("voided_at", null)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false as const, error: error.message };
    if (!data) return { ok: false as const, error: "Expense was not found or has already been voided." };
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not update expense." };
  }
}

export async function voidExpenseAction(id: string, reason: string) {
  try {
    const access = await requireFinanceAdmin();
    const cleanReason = reason.trim();
    if (!cleanReason || cleanReason.length > 1000) {
      throw new Error("A void reason of 1–1000 characters is required.");
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("business_expenses")
      .update({ voided_at: new Date().toISOString(), voided_by: access.userId, void_reason: cleanReason })
      .eq("id", id)
      .is("voided_at", null)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false as const, error: error.message };
    if (!data) return { ok: false as const, error: "Expense was not found or has already been voided." };
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not void expense." };
  }
}

export async function getExpenseAuditAction(id: string) {
  try {
    await requireFinanceAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("business_expense_audit")
      .select("id,expense_id,actor_id,actor_name,action,reason,old_values,new_values,created_at")
      .eq("expense_id", id)
      .order("created_at", { ascending: false });
    if (error) return { ok: false as const, error: error.message, entries: [] as ExpenseAuditEntry[] };
    return { ok: true as const, entries: (data ?? []) as ExpenseAuditEntry[] };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not load expense audit history.", entries: [] as ExpenseAuditEntry[] };
  }
}
