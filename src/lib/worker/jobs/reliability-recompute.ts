import { recomputeAllReliability } from "@/lib/reliability";

export const RELIABILITY_RECOMPUTE_JOB = "reliability-recompute";

/**
 * Recomputes reliability scores for all active tenants via the
 * compute_reliability_scores RPC. Runs nightly.
 */
export async function handleReliabilityRecompute(): Promise<{ updated: number }> {
  const updated = await recomputeAllReliability();
  console.log(`[reliability-recompute] Updated ${updated} tenant scores`);
  return { updated };
}
