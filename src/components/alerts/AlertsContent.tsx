"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Bell, CheckCircle, AlertTriangle, FileText, CreditCard, Clock } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useNotifications, useMarkAsRead } from "@/hooks/useNotifications";

const typeIcons: Record<string, typeof AlertTriangle> = {
  missing_payment: CreditCard,
  contract_expiry_45: FileText,
  contract_expiry_30: FileText,
  check_due: Clock,
  unpaid_supplier_invoice: AlertTriangle,
};

export function AlertsContent() {
  const [showRead, setShowRead] = useState(false);
  const { data: dbNotifications = [] } = useNotifications();
  const markAsRead = useMarkAsRead();

  const alerts = dbNotifications.map((n) => ({
    id: n.id,
    title: n.title,
    message: n.message || "",
    type: n.type,
    is_read: n.is_read,
    timestamp: n.created_at,
  }));

  const filtered = showRead ? alerts : alerts.filter((a) => !a.is_read);
  const unreadCount = alerts.filter((a) => !a.is_read).length;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">התראות</h2>
            {unreadCount > 0 && <Badge variant="danger">{unreadCount} לא נקראו</Badge>}
          </div>
          <div className="flex gap-2">
            <Button
              variant={showRead ? "secondary" : "primary"}
              size="sm"
              onClick={() => setShowRead(false)}
            >
              לא נקראו ({unreadCount})
            </Button>
            <Button
              variant={showRead ? "primary" : "secondary"}
              size="sm"
              onClick={() => setShowRead(true)}
            >
              הכל ({alerts.length})
            </Button>
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState icon={Bell} title="אין התראות" description={showRead ? "אין התראות במערכת" : "כל ההתראות נקראו"} />
      ) : (
        <div className="space-y-2">
          {filtered.map((alert) => {
            const Icon = typeIcons[alert.type] || Bell;
            return (
              <Card key={alert.id}>
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "p-2 rounded-lg shrink-0",
                    alert.type.includes("payment") ? "bg-red-50 text-red-500" :
                    alert.type.includes("contract") ? "bg-amber-50 text-amber-500" :
                    alert.type.includes("check") ? "bg-yellow-50 text-yellow-600" :
                    "bg-blue-50 text-blue-500"
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium">{alert.title}</p>
                      {!alert.is_read && <span className="w-2 h-2 rounded-full bg-danger shrink-0" />}
                    </div>
                    <p className="text-sm text-muted">{alert.message}</p>
                    <p className="text-xs text-muted mt-1">{relativeTime(alert.timestamp)}</p>
                  </div>
                  {!alert.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markAsRead.mutate(alert.id)}
                    >
                      <CheckCircle className="w-4 h-4" />
                      סמן כנקרא
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
