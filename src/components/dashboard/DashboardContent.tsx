"use client";

import { CreditCard, AlertTriangle, FileText, Building2 } from "lucide-react";
import { KPICard } from "./KPICard";
import { RevenueChart } from "./RevenueChart";
import { AlertsList } from "./AlertsList";
import { ActivityFeed } from "./ActivityFeed";
import { mockKPIs, mockRevenueData, mockAlerts, mockActivities } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";
import { useDashboardStats, useRecentActivity } from "@/hooks/useDashboard";
import { useNotifications } from "@/hooks/useNotifications";
import { PageSpinner } from "@/components/ui/Spinner";

export function DashboardContent() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: dbActivity } = useRecentActivity();
  const { data: dbNotifications } = useNotifications(true);

  // Use real data if available, fallback to mock
  const kpis = stats || mockKPIs;
  const collectionPercent = kpis.monthlyCollection.expected > 0
    ? Math.round((kpis.monthlyCollection.collected / kpis.monthlyCollection.expected) * 100)
    : 0;
  const occupancyPercent = kpis.occupancy.total > 0
    ? Math.round((kpis.occupancy.occupied / kpis.occupancy.total) * 100)
    : 0;

  // Map DB activity to feed format, fallback to mock
  const activities = dbActivity && dbActivity.length > 0
    ? dbActivity.map((log) => ({
        id: log.id,
        type: (log.entity_type === "payment" ? "payment" : log.entity_type === "contract" ? "contract" : "update") as "payment" | "contract" | "message" | "update",
        description: log.description || log.action,
        timestamp: log.created_at,
      }))
    : mockActivities;

  // Map DB notifications to alerts format, fallback to mock
  const alerts = dbNotifications && dbNotifications.length > 0
    ? dbNotifications.map((n) => ({
        id: n.id,
        priority: (n.type.includes("missing_payment") ? "critical" : n.type.includes("contract_expiry") ? "high" : "medium") as "critical" | "high" | "medium" | "low",
        title: n.title,
        description: n.message || "",
        type: n.type,
      }))
    : mockAlerts;

  if (statsLoading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="גביה חודשית"
          value={formatCurrency(kpis.monthlyCollection.collected)}
          subtitle={`מתוך ${formatCurrency(kpis.monthlyCollection.expected)} צפוי`}
          icon={CreditCard}
          color="green"
          percent={collectionPercent}
        />
        <KPICard
          title="חוב כולל"
          value={formatCurrency(kpis.totalDebt.amount)}
          subtitle={`${kpis.totalDebt.tenantsCount} דיירים חייבים`}
          icon={AlertTriangle}
          color="red"
        />
        <KPICard
          title="חוזים פוקעים"
          value={String(kpis.expiringContracts)}
          subtitle="ב-45 יום הקרובים"
          icon={FileText}
          color="purple"
        />
        <KPICard
          title="תפוסה"
          value={`${kpis.occupancy.occupied}/${kpis.occupancy.total}`}
          subtitle={`${occupancyPercent}% תפוסה`}
          icon={Building2}
          color="blue"
          percent={occupancyPercent}
        />
      </div>

      {/* Revenue Chart */}
      <RevenueChart data={mockRevenueData} />

      {/* Alerts + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AlertsList alerts={alerts} />
        <ActivityFeed activities={activities} />
      </div>
    </div>
  );
}
