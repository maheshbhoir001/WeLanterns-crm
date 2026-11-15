export type CrmRole = "super_admin" | "group_admin" | "employee";

export function isFinanceAdmin(role: CrmRole | null | undefined): boolean {
  return role === "super_admin" || role === "group_admin";
}

/** Defense-in-depth only; Supabase RLS remains the authoritative boundary. */
export function canAccessAssignedRecord(
  role: CrmRole | null | undefined,
  userId: string | null | undefined,
  assignedUserId: string | null | undefined,
): boolean {
  return isFinanceAdmin(role) || Boolean(userId && assignedUserId && userId === assignedUserId);
}
