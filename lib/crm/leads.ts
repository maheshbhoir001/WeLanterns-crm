export function getActiveLeadVerticals(catalog: readonly { name: string; is_active: boolean }[]) {
  return [...new Set(catalog.filter((vertical) => vertical.is_active).map((vertical) => vertical.name))];
}

export function getLeadVerticalOptionLabel(vertical: string, enabled: boolean) {
  if (enabled) return vertical;
  return `${vertical} (inactive or unavailable)`;
}

export const LEAD_STATUSES = ["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"] as const;
export const LEAD_PRIORITIES = ["Hot", "Warm", "Cold"] as const;
export const TERMINAL_LEAD_STATUSES = new Set<string>(["Won", "Lost"]);

export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadRole = "super_admin" | "group_admin" | "employee";

export type Lead = {
  id: string;
  name: string;
  phone: string;
  client_id?: string | null;
  email: string | null;
  vertical: string;
  product: string | null;
  source: string | null;
  status: LeadStatus;
  priority: string | null;
  followup: string | null;
  value: number | string | null;
  notes: string | null;
  owner_id: string | null;
  owner: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type LeadProfile = {
  id: string;
  full_name: string;
  email: string | null;
  role: LeadRole;
};

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export function getFollowupState(lead: Lead, today: string) {
  if (TERMINAL_LEAD_STATUSES.has(lead.status)) return "Completed";
  if (!lead.followup) return "Unscheduled";
  if (!today) return "Scheduled";
  if (lead.followup < today) return "Overdue";
  if (lead.followup === today) return "Due today";
  return "Upcoming";
}

export function getPhoneLinks(phone: string) {
  const telephone = phone.replace(/[^\d+]/g, "");
  let whatsapp = phone.replace(/\D/g, "");
  if (whatsapp.length === 10) whatsapp = `91${whatsapp}`;
  else if (whatsapp.length === 11 && whatsapp.startsWith("0")) whatsapp = `91${whatsapp.slice(1)}`;

  return {
    telephone: telephone ? `tel:${telephone}` : null,
    whatsapp: whatsapp.length >= 11 ? `https://wa.me/${whatsapp}` : null,
  };
}

export function formatLeadDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
