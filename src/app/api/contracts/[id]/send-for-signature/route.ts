import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import { isEasydoConfigured, sendForSignature } from "@/lib/api/easydo";
import { renderContractHtml } from "@/lib/contract-render";
import { htmlToPdf } from "@/lib/pdf";
import { sendEmail } from "@/lib/api/email";

// EasyDo wants the PDF inline as base64 (3-step API). Puppeteer needs Node.
export const runtime = "nodejs";
export const maxDuration = 60;

interface SendBody {
  contract_text: string;
  // Accepted for backwards-compat with the wizard payload; ignored.
  // EasyDo no longer takes a file URL — we send the PDF bytes directly.
  destination?: "google_drive" | "onedrive";
  uploaded_url?: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: contractId } = await context.params;
  try {
    const body: SendBody = await request.json();

    if (!body.contract_text) {
      return NextResponse.json({ error: "טקסט חוזה חסר" }, { status: 400 });
    }

    const { data: contract, error: cErr } = await supabase
      .from("contracts")
      .select(`
        id, easydo_document_id, status,
        tenant:tenants(id, full_name, id_number, phone, whatsapp, email)
      `)
      .eq("id", contractId)
      .maybeSingle();

    if (cErr || !contract) {
      return NextResponse.json({ error: "חוזה לא נמצא" }, { status: 404 });
    }

    if (contract.status === "active") {
      return NextResponse.json({ error: "החוזה כבר חתום" }, { status: 409 });
    }

    const tenant = contract.tenant as unknown as {
      id: string;
      full_name: string;
      id_number: string;
      phone: string;
      whatsapp: string | null;
      email: string | null;
    } | null;

    if (!tenant) return NextResponse.json({ error: "דייר לא נמצא" }, { status: 404 });

    // EasyDo not configured → skip the signature flow. The wizard's OneDrive
    // step (if used) has already archived an HTML copy client-side; the
    // contract record stays as-is and the operator handles signing manually.
    if (!isEasydoConfigured()) {
      await supabase.from("action_logs").insert({
        entity_type: "contract",
        entity_id: contractId,
        action: "archived_no_signature",
        description: `חוזה נשמר ל${tenant.full_name} (חתימה דיגיטלית לא פעילה — EasyDo לא מוגדר)`,
        source: "manual",
        performed_by: "user",
      });
      return NextResponse.json({ signature_sent: false, archived: true });
    }

    // EasyDo notifies temporary recipients by email only. SMS requires a
    // pre-registered profile, which we don't manage yet.
    if (!tenant.email) {
      return NextResponse.json(
        { error: "לדייר אין כתובת אימייל — נדרשת לשליחת חוזה דיגיטלי" },
        { status: 400 }
      );
    }

    const html = renderContractHtml({
      title: `חוזה שכירות — ${tenant.full_name}`,
      body: body.contract_text,
      signerName: tenant.full_name,
      signerId: tenant.id_number,
    });
    const pdf = await htmlToPdf(html);

    const easydo = await sendForSignature({
      document_name: `חוזה שכירות — ${tenant.full_name}`,
      signers: [{ name: tenant.full_name, email: tenant.email }],
      pdf,
      file_name: `contract_${tenant.id_number}.pdf`,
    });

    await supabase
      .from("contracts")
      .update({
        easydo_document_id: easydo.document_id,
        easydo_fill_url: easydo.fill_url ?? null,
        status: "pending_signature",
        updated_at: new Date().toISOString(),
      })
      .eq("id", contractId);

    await supabase.from("action_logs").insert({
      entity_type: "contract",
      entity_id: contractId,
      action: "sent_for_signature",
      description: `חוזה נשלח ל${tenant.full_name} לחתימה דיגיטלית דרך EasyDo`,
      source: "manual",
      performed_by: "user",
    });

    await supabase.from("notifications").insert({
      type: "contract_sent",
      entity_type: "contract",
      entity_id: contractId,
      title: `📤 חוזה נשלח לחתימה — ${tenant.full_name}`,
      message: `החוזה נשלח לחתימה דיגיטלית. ממתין לחתימת הדייר.`,
    });

    // Extra delivery layer: when we have the EasyDo fill_url, send it to the
    // tenant via Gmail SMTP too. Belt-and-suspenders — if EasyDo's own email
    // doesn't arrive (form stuck at status="incomplete", spam filtering,
    // etc.), the tenant still gets a working signing link from us.
    // Best-effort — failure here doesn't fail the request.
    let emailResult: { ok: boolean; configured: boolean; error?: string } | null = null;
    if (easydo.fill_url) {
      const subject = `חוזה לחתימה דיגיטלית — ${tenant.full_name}`;
      const text =
        `שלום ${tenant.full_name},\n\n` +
        `חוזה השכירות מוכן לחתימה דיגיטלית.\n` +
        `לחתימה לחץ על הקישור הבא:\n\n` +
        `${easydo.fill_url}\n\n` +
        `בכל שאלה — אנחנו כאן.\n` +
        `קבוצת חקיקת נכסים`;
      const html =
        `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6">` +
        `<p>שלום ${tenant.full_name},</p>` +
        `<p>חוזה השכירות מוכן לחתימה דיגיטלית.</p>` +
        `<p><a href="${easydo.fill_url}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">לחתימה על החוזה</a></p>` +
        `<p style="color:#666;font-size:13px">אם הכפתור לא עובד, העתק את הקישור הבא לדפדפן:<br><span dir="ltr">${easydo.fill_url}</span></p>` +
        `<p>בכל שאלה — אנחנו כאן.<br>קבוצת חקיקת נכסים</p>` +
        `</div>`;
      emailResult = await sendEmail({
        to: tenant.email,
        subject,
        text,
        html,
      });
      console.log("[send-for-signature] smtp dispatch", {
        contractId,
        to: tenant.email,
        ok: emailResult.ok,
        configured: emailResult.configured,
        error: emailResult.error,
      });
    }

    return NextResponse.json({
      document_id: easydo.document_id,
      signature_sent: true,
      fill_url: easydo.fill_url ?? null,
      email_sent: emailResult?.ok ?? false,
    });
  } catch (err) {
    console.error("send-for-signature failed", {
      contractId,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json(
      { error: "שליחה לחתימה נכשלה", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
