"use client";

import { cn } from "@/lib/utils";
import { tierFor, tierLabelHe } from "@/lib/reliability";

interface Props {
  score: number | null | undefined;
  size?: "sm" | "md";
  showLabel?: boolean;
}

const TIER_CLASSES: Record<string, string> = {
  excellent: "bg-green-50 text-green-700 border-green-200",
  good: "bg-blue-50 text-blue-700 border-blue-200",
  fair: "bg-yellow-50 text-yellow-700 border-yellow-200",
  poor: "bg-red-50 text-red-700 border-red-200",
};

export function ReliabilityBadge({ score, size = "sm", showLabel = true }: Props) {
  if (score == null) return null;
  const tier = tierFor(score);
  const sizeCls = size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        TIER_CLASSES[tier],
        sizeCls
      )}
      title={`דירוג אמינות: ${score}/100`}
    >
      <span dir="ltr">{score}</span>
      {showLabel && <span>· {tierLabelHe(tier)}</span>}
    </span>
  );
}
