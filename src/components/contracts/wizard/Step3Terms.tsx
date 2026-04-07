"use client";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatCurrency } from "@/lib/utils";
import { getRentByYear } from "@/lib/payment-calculator";
import type { ContractFormData } from "../ContractWizard";

interface Props {
  data: ContractFormData;
  onChange: (partial: Partial<ContractFormData>) => void;
}

export function Step3Terms({ data, onChange }: Props) {
  const startYear = data.start_date ? new Date(data.start_date).getFullYear() : null;
  const endYear = data.end_date ? new Date(data.end_date).getFullYear() : null;
  const years = startYear && endYear ? Math.max(1, endYear - startYear + 1) : 1;

  const rentByYear =
    data.monthly_rent > 0 && data.annual_increase_percent >= 0
      ? getRentByYear(data.monthly_rent, data.annual_increase_percent, Math.min(years, 5))
      : [];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold mb-4">שלב 3 — תנאי חוזה</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="תאריך התחלה *"
          type="date"
          value={data.start_date}
          onChange={(e) => onChange({ start_date: e.target.value })}
          required
        />
        <Input
          label="תאריך סיום *"
          type="date"
          value={data.end_date}
          onChange={(e) => onChange({ end_date: e.target.value })}
          required
        />
        <Input
          label="שכ&quot;ד חודשי שנה 1 (₪) *"
          type="number"
          value={data.monthly_rent || ""}
          onChange={(e) => onChange({ monthly_rent: Number(e.target.value) })}
          placeholder="0"
          required
        />
        <Input
          label="% עלייה שנתית"
          type="number"
          value={data.annual_increase_percent || ""}
          onChange={(e) => onChange({ annual_increase_percent: Number(e.target.value) })}
          placeholder="0"
          hint="לדוגמה: 10 עבור 10% עלייה"
        />
        <Input
          label="ועד בית (₪)"
          type="number"
          value={data.building_fee || ""}
          onChange={(e) => onChange({ building_fee: Number(e.target.value) })}
          placeholder="0"
        />
        <Input
          label="ארנונה (₪)"
          type="number"
          value={data.arnona || ""}
          onChange={(e) => onChange({ arnona: Number(e.target.value) })}
          placeholder="0"
        />
        <Select
          label="אמצעי תשלום"
          value={data.payment_method}
          onChange={(e) => onChange({ payment_method: e.target.value })}
          options={[
            { value: "checks", label: "צ׳קים" },
            { value: "transfer", label: "העברה בנקאית" },
            { value: "cash", label: "מזומן" },
          ]}
        />
        <Input
          label="כמות צ׳קים נדרשת"
          type="number"
          value={data.total_checks || ""}
          onChange={(e) => onChange({ total_checks: Number(e.target.value) })}
          placeholder="12"
        />
      </div>

      {/* AI Instructions */}
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          הוראות נוספות ל-AI (אופציונלי)
        </label>
        <textarea
          value={data.ai_instructions}
          onChange={(e) => onChange({ ai_instructions: e.target.value })}
          placeholder="כתוב כאן במילים פשוטות דברים נוספים שסגרת עם הדייר, לדוגמה: 'הדייר מקבל חודש חינם בהתחלה', 'אין לשלם ארנונה ב-3 חודשים ראשונים', 'מותר לו לשפץ על חשבונו'..."
          className="w-full rounded-lg border border-border px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-gray-400"
        />
        <p className="text-xs text-muted mt-1">ה-AI ישלב את ההוראות האלה בחוזה שייווצר בשלב הבא</p>
      </div>

      {/* Auto-calculated rent by year */}
      {rentByYear.length > 0 && data.annual_increase_percent > 0 && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <p className="text-sm font-medium mb-2">שכ&quot;ד לפי שנים (חישוב אוטומטי):</p>
          <div className="flex flex-wrap gap-4">
            {rentByYear.map((r) => (
              <div key={r.year} className="text-sm">
                <span className="text-muted">שנה {r.year}:</span>{" "}
                <span className="font-medium" dir="ltr">{formatCurrency(r.rent)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
