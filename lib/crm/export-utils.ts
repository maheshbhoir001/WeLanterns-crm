type ExportRow = Record<string, unknown>;

export function normalizedPhone(phone: unknown) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(-10);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(-10);
  return digits || null;
}

export function groupClients(leads: ExportRow[]) {
  const groups = new Map<string, ExportRow>();
  for (const lead of leads) {
    const key = `${normalizedPhone(lead.phone) ?? `lead:${lead.id}`}|${String(lead.owner_id ?? "none")}`;
    const existing = groups.get(key);
    if (existing) existing.opportunity_count = Number(existing.opportunity_count) + 1;
    else groups.set(key, { name: lead.name, phone: lead.phone, email: lead.email, owner_id: lead.owner_id, opportunity_count: 1 });
  }
  return Array.from(groups.values());
}

export function validDate(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
