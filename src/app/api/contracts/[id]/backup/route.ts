import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import { renderContractHtml } from "@/lib/contract-render";
import { ensureFolder, uploadToDriveFolder, makeFilePublic } from "@/lib/api/google-drive";

interface BackupBody {
  destination: "google_drive" | "onedrive";
  // For OneDrive, the client uploads with the user's token and posts back
  // the resulting URL here so we can persist it on the contract.
  uploaded_url?: string;
}

/**
 * Save (or re-save) a backup copy of a contract to a cloud destination.
 *
 * For Google Drive: server does everything (single shared service account).
 * For OneDrive: two trips — first call returns the rendered HTML so the
 * browser can upload using the operator's personal token, then a second
 * call with `uploaded_url` persists the resulting share link.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await context.params;
    const body: BackupBody = await request.json();

    if (body.destination !== "google_drive" && body.destination !== "onedrive") {
      return NextResponse.json({ error: "יעד אחסון לא חוקי" }, { status: 400 });
    }

    const { data: contract, error: cErr } = await supabase
      .from("contracts")
      .select(`id, tenant:tenants(id, full_name, id_number)`)
      .eq("id", contractId)
      .maybeSingle();

    if (cErr || !contract) {
      return NextResponse.json({ error: "חוזה לא נמצא" }, { status: 404 });
    }

    const tenant = contract.tenant as unknown as {
      id: string;
      full_name: string;
      id_number: string;
    } | null;
    if (!tenant) {
      return NextResponse.json({ error: "דייר לא נמצא" }, { status: 404 });
    }

    // Fast-path: OneDrive client already uploaded — just persist the URL.
    if (body.destination === "onedrive" && body.uploaded_url) {
      await persistBackup(contractId, body.destination, body.uploaded_url, tenant.full_name);
      return NextResponse.json({ url: body.uploaded_url, destination: body.destination });
    }

    // Need the contract text. Wizard stores it on action_logs at create time.
    const { data: log } = await supabase
      .from("action_logs")
      .select("description")
      .eq("entity_type", "contract")
      .eq("entity_id", contractId)
      .eq("action", "contract_text_saved")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const contractText = log?.description ?? "";
    if (!contractText) {
      return NextResponse.json(
        { error: "טקסט חוזה לא נמצא — לא ניתן ליצור עותק" },
        { status: 400 }
      );
    }

    const html = renderContractHtml({
      title: `חוזה שכירות — ${tenant.full_name}`,
      body: contractText,
      signerName: tenant.full_name,
      signerId: tenant.id_number,
    });

    const fileName = `חוזה_${tenant.full_name}_${new Date().toISOString().split("T")[0]}.html`;

    if (body.destination === "google_drive") {
      const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
      if (!root) {
        return NextResponse.json(
          { error: "Google Drive לא מוגדר (חסר GOOGLE_DRIVE_ROOT_FOLDER_ID)" },
          { status: 500 }
        );
      }
      const folderId = await ensureFolder(tenant.full_name, root);
      const uploaded = await uploadToDriveFolder({
        folderId,
        fileName,
        mimeType: "text/html",
        data: Buffer.from(html, "utf8"),
      });
      await makeFilePublic(uploaded.id);
      await persistBackup(contractId, body.destination, uploaded.web_view_link, tenant.full_name);
      return NextResponse.json({ url: uploaded.web_view_link, destination: body.destination });
    }

    // destination === "onedrive" without uploaded_url — return render data
    // so the client can upload with the operator's token.
    return NextResponse.json({
      needs_upload: true,
      render: { html, file_name: fileName, tenant_name: tenant.full_name },
    });
  } catch (err) {
    console.error("contract backup failed:", err);
    return NextResponse.json(
      { error: "גיבוי נכשל", details: String(err) },
      { status: 500 }
    );
  }
}

async function persistBackup(
  contractId: string,
  destination: "google_drive" | "onedrive",
  url: string,
  tenantName: string
) {
  await supabase
    .from("contracts")
    .update({ google_drive_url: url, updated_at: new Date().toISOString() })
    .eq("id", contractId);

  await supabase.from("action_logs").insert({
    entity_type: "contract",
    entity_id: contractId,
    action: "backup_saved",
    description: `עותק חוזה של ${tenantName} נשמר ב-${
      destination === "google_drive" ? "Google Drive" : "OneDrive"
    }: ${url}`,
    source: "manual",
    performed_by: "user",
  });
}
