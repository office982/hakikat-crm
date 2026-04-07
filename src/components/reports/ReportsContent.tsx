"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { KPICard } from "@/components/dashboard/KPICard";
import { CashFlowChart } from "./CashFlowChart";
import { ForecastChart } from "./ForecastChart";
import { MonthlyTable } from "./MonthlyTable";
import { EntityPieChart } from "./EntityPieChart";
import { formatCurrency } from "@/lib/utils";
import { CreditCard, TrendingUp, BarChart3, AlertTriangle, Download } from "lucide-react";

const entityOptions = [
  { value: "", label: "כל הישויות" },
  { value: "חקיקת", label: "חקיקת נכסים" },
  { value: "שיא", label: 'שיא הכרמל מדור בע"מ' },
  { value: "נכסי", label: 'נכסי המושבה בע"מ' },
];

const periodOptions = [
  { value: "month", label: "חודש" },
  { value: "quarter", label: "רבעון" },
  { value: "year", label: "שנה" },
];

export function ReportsContent() {
  const [entity, setEntity] = useState("");
  const [period, setPeriod] = useState("year");

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <Card>
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-3 flex-wrap">
            <Select options={periodOptions} value={period} onChange={(e) => setPeriod(e.target.value)} className="w-32" />
            <Select options={entityOptions} value={entity} onChange={(e) => setEntity(e.target.value)} className="w-52" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm"><Download className="w-4 h-4" />PDF</Button>
            <Button variant="outline" size="sm"><Download className="w-4 h-4" />Excel</Button>
          </div>
        </div>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="הכנסה חודשית" value={formatCurrency(142000)} subtitle={`מתוך ${formatCurrency(158000)} צפוי`} icon={CreditCard} color="green" percent={90} />
        <KPICard title="גביה שנתית" value={formatCurrency(1420000)} subtitle="מתחילת 2026" icon={TrendingUp} color="blue" />
        <KPICard title="ממוצע חודשי" value={formatCurrency(148000)} subtitle="12 חודשים אחרונים" icon={BarChart3} color="purple" />
        <KPICard title="חובות פתוחים" value={formatCurrency(47500)} subtitle="8 דיירים" icon={AlertTriangle} color="red" />
      </div>

      {/* Cash Flow Chart - 12 months back */}
      <CashFlowChart />

      {/* Forecast Chart - 12 months forward */}
      <ForecastChart />

      {/* Monthly Table + Entity Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <MonthlyTable />
        </div>
        <EntityPieChart />
      </div>
    </div>
  );
}
