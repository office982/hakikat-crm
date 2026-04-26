import { NextRequest, NextResponse } from "next/server";
import type { EasydoWebhookEvent } from "@/lib/api/easydo";
import { verifyEasydoWebhook } from "@/lib/api/easydo";
import { supabase } from "@/lib/supabase";
import { saveContractToDrive } from "@/lib/api/google-drive";
import { sendNotification } from "@/lib/notifications";

/**
 * EasyDo Webhook — triggered when a document is signed.
 *
 * On "signed" status:
 *   1. Look up the contract by easydo_document_id
 *   2. Download the signed PDF from event.signed_pdf_url
 *   3. Upload the PDF to Google Drive in the tenant's folder
 *   4. Call the complete_contract_signing RPC (activates contract,
 *      marks unit occupied, stores drive URL, logs the action)
 *   5. Send a Hebrew welcome WhatsApp to the tenant
 *
 * On "declined": mark contract cancelled and log the event.
 * On other statuses (sent / viewed): just log, return 200.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-easydo-signature") || "";
    const secret = process.env.EASYDO_WEBHOOK_SECRET || "";

    if (secret && !verifyEasydoWebhook(rawBody, signature, secret)) {
      console.warn("EasyDo webhook signature verification failed");
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }

    const event: EasydoWebhookEvent = JSON.parse(rawBody);

    console.log("EasyDo webhook received:", event.status, event.document_id);

    if (event.status === "declined") {
      await handleDeclined(event);
      return NextResponse.json({ received: true, action: "declined" });
    }

    if (event.status !== "signed") {
      // sent / viewed / reminder — log + best-effort tenant ping
      await handleStatusUpdate(event);
      return NextResponse.json({ received: true });
    }

    await handleSigned(event);
    return NextResponse.json({ received: true, action: "signed" });
  } catch (error) {
    console.error("EasyDo webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handleSigned(event: EasydoWebhookEvent) {
  // 1. Find the contract + tenant
  const { data: contract, error } = await supabase
    .from("contracts")
    .select(`
      id, status, tenant_id,
      tenant:tenants(id, full_name, phone, whatsapp)
    `)
    .eq("easydo_document_id", event.document_id)
    .maybeSingle();

  if (error || !contract) {
    console.warn(`[easydo] No contract for document ${event.document_id}`);
    return;
  }

  if (contract.status === "active") {
    console.log(`[easydo] Contract ${contract.id} already active — skipping`);
    return;
  }

  const tenant = contract.tenant as unknown as {
    id: string;
    full_name: string;
    phone: string;
    whatsapp: string | null;
  } | null;

  // 2. Download + 3. Upload to Drive (best-effort — continues on failure)
  let driveUrl: string | null = null;
  if (event.signed_pdf_url && tenant?.full_name) {
    try {
      const pdfRes = await fetch(event.signed_pdf_url);
      if (!pdfRes.ok) throw new Error(`pdf download ${pdfRes.status}`);
      const buf = Buffer.from(await pdfRes.arrayBuffer());
      const fileName = `חוזה_${tenant.full_name}_${new Date().toISOString().split("T")[0]}.pdf`;
      driveUrl = await saveContractToDrive(tenant.full_name, buf, fileName);
    } catch (driveErr) {
      console.error("[easydo] Drive upload failed:", driveErr);
    }
  }

  // 4. Atomic RPC: activate contract + occupy unit + log
  const { error: rpcErr } = await supabase.rpc("complete_contract_signing", {
    p_easydo_document_id: event.document_id,
    p_drive_url: driveUrl,
  });

  if (rpcErr) {
    console.error("[easydo] complete_contract_signing failed:", rpcErr);
    return;
  }

  // 5. WhatsApp welcome — tracked notification with fallback channels.
  if (tenant?.phone) {
    const phoneForWati = (tenant.whatsapp || tenant.phone).replace(/^0/, "972");
    const welcomeMsg =
      `ברוך הבא ${tenant.full_name}! 🏠\n` +
      `החוזה נחתם בהצלחה ונכנס לתוקף.\n` +
      (driveUrl ? `העתק החוזה: ${driveUrl}\n` : "") +
      `בכל שאלה — אנחנו כאן. תודה, קבוצת חקיקת.`;
    await sendNotification({
      type: "contract_signed",
      entity_type: "contract",
      entity_id: contract.id,
      title: `✅ חוזה נחתם — ${tenant.full_name}`,
      message: welcomeMsg,
      recipient: phoneForWati,
      channel: "whatsapp",
    });
  }
}

/**
 * Non-terminal status update (sent / viewed / reminder).
 * Log + ping the tenant on WhatsApp (best-effort) so they know
 * what's happening with their contract.
 */
