import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendForSignature } from "@/lib/api/easydo";
import { uploadToDriveFolder, ensureFolder, makeFilePublic } from "@/lib/api/google-drive";
import { renderContractHtml } from "@/lib/contract-render";

interface SendBody {
  contract_text: string;
  webhook_url?: string;
  destination?: "google_drive" | "onedrive";
  // OneDrive uploads happen client-side; if destination=onedrive,
  // pass the public file URL the client created.
  uploaded_url?: string;
}

/**
 * Send a contract for digital signature via EasyDo.
 *
 * Flow:
 * 1. Render the contract text as a printable HTML document.
 * 2. Upload it to Google Drive (or use a client-supplied URL for OneDrive).
 * 3. Make the Drive file public so EasyDo can fetch it.
 * 4. Call EasyDo to start the signature ceremony.
 * 5. Persist easydo_document_id + drive URL on the contract.
 * 6. Return the document id so the UI can show the status.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await context.params;
    const body: SendBody = await request.json();

    if (!body.contract_text) {
      return NextResponse.json({ error: "טקסט חוזה חסר" }, { status: 400 });
    }

    // Look up contract + tenant
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

    // Idempotency: don't resend if already signed
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

    // 1+2. Build the HTML and upload to Drive (unless caller supplied a URL)
    let documentUrl = body.uploaded_url || "";
    let driveFileId: string | null = null;

    if (!documentUrl) {
      const html = renderContractHtml({
        title: `חוזה שכירות — ${tenant.full_name}`,
        body: body.contract_text,
        signerName: tenant.full_name,
        signerId: tenant.id_number,
      });
      const buf = Buffer.from(html, "utf8");

      const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
      if (!root) {
        return NextResponse.json(
          { error: "Google Drive לא מוגדר — בקש מהמנהל להגדיר GOOGLE_DRIVE_ROOT_FOLDER_ID" },
          { status: 500 }
        );
      }

      const folderId = await ensureFolder(tenant.full_name, root);
      const fileName = `חוזה_${tenant.full_name}_${new Date().toISOString().split("T")[0]}.html`;
      const uploaded = await uploadToDriveFolder({
        folderId,
        fileName,
        mimeType: "text/html",
        data: buf,
      });
      await makeFilePublic(uploaded.id);
      documentUrl = uploaded.web_view_link;
      driveFileId = uploaded.id;
    }

    // 3+4. Send to EasyDo for signature
    const callbackUrl =
      body.webhook_url ||
      `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/webhooks/easydo`;

    const phoneNorm = (tenant.whatsapp || tenant.phone || "").replace(/^0/, "972");

    const easydo = await sendForSignature({
      document_name: `חוזה שכירות — ${tenant.full_name}`,
      signers: [
        {
          name: tenant.full_name,
          phone: phoneNorm,
          email: tenant.email || undefined,
        },
      ],
      pdf_url: documentUrl,
      webhook_url: callbackUrl,
    });

    // 5. Persist easydo_document_id + drive URL
    await supabase
      .from("contracts")
      .update({
        easydo_document_id: easydo.document_id,
        google_drive_url: documentUrl,
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

    return NextResponse.json({
      document_id: easydo.document_id,
      document_url: documentUrl,
      drive_file_id: driveFileId,
    });
  } catch (err) {
    console.error("send-for-signature failed:", err);
    return NextResponse.json(
      { error: "שליחה לחתימה נכשלה", details: String(err) },
      { status: 500 }
    );
  }
}
