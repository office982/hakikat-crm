import { supabase } from "@/lib/supabase";

export type ReliabilityTier = "excellent" | "good" | "fair" | "poor";

export function tierFor(score: number): ReliabilityTier {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "fair";
  return "poor";
}

export function tierLabelHe(tier: ReliabilityTier): string {
  switch (tier) {
    case "excellent":
      return "מצוין";
    case "good":
      return "טוב";
    case "fair":
      return "בינוני";
    case "poor":
      return "נמוך";
  }
}

/**
 * Recompute all tenant reliability scores via the DB RPC. Returns count updated.
 */
export async function recomputeAllReliability(): Promise<number> {
  const { data, error } = await supabase.rpc("compute_reliability_scores");
  if (error) throw error;
  return (data as number) || 0;
}

/**
 * Fetch the alert threshold setting (default 60).
 */
export async function getReliabilityAlertThreshold(): Promise<number> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "reliability_alert_threshold")
    .single();
  const n = Number(data?.value);
  return Number.isFinite(n) && n > 0 ? n : 60;
}
