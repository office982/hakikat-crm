import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  color: "blue" | "green" | "red" | "purple";
  percent?: number;
}

const colorMap = {
  blue: { bg: "bg-blue-50", text: "text-blue-600", icon: "text-blue-500" },
  green: { bg: "bg-green-50", text: "text-green-600", icon: "text-green-500" },
  red: { bg: "bg-red-50", text: "text-red-600", icon: "text-red-500" },
  purple: { bg: "bg-purple-50", text: "text-purple-600", icon: "text-purple-500" },
};

export function KPICard({ title, value, subtitle, icon: Icon, color, percent }: KPICardProps) {
  const c = colorMap[color];

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-muted mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
          {percent !== undefined && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted">אחוז גביה</span>
                <span
                  className={cn(
                    "font-medium",
                    percent >= 90 ? "text-green-600" : percent >= 70 ? "text-amber-600" : "text-red-600"
                  )}
                >
                  {percent}%
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={cn(
                    "h-2 rounded-full transition-all",
                    percent >= 90 ? "bg-green-500" : percent >= 70 ? "bg-amber-500" : "bg-red-500"
                  )}
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <div className={cn("p-3 rounded-lg", c.bg)}>
          <Icon className={cn("w-6 h-6", c.icon)} />
        </div>
      </div>
    </Card>
  );
}
