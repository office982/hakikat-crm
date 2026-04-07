import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";

interface CurrencyDisplayProps {
  amount: number;
  className?: string;
  colored?: boolean;
}

export function CurrencyDisplay({ amount, className, colored }: CurrencyDisplayProps) {
  return (
    <span
      dir="ltr"
      className={cn(
        "font-medium tabular-nums",
        colored && amount > 0 && "text-green-600",
        colored && amount < 0 && "text-danger",
        className
      )}
    >
      {formatCurrency(amount)}
    </span>
  );
}