async function handleStatusUpdate(event: EasydoWebhookEvent) {
  const { data: contract } = await supabase
    .from("contracts")
    .select(`id, tenant:tenants(id, full_name, phone, whatsapp)`)
    .eq("easydo_document_id", event.document_id)
    .maybeSingle();

  const contractId = contract?.id || event.document_id;

  await supabase.from("action_logs").insert({
    entity_type: "contract",
    entity_id: contractId,
    action: `easydo_${event.status}`,
    description: `EasyDo status: ${event.status}`,
    source: "easydo",
    performed_by: "easydo",
  });

  if (!contract?.id) return;

  const tenant = contract.tenant as unknown as {
    id: string;
    full_name: string;
    phone: string;
    whatsapp: string | null;
  } | null;
  if (!tenant?.phone) return;

  // Hebrew message per status. Skip noisy "viewed" pings.
  let msg: string | null = null;
  let title: string | null = null;
  if (event.status === "sent") {
    title = `📨 חוזה נשלח — ${tenant.full_name}`;
    msg =
      `שלום ${tenant.full_name}, החוזה נשלח אליך לחתימה דיגיטלית. ` +
      `אנא בדוק את האימייל / SMS שקיבלת מ-EasyDo. ` +
      `בכל שאלה — אנחנו כאן.`;
  }

  if (msg && title) {
    const phoneForWati = (tenant.whatsapp || tenant.phone).replace(/^0/, "972");
    await sendNotification({
      type: `contract_${event.status}`,
      entity_type: "contract",
      entity_id: contract.id,
      title,
      message: msg,
      recipient: phoneForWati,
      channel: "whatsapp",
    });
  }
}

async function handleDeclined(event: EasydoWebhookEvent) {
  const { data: contract } = await supabase
    .from("contracts")
    .select(`id, tenant:tenants(id, full_name, phone, whatsapp)`)
    .eq("easydo_document_id", event.document_id)
    .maybeSingle();
  if (!contract) return;

  await supabase
    .from("contracts")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", contract.id);

  await supabase.from("action_logs").insert({
    entity_type: "contract",
    entity_id: contract.id,
    action: "contract_declined",
    description: `${event.signer_name || "החותם"} דחה את החוזה דרך EasyDo.`,
    source: "easydo",
    performed_by: "easydo",
  });

  // Admin alert (dashboard)
  await supabase.from("notifications").insert({
    type: "contract_declined",
    entity_type: "contract",
    entity_id: contract.id,
    title: `🔴 החוזה נדחה — ${event.signer_name || "דייר"}`,
    message: `החותם דחה את החוזה ב-EasyDo. יש לחזור לדייר או לפתוח חוזה חדש.`,
  });

  // Tenant ping — confirm the rejection so they know we received it.
  const tenant = contract.tenant as unknown as {
    id: string;
    full_name: string;
    phone: string;
    whatsapp: string | null;
  } | null;
  if (tenant?.phone) {
    const phoneForWati = (tenant.whatsapp || tenant.phone).replace(/^0/, "972");
    await sendNotification({
      type: "contract_declined_tenant",
      entity_type: "contract",
      entity_id: contract.id,
      title: `חוזה בוטל — ${tenant.full_name}`,
      message:
        `שלום ${tenant.full_name}, ראינו שהחוזה נדחה. ` +
        `נחזור אליך בהקדם להבהרות. תודה — קבוצת חקיקת.`,
      recipient: phoneForWati,
      channel: "whatsapp",
    });
  }
}
