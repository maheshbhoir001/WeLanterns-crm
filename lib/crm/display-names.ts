import type { LeadRole } from "@/lib/crm/leads";

type DisplayProfile = {
  id?: string;
  full_name?: string | null;
  email?: string | null;
  role?: LeadRole | null;
};

const canonicalNames: Record<string, string> = {
  mahesh: "Mahesh Bhoir",
  "mahesh bhoir": "Mahesh Bhoir",
  preeti: "Preeti Bhoir",
  "preeti bhoir": "Preeti Bhoir",
};

function canonicalCrmName(value: string) {
  const clean = value.trim();
  if (!clean) return "";
  const localPart = clean.includes("@") ? clean.split("@", 1)[0].replace(/[._-]+/g, " ") : clean;
  const key = localPart.toLocaleLowerCase().replace(/\s*\(you\)\s*$/i, "").replace(/\s+/g, " ").trim();
  return canonicalNames[key] || clean;
}

export function formatCrmPersonName(value: string | null | undefined) {
  return value ? canonicalCrmName(value) : "";
}

export function getRoleDisplayName(role: LeadRole | null | undefined) {
  if (role === "super_admin") return "Mahesh Bhoir";
  if (role === "group_admin") return "Preeti Bhoir";
  if (role === "employee") return "Team Member";
  return "";
}

export function getProfileDisplayName(profile: DisplayProfile, currentUserId?: string) {
  const storedName = profile.full_name?.trim() || "";
  const isPlaceholder = /^(my account|account)$/i.test(storedName);
  const isEmailFallback = storedName.includes("@");
  const name = !storedName || isPlaceholder || isEmailFallback
    ? getRoleDisplayName(profile.role) || formatCrmPersonName(profile.email) || "Team Member"
    : canonicalCrmName(storedName);

  if (currentUserId && profile.id === currentUserId && !/\s\(you\)$/i.test(name)) {
    return `${name} (You)`;
  }
  return name;
}
