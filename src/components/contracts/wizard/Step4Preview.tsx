"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency, formatDate, formatMonthYear } from "@/lib/utils";
import { generatePaymentSchedule, calculateContractTotal } from "@/lib/payment-calculator";
import { Wand2, Edit, Eye, Loader2 } from "lucide-react";
import type { ContractFormData } from "../ContractWizard";

interface Props {
  data: ContractFormData;
  onChange?: (partial: Partial<ContractFormData>) => void;
}

export function Step4Preview({ data, onChange }: Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");

  const schedule =
    data.start_date && data.end_date && data.monthly_rent > 0
      ? generatePaymentSchedule({
          start_date: data.start_date,
          end_date: data.end_date,
          monthly_rent: data.monthly_rent,
          annual_increase_percent: data.annual_increase_percent,
        })
      : [];

  const total = calculateContractTotal(schedule);

  const handleGenerateContract = async () => {
    setIsGenerating(true);
    setError("");

    try {
      const response = await fetch("/api/contracts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: data.full_name,
          id_number: data.id_number,
          unit: data.unit_name,
          property: data.property_name,
          start_date: data.start_date,
          end_date: data.end_date,
          monthly_rent: data.monthly_rent,
          annual_increase: data.annual_increase_percent,
          building_fee: data.building_fee,
          arnona: data.arnona,
          ai_instructions: data.ai_instructions,
          entity_name: data.entity_name,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        onChange?.({ contract_text: result.contract_text });
      } else {
        setError(result.error || "שגיאה ביצירת החוזה");
      }
    } catch {
      setError("שגיאת חיבור. ודא שה-API key של Anthropic מוגדר.");
    }

    setIsGenerating(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">שלב 4 — תצוגה מקדימה</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <h3 className="font-medium mb-3">פרטי דייר</h3>
          <dl className="space-y-1.5 text-sm">
            <Row label="שם" value={data.full_name} />
            <Row label="ת.ז" value={data.id_number} />
            <Row label="טלפון" value={data.phone} />
          </dl>
        </Card>
        <Card>
          <h3 className="font-medium mb-3">תנאים</h3>
          <dl className="space-y-1.5 text-sm">
            <Row label="תקופה" value={data.start_date && data.end_date ? `${formatDate(data.start_date)} — ${formatDate(data.end_date)}` : "—"} />
            <Row label="שכ״ד" value={formatCurrency(data.monthly_rent)} />
            <Row label="עלייה שנתית" value={`${data.annual_increase_percent}%`} />
            <Row label="סה״כ" value={formatCurrency(total)} />
          </dl>
        </Card>
      </div>

      {/* AI Instructions reminder */}
      {data.ai_instructions && (
        <div className="bg-accent rounded-lg p-3 text-sm">
          <p className="font-medium text-primary mb-1">הוראות נוספות ל-AI:</p>
          <p className="text-gray-700">{data.ai_instructions}</p>
        </div>
      )}

      {/* Contract Text Generation */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">טקסט החוזה</h3>
          <div className="flex gap-2">
            {data.contract_text && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? <><Eye className="w-4 h-4" />תצוגה</> : <><Edit className="w-4 h-4" />עריכה</>}
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleGenerateContract}
              isLoading={isGenerating}
            >
              <Wand2 className="w-4 h-4" />
              {data.contract_text ? "צור מחדש" : "צור חוזה עם AI"}
            </Button>
          </div>
        </div>

        {error && (
          <div className="bg-danger-light text-danger rounded-lg p-3 text-sm mb-4">
            {error}
          </div>
        )}

        {isGenerating && (
          <div className="flex items-center justify-center py-12 text-muted">
            <Loader2 className="w-6 h-6 animate-spin ml-2" />
            <span>ה-AI יוצר את החוזה... (עד 30 שניות)</span>
          </div>
        )}

        {data.contract_text && !isGenerating && (
          isEditing ? (
            <textarea
              value={data.contract_text}
              onChange={(e) => onChange?.({ contract_text: e.target.value })}
              className="w-full rounded-lg border border-border px-4 py-3 text-sm min-h-[400px] font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/20"
              dir="rtl"
            />
          ) : (
            <div className="bg-gray-50 rounded-lg p-4 max-h-[500px] overflow-y-auto text-sm whitespace-pre-wrap leading-relaxed">
              {data.contract_text}
            </div>
          )
        )}

        {!data.contract_text && !isGenerating && (
          <div className="text-center py-12 text-muted">
            <Wand2 className="w-8 h-8 mx-auto mb-2" />
            <p>לחץ &quot;צור חוזה עם AI&quot; כדי ליצור את טקסט החוזה</p>
            <p className="text-xs mt-1">ה-AI ישתמש בכל הפרטים שהזנת כולל ההוראות הנוספות</p>
          </div>
        )}
      </Card>

      {/* Payment Schedule */}
      {schedule.length > 0 && (
        <Card noPadding>
          <div className="p-4 border-b border-border">
            <h3 className="font-medium">לוח תשלומים ({schedule.length} חודשים)</h3>
          </div>
          <div className="overflow-x-auto max-h-60">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="border-b border-border">
                  <th className="text-right px-4 py-2 font-medium text-muted">חודש</th>
                  <th className="text-right px-4 py-2 font-medium text-muted">שנה</th>
                  <th className="text-right px-4 py-2 font-medium text-muted">סכום</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((row, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-4 py-2">{formatMonthYear(row.month_year)}</td>
                    <td className="px-4 py-2 text-muted">{row.year_number}</td>
                    <td className="px-4 py-2 font-medium" dir="ltr">{formatCurrency(row.expected_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
