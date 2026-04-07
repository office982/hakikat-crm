import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
}

const variantClasses = {
  default: "bg-gray-100 text-gray-700",
  success: "bg-success-light text-green-700",
  warning: "bg-warning-light text-amber-700",
  danger: "bg-danger-light text-red-700",
  info: "bg-accent text-primary",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function PaymentStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
    paid: { label: "שולם", variant: "success" },
    pending: { label: "ממתין", variant: "warning" },
    partial: { label: "חלקי", variant: "warning" },
    overdue: { label: "באיחור", variant: "danger" },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "default" };
  return <Badge variant={variant}>{label}</Badge>;
}

export function ContractStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
    active: { label: "פעיל", variant: "success" },
    pending_signature: { label: "ממתין לחתימה", variant: "warning" },
    expired: { label: "פג תוקף", variant: "danger" },
    cancelled: { label: "בוטל", variant: "default" },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "default" };
  return <Badge variant={variant}>{label}</Badge>;
}

export function CheckStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
    pending: { label: "ממתין", variant: "warning" },
    deposited: { label: "הופקד", variant: "success" },
    bounced: { label: "חזר", variant: "danger" },
    cancelled: { label: "בוטל", variant: "default" },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "default" };
  return <Badge variant={variant}>{label}</Badge>;
}
