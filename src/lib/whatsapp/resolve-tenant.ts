import { supabase } from "@/lib/supabase";

/**
 * Resolve a tenant from WhatsApp message data.
 * Tries: exact name match → phone match → ID number match → fuzzy name.
 */
export async function resolveTenant(data: Record<string, unknown>): Promise<{
  id: string;
  full_name: string;
  phone: string;
  contract_id?: string;
  unit_id?: string;
} | null> {
  const name = normalizeHebrew(String(data.tenant_name || ""));
  const phone = normalizePhone(String(data.phone || ""));
  const idNumber = String(data.id_number || "");

  // 1. Exact ID number
  if (idNumber) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, full_name, phone, unit_id")
      .eq("id_number", idNumber)
      .eq("is_active", true)
      .single();
    if (tenant) return await attachContract(tenant);
  }

  // 2. Phone match
  if (phone) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, full_name, phone, unit_id")
      .or(`phone.eq.${phone},whatsapp.eq.${phone}`)
      .eq("is_active", true)
      .single();
    if (tenant) return await attachContract(tenant);
  }

  // 3. Exact name match
  if (name) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, full_name, phone, unit_id")
      .eq("full_name", name)
      .eq("is_active", true)
      .single();
    if (tenant) return await attachContract(tenant);
  }

  // 4. Fuzzy name (ilike)
  if (name) {
    const { data: tenants } = await supabase
      .from("tenants")
      .select("id, full_name, phone, unit_id")
      .ilike("full_name", `%${name}%`)
      .eq("is_active", true)
      .limit(1);
    if (tenants && tenants.length === 1) return await attachContract(tenants[0]);
  }

  return null;
}

/**
 * Resolve a project by name (fuzzy).
 */
export async function resolveProject(data: Record<string, unknown>): Promise<{
  id: string;
  name: string;
} | null> {
  const name = String(data.project_name || "");
  if (!name) return null;

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .ilike("name", `%${name}%`)
    .eq("status", "active")
    .limit(1);

  return projects?.[0] || null;
}

/**
 * Find the active contract for a tenant.
 */
async function attachContract(tenant: {
  id: string;
  full_name: string;
  phone: string;
  unit_id: string | null;
}): Promise<{
  id: string;
  full_name: string;
  phone: string;
  contract_id?: string;
  unit_id?: string;
}> {
  const { data: contract } = await supabase
    .from("contracts")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .single();

  return {
    id: tenant.id,
    full_name: tenant.full_name,
    phone: tenant.phone,
    contract_id: contract?.id,
    unit_id: tenant.unit_id || undefined,
  };
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "").replace(/^972/, "0");
}

function normalizeHebrew(name: string): string {
  return name.replace(/['"״׳]/g, "").trim();
}
