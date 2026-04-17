import { supabase } from "@/lib/supabase";
import { ensureFolder, uploadToDriveFolder } from "@/lib/api/google-drive";

export const DRIVE_BACKUP_JOB = "drive-backup";

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
    .eq("key", "drive_backup_enabled")
    .single();
  return data?.value !== "false";
}

async function backupFolderId(): Promise<string | null> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "drive_backup_folder_id")
    .single();
  const val = data?.value;
  if (val) return val;
  return process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID || null;
}

/**
 * Drive auto-backup: exports core tables as JSON, zips (single JSON for now)
 * and uploads to the configured Drive folder under a dated subfolder.
 * Tracks each run in `drive_backups`.
 */
export async function handleDriveBackup(): Promise<{
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

  const rootId = await backupFolderId();
  if (!rootId) {
    const err = "drive_backup_folder_id is not configured";
    await supabase.from("drive_backups").insert({
      kind: "snapshot",
      error: err,
    });
    return { success: false, error: err };
  }

  const dateStr = new Date().toISOString().split("T")[0];

  try {
    // One dated subfolder per day; the backup file inside is the snapshot.
    const dateFolderId = await ensureFolder(dateStr, rootId);

    const snapshot: Record<string, unknown[]> = {};
    let totalRows = 0;
    for (const table of BACKUP_TABLES) {
      const { data, error } = await supabase.from(table).select("*");
      if (error) {
        console.warn(`[drive-backup] skipped ${table}: ${error.message}`);
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

    const uploaded = await uploadToDriveFolder({
      folderId: dateFolderId,
      fileName: `hakikat_snapshot_${dateStr}.json`,
      mimeType: "application/json",
      data: buf,
    });

    await supabase.from("drive_backups").insert({
      kind: "snapshot",
      file_id: uploaded.id,
      file_url: uploaded.web_view_link,
      size_bytes: uploaded.size_bytes || buf.length,
      tables_included: BACKUP_TABLES,
      rows_included: totalRows,
    });

    // Retention: keep the most recent 30 snapshot rows in the audit table.
    const { data: old } = await supabase
      .from("drive_backups")
      .select("id")
      .eq("kind", "snapshot")
      .order("created_at", { ascending: false })
      .range(30, 999);
    if (old && old.length > 0) {
      await supabase.from("drive_backups").delete().in("id", old.map((o) => o.id));
    }

    console.log(
      `[drive-backup] Uploaded snapshot — ${totalRows} rows, ${buf.length} bytes`
    );
    return {
      success: true,
      rows: totalRows,
      file_id: uploaded.id,
      file_url: uploaded.web_view_link,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("drive_backups").insert({
      kind: "snapshot",
      error: msg.slice(0, 500),
    });
    console.error("[drive-backup] Failed:", err);
    return { success: false, error: msg };
  }
}
