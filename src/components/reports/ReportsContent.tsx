"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { KPICard } from "@/components/dashboard/KPICard";
import { CashFlowChart } from "./CashFlowChart";
import { ForecastChart } from "./ForecastChart";
import { MonthlyTable } from "./MonthlyTable";
import { EntityPieChart } from "./EntityPieChart";
import { formatCurrency } from "@/lib/utils";
import {
  useRevenueByMonth,
  useReportKPIs,
  useEntityBreakdown,
  useForecast,
  useLegalEntities,
  useMonthlyTableData,
} from "@/hooks/useReports";
import { CreditCard, TrendingUp, BarChart3, AlertTriangle, Download } from "lucide-react";

const periodOptions = [
  { value: "3", label: "3 חודשים" },
  { value: "6", label: "6 חודשים" },
  { value: "12", label: "שנה" },
];

export function ReportsContent() {
  const [entityId, setEntityId] = useState("");
  const [period, setPeriod] = useState("12");

  const months = parseInt(period) || 12;
  const entityFilter = entityId || undefined;

  // Fetch legal entities for filter dropdown
  const { data: entities } = useLegalEntities();

  const entityOptions = useMemo(() => {
    const opts = [{ value: "", label: "כל הישויות" }];
    for (const e of entities || []) {
      opts.push({ value: e.id, label: e.name });
    }
    return opts;
  }, [entities]);

  // Fetch report data
  const { data: revenueData, isLoading: revenueLoading } = useRevenueByMonth({
    legalEntityId: entityFilter,
    months,
  });
  const { data: kpis, isLoading: kpisLoading } = useReportKPIs({ legalEntityId: entityFilter });
  const { data: entityBreakdown, isLoading: entityLoading } = useEntityBreakdown();
  const { data: forecastData, isLoading: forecastLoading } = useForecast({ legalEntityId: entityFilter });
  const { data: monthlyTableData, isLoading: tableLoading } = useMonthlyTableData({
    legalEntityId: entityFilter,
    months,
  });

  const collectionPercent = kpis && kpis.monthlyExpected > 0
    ? Math.round((kpis.monthlyCollected / kpis.monthlyExpected) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <Card>
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-3 flex-wrap">
            <Select options={periodOptions} value={period} onChange={(e) => setPeriod(e.target.value)} className="w-32" />
            <Select options={entityOptions} value={entityId} onChange={(e) => setEntityId(e.target.value)} className="w-52" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm"><Download className="w-4 h-4" />PDF</Button>
            <Button variant="outline" size="sm"><Download className="w-4 h-4" />Excel</Button>
          </div>
        </div>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="הכנסה חודשית"
          value={kpisLoading ? "..." : formatCurrency(kpis?.monthlyCollected ?? 0)}
          subtitle={kpisLoading ? "" : `מתוך ${formatCurrency(kpis?.monthlyExpected ?? 0)} צפוי`}
          icon={CreditCard}
          color="green"
          percent={collectionPercent}
        />
        <KPICard
          title="גביה שנתית"
          value={kpisLoading ? "..." : formatCurrency(kpis?.annualCollection ?? 0)}
          subtitle={`מתחילת ${new Date().getFullYear()}`}
          icon={TrendingUp}
          color="blue"
        />
        <KPICard
          title="ממוצע חודשי"
          value={kpisLoading ? "..." : formatCurrency(kpis?.averageMonthly ?? 0)}
          subtitle="12 חודשים אחרונים"
          icon={BarChart3}
          color="purple"
        />
        <KPICard
          title="חובות פתוחים"
          value={kpisLoading ? "..." : formatCurrency(kpis?.openDebts ?? 0)}
          subtitle={kpisLoading ? "" : `${kpis?.debtTenants ?? 0} דיירים`}
          icon={AlertTriangle}
          color="red"
        />
      </div>

      {/* Cash Flow Chart - past months */}
      <CashFlowChart data={revenueData ?? []} isLoading={revenueLoading} />

      {/* Forecast Chart - 12 months forward */}
      <ForecastChart
        data={forecastData ?? []}
        currentMonthlyIncome={kpis?.monthlyExpected}
        isLoading={forecastLoading}
      />

      {/* Monthly Table + Entity Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <MonthlyTable data={monthlyTableData ?? []} isLoading={tableLoading} />
        </div>
        <EntityPieChart data={entityBreakdown ?? []} isLoading={entityLoading} />
      </div>
    </div>
  );
}
