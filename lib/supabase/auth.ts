import "server-only";

import { cache } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "super_admin" | "group_admin" | "employee";

export type AppAccess = {
  userId: string;
  email: string | null;
  role: AppRole | null;
};

function isAppRole(role: string): role is AppRole {
  return role === "super_admin" || role === "group_admin" || role === "employee";
}

// React cache deduplicates this lookup across nested dashboard layouts in one request.
export const getAppAccess = cache(async (): Promise<AppAccess | null> => {
  // Supabase Auth checks session expiry with Date.now(); this read must happen
  // after Next's prerender boundary, including when a child page calls it in
  // parallel with the shared dashboard layout.
  await connection();
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) {
    // Fail closed. Do not continue with an unverified or unavailable role.
    throw new Error("Unable to verify the account role.");
  }

  return {
    userId: userData.user.id,
    email: userData.user.email ?? null,
    role: profile && isAppRole(profile.role) ? profile.role : null,
  };
});
