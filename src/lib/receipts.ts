import { supabaseAdmin as supabase } from "@/lib/supabase";
import { createMorningDocument } from "@/lib/api/morning";
import { saveReceiptToDrive, isDriveBackupEnabled } from "@/lib/api/google-drive";

const SKIPPED_ENTITIES = ["חקיקת פרטי", "חקיקת עסקי/פרטי"];

export interface IssueReceiptResult {
  success: boolean;
  skipped?: boolean;
  doc_id?: string;
  doc_number?: number;
  doc_url?: string;
  error?: string;
}

/**
 * Issue a receipt for a recorded payment. Idempotent — if the payment
 * already has a receipt number, returns success immediately.
 *
 * - Updates the payment row with the receipt id, number, and url.
 * - Inserts an invoice row for audit / reporting.
 * - Skips (with success=true, skipped=true) if the contract's legal entity
 *   is one of the private entities that does not issue documents.
 */
export async function issueReceiptForPayment(paymentId: string): Promise<IssueReceiptResult> {
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .select(`
      id, tenant_id, contract_id, amount, month_paid_for,
      icount_receipt_id, receipt_doc_number,
      tenant:tenants(full_name, id_number, email),
      contract:contracts(legal_entity_id, legal_entity:legal_entities(id, name))
    `)
    .eq("id", paymentId)
    .single();

  if (payErr || !payment) return { success: false, error: "payment_not_found" };

  // Idempotency — already issued
  if (payment.icount_receipt_id || payment.receipt_doc_number) {
    return {
      success: true,
      doc_id: payment.icount_receipt_id || undefined,
      doc_number: payment.receipt_doc_number || undefined,
    };
  }

  const tenant = payment.tenant as unknown as {
    full_name: string;
    id_number: string | null;
    email: string | null;
  } | null;
  const contract = payment.contract as unknown as {
    legal_entity_id: string;
    legal_entity: { id: string; name: string } | null;
  } | null;

  if (!tenant) return { success: false, error: "tenant_missing" };

  const entityName = contract?.legal_entity?.name || "";
  if (SKIPPED_ENTITIES.some((e) => entityName.includes(e))) {
    await supabase
      .from("payments")
      .update({
        receipt_issue_attempted_at: new Date().toISOString(),
        receipt_issue_error: "skipped_private_entity",
      })
      .eq("id", payment.id);
    return { success: true, skipped: true };
  }

  try {
    const doc = await createMorningDocument({
      client_name: tenant.full_name,
      client_id: tenant.id_number || undefined,
      client_email: tenant.email || undefined,
      amount: Number(payment.amount),
      description: `שכר דירה — ${payment.month_paid_for}`,
      type: "receipt",
    });

    await supabase
      .from("payments")
      .update({
        icount_receipt_id: doc.id,
        receipt_doc_number: doc.number,
        receipt_url: doc.url,
        receipt_issue_attempted_at: new Date().toISOString(),
        receipt_issue_error: null,
      })
      .eq("id", payment.id);

    if (contract?.legal_entity_id) {
      await supabase.from("invoices").insert({
        tenant_id: payment.tenant_id,
        payment_id: payment.id,
        legal_entity_id: contract.legal_entity_id,
        icount_id: doc.id,
        invoice_type: "receipt",
        amount: Number(payment.amount),
        issue_date: new Date().toISOString().split("T")[0],
        pdf_url: doc.url,
        status: "issued",
      });
    }

    await supabase.from("action_logs").insert({
      entity_type: "payment",
      entity_id: payment.id,
      action: "receipt_issued",
      description: `קבלה #${doc.number} — ₪${Number(payment.amount).toLocaleString()}`,
      source: "system",
      performed_by: "system",
    });

    // Best-effort Drive backup of the receipt PDF
    if (doc.url && tenant.full_name && (await isDriveBackupEnabled("drive_backup_receipts_enabled"))) {
      try {
        await saveReceiptToDrive({
          tenantName: tenant.full_name,
          pdfUrl: doc.url,
          fileName: `receipt_${doc.number}_${payment.month_paid_for.replace("/", "-")}.pdf`,
        });
      } catch (err) {
        console.error("[receipts] drive backup failed:", err);
      }
    }

    return { success: true, doc_id: doc.id, doc_number: doc.number, doc_url: doc.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from("payments")
      .update({
        receipt_issue_attempted_at: new Date().toISOString(),
        receipt_issue_error: msg.slice(0, 500),
      })
      .eq("id", payment.id);
    return { success: false, error: msg };
  }
}

/**
 * Is the auto-issue-receipts feature flag enabled?
 */
export async function isAutoReceiptsEnabled(): Promise<boolean> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "auto_issue_receipts")
    .single();
  return data?.value !== "false";
}
