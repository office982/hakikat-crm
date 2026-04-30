import { Card } from "@/components/ui/Card";
import { CreditCard, FileText, MessageCircle, RefreshCw } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import type { ActivityItem } from "@/types/tenant-profile";

const typeConfig = {
  payment: { icon: CreditCard, color: "text-green-500 bg-green-50" },
  contract: { icon: FileText, color: "text-blue-500 bg-blue-50" },
  message: { icon: MessageCircle, color: "text-purple-500 bg-purple-50" },
  update: { icon: RefreshCw, color: "text-amber-500 bg-amber-50" },
};

export function ActivityFeed({ activities }: { activities: ActivityItem[] }) {
  return (
    <Card>
      <h3 className="text-lg font-semibold mb-4">פעילות אחרונה</h3>
      <div className="space-y-4">
        {activities.map((activity) => {
          const config = typeConfig[activity.type];
          const Icon = config.icon;
          return (
            <div key={activity.id} className="flex items-start gap-3">
              <div className={`p-2 rounded-lg shrink-0 ${config.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700">{activity.description}</p>
                <p className="text-xs text-muted mt-0.5">{relativeTime(activity.timestamp)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
