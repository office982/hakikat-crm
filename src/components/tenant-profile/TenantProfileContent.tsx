"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { TenantHeader } from "./TenantHeader";
import { PersonalInfo } from "./PersonalInfo";
import { ContractDetails } from "./ContractDetails";
import { PaymentScheduleTable } from "./PaymentScheduleTable";
import { ChecksManager } from "./ChecksManager";
import { BalanceSummary } from "./BalanceSummary";
import { ActionLog } from "./ActionLog";
import { PaymentForm } from "@/components/payments/PaymentForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { UserX } from "lucide-react";
import { getMockTenantDetail } from "@/lib/mock-data";

const tabs = [
  { id: "personal", label: "פרטים אישיים" },
  { id: "contract", label: "פרטי חוזה" },
  { id: "payments", label: "לוח תשלומים" },
  { id: "checks", label: "צ׳קים" },
  { id: "balance", label: "יתרה וסיכום" },
  { id: "logs", label: "יומן פעולות" },
];

export function TenantProfileContent({ tenantId }: { tenantId: string }) {
  const [activeTab, setActiveTab] = useState("personal");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentMonth, setPaymentMonth] = useState<string | undefined>();

  const tenant = getMockTenantDetail(tenantId);

  if (!tenant) {
    return (
      <EmptyState
        icon={UserX}
        title="דייר לא נמצא"
        description="הדייר המבוקש לא קיים במערכת"
      />
    );
  }

  const handleRecordPayment = (monthYear?: string) => {
    setPaymentMonth(monthYear);
    setShowPaymentForm(true);
  };

  return (
    <div className="space-y-4">
      <TenantHeader tenant={tenant} onRecordPayment={() => handleRecordPayment()} />

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <div className="mt-4">
        {activeTab === "personal" && <PersonalInfo tenant={tenant} />}
        {activeTab === "contract" && <ContractDetails tenant={tenant} />}
        {activeTab === "payments" && (
          <PaymentScheduleTable
            schedule={tenant.payment_schedule}
            onRecordPayment={handleRecordPayment}
          />
        )}
        {activeTab === "checks" && (
          <ChecksManager
            checks={tenant.checks}
            totalRequired={tenant.contract.total_checks}
          />
        )}
        {activeTab === "balance" && <BalanceSummary schedule={tenant.payment_schedule} />}
        {activeTab === "logs" && <ActionLog logs={tenant.action_logs} />}
      </div>

      <PaymentForm
        isOpen={showPaymentForm}
        onClose={() => setShowPaymentForm(false)}
        tenantName={tenant.full_name}
        defaultMonth={paymentMonth}
        defaultAmount={tenant.contract.monthly_rent}
      />
    </div>
  );
}
