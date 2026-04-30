import { supabaseAdmin as supabase } from "@/lib/supabase";
import {
  ensureOneDriveFolder,
  uploadToOneDrive,
  isOneDriveServerConfigured,
} from "@/lib/api/onedrive-server";

export const ONEDRIVE_BACKUP_JOB = "onedrive-backup";

const BACKUP_TABLES = [
  "legal_entities",
  "complexes",
  "properties",
  "units",
  "tenants",
  "contracts",
  "payment_schedule",
  "payments",
  "checks",
  "invoices",
  "projects",
  "project_expenses",
  "notifications",
  "action_logs",
];

async function isEnabled(): Promise<boolean> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "onedrive_backup_enabled")
    .single();
  return data?.value === "true";
}

async function getRootFolderName(): Promise<string> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "onedrive_backup_folder_name")
    .single();
  return (
    data?.value || process.env.ONEDRIVE_BACKUP_FOLDER_NAME || "CRM Backups"
  );
}

/**
 * Mirror of the Google Drive backup job, but uploading to a personal /
 * tenant OneDrive via Microsoft Graph.
 *
 * Disabled by default — flip `onedrive_backup_enabled` to 'true' once
 * ONEDRIVE_CLIENT_ID + ONEDRIVE_REFRESH_TOKEN are provisioned. Each
 * run is logged in `drive_backups` with kind = 'onedrive_snapshot'
 * (re-using the existing audit table — `kind` is free-form text).
 */
export async function handleOneDriveBackup(): Promise<{
  success: boolean;
  rows?: number;
  file_id?: string;
  file_url?: string;
  skipped?: string;
  error?: string;
}> {
  if (!(await isEnabled())) {
    return { success: false, skipped: "disabled" };
  }
  if (!isOneDriveServerConfigured()) {
    const err = "OneDrive server credentials not configured";
    await supabase.from("drive_backups").insert({
      kind: "onedrive_snapshot",
      error: err,
    });
    return { success: false, error: err };
  }

  const dateStr = new Date().toISOString().split("T")[0];

  try {
    const rootName = await getRootFolderName();
    const rootId = await ensureOneDriveFolder(rootName, null);
    const dateFolderId = await ensureOneDriveFolder(dateStr, rootId);

    const snapshot: Record<string, unknown[]> = {};
    let totalRows = 0;
    for (const table of BACKUP_TABLES) {
      const { data, error } = await supabase.from(table).select("*");
      if (error) {
        console.warn(`[onedrive-backup] skipped ${table}: ${error.message}`);
        continue;
      }
      snapshot[table] = data || [];
      totalRows += snapshot[table].length;
    }

    const json = JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        tables: BACKUP_TABLES,
        rows: totalRows,
        data: snapshot,
      },
      null,
      2
    );
    const buf = Buffer.from(json, "utf-8");

    const uploaded = await uploadToOneDrive({
      folderId: dateFolderId,
      fileName: `hakikat_snapshot_${dateStr}.json`,
      mimeType: "application/json",
      data: buf,
    });

    await supabase.from("drive_backups").insert({
      kind: "onedrive_snapshot",
      file_id: uploaded.id,
      file_url: uploaded.web_url,
      size_bytes: uploaded.size_bytes || buf.length,
      tables_included: BACKUP_TABLES,
      rows_included: totalRows,
    });

    // Retention: keep the most recent 30 OneDrive audit rows.
    const { data: old } = await supabase
      .from("drive_backups")
      .select("id")
      .eq("kind", "onedrive_snapshot")
      .order("created_at", { ascending: false })
      .range(30, 999);
    if (old && old.length > 0) {
      await supabase
        .from("drive_backups")
        .delete()
        .in("id", old.map((o) => o.id));
    }

    console.log(
      `[onedrive-backup] Uploaded snapshot — ${totalRows} rows, ${buf.length} bytes`
    );
    return {
      success: true,
      rows: totalRows,
      file_id: uploaded.id,
      file_url: uploaded.web_url,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("drive_backups").insert({
      kind: "onedrive_snapshot",
      error: msg.slice(0, 500),
    });
    console.error("[onedrive-backup] Failed:", err);
    return { success: false, error: msg };
  }
}
