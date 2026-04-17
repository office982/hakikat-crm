import { NextRequest, NextResponse } from "next/server";
import { enqueueJob } from "@/lib/worker";
import {
  RELIABILITY_RECOMPUTE_JOB,
  handleReliabilityRecompute,
} from "@/lib/worker/jobs/reliability-recompute";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const jobId = await enqueueJob(RELIABILITY_RECOMPUTE_JOB, undefined, {
      singletonKey: new Date().toISOString().split("T")[0],
    });
    if (jobId) return NextResponse.json({ queued: true, jobId });

    const result = await handleReliabilityRecompute();
    return NextResponse.json({ ran_inline: true, ...result });
  } catch (error) {
    console.error("reliability-recompute error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
