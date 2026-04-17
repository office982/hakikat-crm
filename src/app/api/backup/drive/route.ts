import { NextRequest, NextResponse } from "next/server";
import { enqueueJob } from "@/lib/worker";
import {
  DRIVE_BACKUP_JOB,
  handleDriveBackup,
} from "@/lib/worker/jobs/drive-backup";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const jobId = await enqueueJob(DRIVE_BACKUP_JOB, undefined, {
      singletonKey: new Date().toISOString().split("T")[0],
    });
    if (jobId) return NextResponse.json({ queued: true, jobId });

    const result = await handleDriveBackup();
    return NextResponse.json({ ran_inline: true, ...result });
  } catch (error) {
    console.error("drive-backup trigger error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
