"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getActiveLeadVerticals } from "@/lib/crm/leads";
import { createClient } from "@/lib/supabase/client";

export type CrmVerticalCatalog = {
  verticals: string[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

type CrmRole = "super_admin" | "group_admin" | "employee";

/** Load active catalog entries, intersecting employee access with explicit assignments. */
export function useCrmVerticalCatalog(userId?: string, role?: CrmRole): CrmVerticalCatalog {
  const supabase = useMemo(() => createClient(), []);
  const [verticals, setVerticals] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: catalog, error: catalogError } = await supabase
        .from("business_verticals")
        .select("name,is_active")
        .eq("is_active", true)
        .order("name");
      if (catalogError) throw catalogError;

      let active = getActiveLeadVerticals(catalog ?? []);
      if (role === "employee") {
        if (!userId) throw new Error("The signed-in employee account could not be verified.");
        const { data: assignments, error: assignmentError } = await supabase
          .from("profile_verticals")
          .select("vertical_name")
          .eq("profile_id", userId);
        if (assignmentError) throw assignmentError;
        const permitted = new Set((assignments ?? []).map((assignment) => assignment.vertical_name));
        active = active.filter((vertical) => permitted.has(vertical));
      }
      setVerticals(active);
    } catch (caught) {
      setVerticals([]);
      setError(caught instanceof Error
        ? `Could not load business vertical access: ${caught.message}`
        : "Could not load business vertical access.");
    } finally {
      setLoading(false);
    }
  }, [role, supabase, userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void reload(); }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  return { verticals, loading, error, reload };
}

export function useCrmVerticals(userId?: string, role?: CrmRole) {
  return useCrmVerticalCatalog(userId, role).verticals;
}
