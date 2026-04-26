import { supabase } from "@/lib/supabase";
import { isAutoReceiptsEnabled, issueReceiptForPayment } from "@/lib/receipts";
import { notifyAction } from "@/lib/notifications";

export interface RecordCheckInput {
  tenant_id: string;
  contract_id: string;
  check_number: string;
  bank_name?: string | null;
  branch_number?: string | null;
  account_number?: string | null;
  amount: number;
  due_date: string; // yyyy-MM-dd
  for_month: string; // MM/yyyy
  source?: "manual" | "whatsapp_agent";
}

export interface RecordCheckResult {
  check_id: string;
  payment_id: string | null;
  receipt_doc_number: number | null;
  receipt_url: string | null;
  receipt_skipped: boolean;
  receipt_error: string | null;
}

/**
 * Record a single scanned/uploaded check as the canonical event:
 *
 * 1. Insert the check (status = pending).
 * 2. Insert a payment row with payment_method = 'check' linked to the
 *    matching payment_schedule row (by tenant + month).
 * 3. Mark schedule paid/partial via record_payment_manual_tx.
 * 4. Back-link the payment to the check (checks.payment_id).
 * 5. If auto-receipts is enabled and the contract's legal entity issues
 *    receipts, create one via Morning.com.
 *
 * Idempotent: if a check with the same check_number + tenant_id already
 * exists, skip and return the existing record.
 */
export async function recordCheckAsPayment(
  input: RecordCheckInput
): Promise<RecordCheckResult> {
  const source = input.source || "manual";

  // ── 0. Idempotency — same check number for same tenant ──
  const { data: existing } = await supabase
    .from("checks")
    .select("id, payment_id")
    .eq("tenant_id", input.tenant_id)
    .eq("check_number", input.check_number)
    .maybeSingle();

  if (existing) {
    return {
      check_id: existing.id,
      payment_id: existing.payment_id,
      receipt_doc_number: null,
      receipt_url: null,
      receipt_skipped: true,
      receipt_error: "already_exists",
    };
  }

  // ── 1. Insert the check ──
  const { data: check, error: checkErr } = await supabase
    .from("checks")
    .insert({
      tenant_id: input.tenant_id,
      contract_id: input.contract_id,
      check_number: input.check_number,
      bank_name: input.bank_name ?? null,
      branch_number: input.branch_number ?? null,
      account_number: input.account_number ?? null,
      amount: input.amount,
      due_date: input.due_date,
      for_month: input.for_month,
      status: "pending",
    })
    .select("id")
    .single();

  if (checkErr) throw checkErr;

  // ── 2. Find matching schedule row ──
  const { data: schedule } = await supabase
    .from("payment_schedule")
    .select("id, expected_amount")
    .eq("tenant_id", input.tenant_id)
    .eq("contract_id", input.contract_id)
    .eq("month_year", input.for_month)
    .maybeSingle();

  // ── 3. Insert the payment via RPC (atomically updates the schedule) ──
  const { data: paymentId, error: payErr } = await supabase.rpc("record_payment_manual_tx", {
    p_tenant_id: input.tenant_id,
    p_contract_id: input.contract_id,
    p_schedule_id: schedule?.id || null,
    p_amount: input.amount,
    p_payment_date: input.due_date,
    p_month_paid_for: input.for_month,
    p_payment_method: "check",
    p_check_number: input.check_number,
    p_check_bank: input.bank_name ?? null,
    p_check_date: input.due_date,
    p_notes: null,
    p_expected_amount: schedule?.expected_amount || input.amount,
    p_created_by: source,
  });

  if (payErr) throw payErr;

  // ── 4. Back-link the payment to the check ──
  await supabase
    .from("checks")
    .update({ payment_id: paymentId })
    .eq("id", check.id);

  // Increment the contract's checks_received counter
  const { data: c } = await supabase
    .from("contracts")
    .select("checks_received")
    .eq("id", input.contract_id)
    .single();
  if (c) {
    await supabase
      .from("contracts")
      .update({ checks_received: (c.checks_received || 0) + 1 })
      .eq("id", input.contract_id);
  }

  // ── 5. Auto-issue receipt (if enabled and entity allows it) ──
  let receipt_doc_number: number | null = null;
  let receipt_url: string | null = null;
  let receipt_skipped = false;
  let receipt_error: string | null = null;

  if (await isAutoReceiptsEnabled()) {
    try {
      const r = await issueReceiptForPayment(paymentId as string);
      if (r.success) {
        receipt_doc_number = r.doc_number ?? null;
        receipt_url = r.doc_url ?? null;
        receipt_skipped = !!r.skipped;
      } else {
        receipt_error = r.error || "receipt_failed";
      }
    } catch (err) {
      receipt_error = err instanceof Error ? err.message : String(err);
    }
  } else {
    receipt_skipped = true;
  }

  // Notification — single per check event
  void notifyAction({
    type: "check_recorded",
    entity_type: "check",
    entity_id: check.id,
    title: `🧾 צ'ק נרשם — צ'ק #${input.check_number} ₪${Number(input.amount).toLocaleString()}`,
    message:
      `צ'ק עבור ${input.for_month} נרשם, התשלום שולב בלוח, ` +
      (receipt_doc_number ? `קבלה #${receipt_doc_number} הופקה.` : "ללא קבלה אוטומטית."),
  }).catch(() => {});

  return {
    check_id: check.id,
    payment_id: paymentId as string,
    receipt_doc_number,
    receipt_url,
    receipt_skipped,
    receipt_error,
  };
}

/**
 * Build "MM/yyyy" from a yyyy-MM-dd date string.
 */
export function dueDateToForMonth(dueDate: string): string {
  const parts = dueDate.split("-");
  return `${parts[1]}/${parts[0]}`;
}
