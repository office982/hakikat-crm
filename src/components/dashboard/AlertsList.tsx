import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { AlertTriangle, Clock, FileText, CreditCard } from "lucide-react";
import type { AlertItem, AlertPriority } from "@/types/tenant-profile";

const priorityConfig: Record<AlertPriority, { color: string; badgeVariant: "danger" | "warning" | "info" | "default"; icon: typeof AlertTriangle }> = {
  critical: { color: "border-r-red-500", badgeVariant: "danger", icon: AlertTriangle },
  high: { color: "border-r-orange-500", badgeVariant: "warning", icon: FileText },
  medium: { color: "border-r-yellow-500", badgeVariant: "warning", icon: Clock },
  low: { color: "border-r-blue-500", badgeVariant: "info", icon: CreditCard },
};

export function AlertsList({ alerts }: { alerts: AlertItem[] }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">התראות פעילות</h3>
        <Badge>{alerts.length}</Badge>
      </div>
      <div className="space-y-3">
        {alerts.map((alert) => {
          const config = priorityConfig[alert.priority];
          const Icon = config.icon;
          return (
            <div
              key={alert.id}
              className={`flex items-start gap-3 p-3 rounded-lg bg-gray-50 border-r-4 ${config.color}`}
            >
              <Icon className="w-5 h-5 text-muted mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium">{alert.title}</span>
                  <Badge variant={config.badgeVariant} className="text-[10px]">
                    {alert.priority === "critical" ? "דחוף" : alert.priority === "high" ? "גבוה" : alert.priority === "medium" ? "בינוני" : "נמוך"}
                  </Badge>
                </div>
                <p className="text-xs text-muted">{alert.description}</p>
              </div>
              {alert.actionHref && (
                <Link
                  href={alert.actionHref}
                  className="text-xs text-primary font-medium hover:underline shrink-0"
                >
                  {alert.actionLabel}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
