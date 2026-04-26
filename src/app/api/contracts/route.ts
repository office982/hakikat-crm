import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generatePaymentSchedule } from "@/lib/payment-calculator";

interface CreateContractBody {
  tenant_id?: string;
  // Tenant fields (used to upsert if tenant_id missing)
  tenant_full_name?: string;
  tenant_id_number?: string;
  tenant_phone?: string;
  tenant_whatsapp?: string;
  tenant_email?: string;

  unit_id: string | null;
  legal_entity_id: string;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  annual_increase_percent?: number;
  building_fee?: number;
  arnona?: number;
  payment_method?: "checks" | "transfer" | "cash";
  contract_text?: string;
  ai_instructions?: string;
}

/**
 * Create a contract record from the wizard.
 * Atomically: upserts tenant (if needed), runs create_contract_tx RPC,
 * stores contract_text in action_logs for audit, returns the new id.
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateContractBody = await request.json();

    if (!body.legal_entity_id || !body.start_date || !body.end_date || !body.monthly_rent) {
      return NextResponse.json({ error: "שדות חובה חסרים" }, { status: 400 });
    }

    // Resolve / create tenant
    let tenantId = body.tenant_id;
    if (!tenantId) {
      if (!body.tenant_full_name || !body.tenant_id_number) {
        return NextResponse.json({ error: "פרטי דייר חסרים" }, { status: 400 });
      }
      // Look up by ID number
      const { data: existing } = await supabase
        .from("tenants")
        .select("id")
        .eq("id_number", body.tenant_id_number)
        .maybeSingle();

      if (existing) {
        tenantId = existing.id;
      } else {
        const { data: created, error: createErr } = await supabase
          .from("tenants")
          .insert({
            full_name: body.tenant_full_name,
            id_number: body.tenant_id_number,
            phone: body.tenant_phone || "0000000000",
            whatsapp: body.tenant_whatsapp || body.tenant_phone || null,
            email: body.tenant_email || null,
          })
          .select()
          .single();
        if (createErr) throw createErr;
        tenantId = created.id;
      }
    }

    // Build payment schedule
    const schedule = generatePaymentSchedule({
      start_date: body.start_date,
      end_date: body.end_date,
      monthly_rent: body.monthly_rent,
      annual_increase_percent: body.annual_increase_percent || 0,
    });

    const scheduleJson = schedule.map((row) => ({
      month_year: row.month_year,
      due_date: row.due_date,
      expected_amount: row.expected_amount,
      year_number: row.year_number,
    }));

    // Create the contract atomically
    const { data: contractId, error: rpcErr } = await supabase.rpc("create_contract_tx", {
      p_tenant_id: tenantId,
      p_unit_id: body.unit_id || null,
      p_legal_entity_id: body.legal_entity_id,
      p_start_date: body.start_date,
      p_end_date: body.end_date,
      p_monthly_rent: body.monthly_rent,
      p_annual_increase: body.annual_increase_percent || 0,
      p_building_fee: body.building_fee || 0,
      p_arnona: body.arnona || 0,
      p_schedule: scheduleJson,
    });

    if (rpcErr) throw rpcErr;

    // Persist generated contract text alongside the contract for later
    // PDF generation, by writing it to action_logs (large fields don't
    // fit on contracts itself without a schema change).
    if (body.contract_text) {
      await supabase.from("action_logs").insert({
        entity_type: "contract",
        entity_id: contractId,
        action: "contract_text_saved",
        description: body.contract_text.slice(0, 8000),
        ai_summary: body.ai_instructions || null,
        source: "manual",
        performed_by: "wizard",
      });
    }

    return NextResponse.json({ contract_id: contractId, tenant_id: tenantId });
  } catch (err) {
    console.error("Create contract failed:", err);
    return NextResponse.json(
      { error: "יצירת חוזה נכשלה", details: String(err) },
      { status: 500 }
    );
  }
}
