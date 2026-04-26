"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Step1Personal } from "./wizard/Step1Personal";
import { Step2Unit } from "./wizard/Step2Unit";
import { Step3Terms } from "./wizard/Step3Terms";
import { Step4Preview } from "./wizard/Step4Preview";
import { Step5Sign } from "./wizard/Step5Sign";

export interface ContractFormData {
  // Step 1 - Tenant
  full_name: string;
  id_number: string;
  phone: string;
  whatsapp: string;
  email: string;
  // Step 2 - Unit
  legal_entity_id: string;
  complex_id: string;
  property_id: string;
  unit_id: string;
  entity_name: string;
  complex_name: string;
  property_name: string;
  unit_name: string;
  // Step 3 - Terms
  start_date: string;
  end_date: string;
  monthly_rent: number;
  annual_increase_percent: number;
  building_fee: number;
  arnona: number;
  payment_method: string;
  total_checks: number;
  // Step 3 - AI
  ai_instructions: string;
  // Step 4 - Generated contract
  contract_text: string;
  // Step 5 — set after the contract is persisted in DB
  contract_id?: string;
  tenant_id?: string;
  easydo_document_id?: string;
  contract_pdf_url?: string;
  signing_status: "pending" | "sent" | "signed";
}

const initialData: ContractFormData = {
  full_name: "",
  id_number: "",
  phone: "",
  whatsapp: "",
  email: "",
  legal_entity_id: "",
  complex_id: "",
  property_id: "",
  unit_id: "",
  entity_name: "",
  complex_name: "",
  property_name: "",
  unit_name: "",
  start_date: "",
  end_date: "",
  monthly_rent: 0,
  annual_increase_percent: 0,
  building_fee: 0,
  arnona: 0,
  payment_method: "checks",
  total_checks: 12,
  ai_instructions: "",
  contract_text: "",
  signing_status: "pending",
};

const steps = [
  { id: 1, label: "פרטי דייר" },
  { id: 2, label: "פרטי יחידה" },
  { id: 3, label: "תנאי חוזה" },
  { id: 4, label: "תצוגה מקדימה" },
  { id: 5, label: "חתימה ושליחה" },
];

export function ContractWizard() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<ContractFormData>(initialData);

  const updateData = (partial: Partial<ContractFormData>) => {
    setFormData((prev) => ({ ...prev, ...partial }));
  };

  const canNext = () => {
    switch (step) {
      case 1: return !!(formData.full_name && formData.id_number && formData.phone);
      case 2: return !!(formData.unit_name);
      case 3: return !!(formData.start_date && formData.end_date && formData.monthly_rent > 0);
      case 4: return true;
      default: return false;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Stepper */}
      <Card>
        <div className="flex items-center justify-between">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors",
                    step > s.id
                      ? "bg-success border-success text-white"
                      : step === s.id
                      ? "bg-primary border-primary text-white"
                      : "bg-white border-border text-muted"
                  )}
                >
                  {step > s.id ? <Check className="w-5 h-5" /> : s.id}
                </div>
                <span className={cn(
                  "text-xs mt-1 text-center",
                  step === s.id ? "text-primary font-medium" : "text-muted"
                )}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={cn(
                  "flex-1 h-0.5 mx-2 mt-[-16px]",
                  step > s.id ? "bg-success" : "bg-border"
                )} />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Step Content */}
      <Card>
        {step === 1 && <Step1Personal data={formData} onChange={updateData} />}
        {step === 2 && <Step2Unit data={formData} onChange={updateData} />}
        {step === 3 && <Step3Terms data={formData} onChange={updateData} />}
        {step === 4 && <Step4Preview data={formData} onChange={updateData} />}
        {step === 5 && <Step5Sign data={formData} onChange={updateData} />}
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="secondary"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
        >
          הקודם
        </Button>
        {step < 5 ? (
          <Button
            onClick={() => setStep((s) => Math.min(5, s + 1))}
            disabled={!canNext()}
          >
            הבא
          </Button>
        ) : (
          <Button disabled={formData.signing_status === "signed"}>
            סיום
          </Button>
        )}
      </div>
    </div>
  );
}
