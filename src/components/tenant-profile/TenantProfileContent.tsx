"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { PageSpinner } from "@/components/ui/Spinner";
import { UserX } from "lucide-react";
import { useTenant } from "@/hooks/useTenants";
import { usePaymentSchedule, usePayments } from "@/hooks/usePayments";
import { useChecks } from "@/hooks/useChecks";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { TenantDetail, PaymentScheduleRow, CheckRow, ActionLogRow } from "@/types/tenant-profile";

const tabs = [
  { id: "personal", label: "פרטים אישיים" },
  { id: "contract", label: "פרטי חוזה" },
  { id: "payments", label: "לוח תשלומים" },
  { id: "checks", label: "צ׳קים" },
  { id: "balance", label: "יתרה וסיכום" },
  { id: "logs", label: "יומן פעולות" },
];

function useActionLogs(tenantId: string, contractIds: string[]) {
  return useQuery({
    queryKey: ["action_logs", tenantId, contractIds],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return [];

      // Get logs for tenant entity and all their contracts/payments
      const entityIds = [tenantId, ...contractIds];
      const { data, error } = await supabase
        .from("action_logs")
        .select("*")
        .in("entity_id", entityIds)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });
}

export function TenantProfileContent({ tenantId }: { tenantId: string }) {
  const [activeTab, setActiveTab] = useState("personal");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentMonth, setPaymentMonth] = useState<string | undefined>();
  const [paymentScheduleId, setPaymentScheduleId] = useState<string | undefined>();
  const [paymentAmount, setPaymentAmount] = useState<number | undefined>();

  const { data: tenant, isLoading: tenantLoading } = useTenant(tenantId);
  const activeContract = tenant?.contracts?.find((c) => c.status === "active") || tenant?.contracts?.[0];
  const { data: scheduleRows } = usePaymentSchedule(activeContract?.id, tenantId);
  const { data: payments } = usePayments({ tenantId });
  const { data: checks } = useChecks({ tenantId });
  const contractIds = useMemo(() => tenant?.contracts?.map((c) => c.id) || [], [tenant]);
  const { data: actionLogs } = useActionLogs(tenantId, contractIds);

  // Build the adapted tenant detail for sub-components
  const tenantDetail: TenantDetail | null = useMemo(() => {
    if (!tenant) return null;

    const contract = activeContract;
    const unit = tenant.unit;
    const property = unit?.property;

    // Build payment schedule in the shape sub-components expect
    const paymentSchedule: MockPaymentRow[] = (scheduleRows || []).map((row) => {
      // Find matching payment(s) for this schedule row
      const matchingPayments = (payments || []).filter(
        (p) => p.month_paid_for === row.month_year
      );
      const paidAmount = matchingPayments.reduce((sum, p) => sum + p.amount, 0);
      const lastPayment = matchingPayments[0];

      return {
        id: row.id,
        month_year: row.month_year,
        expected_amount: row.expected_amount,
        paid_amount: paidAmount,
        balance: row.expected_amount - paidAmount,
        payment_date: lastPayment?.payment_date || null,
        payment_method: lastPayment?.payment_method || null,
        receipt_url: lastPayment?.receipt_url || null,
        status: row.status,
        year_number: row.year_number,
      };
    });

    // Build checks in the shape sub-components expect
    const checksData: MockCheck[] = (checks || []).map((c) => ({
      id: c.id,
      check_number: c.check_number,
      bank_name: c.bank_name || "",
      amount: c.amount,
      for_month: c.for_month,
      due_date: c.due_date,
      status: c.status,
    }));

    // Build action logs
    const logs: MockActionLog[] = (actionLogs || []).map((log) => ({
      id: log.id,
      action: log.action,
      description: log.description || log.action,
      source: log.source || "system",
      timestamp: log.created_at,
      type: (
        log.entity_type === "payment" ? "payment" :
        log.entity_type === "contract" ? "contract" :
        log.action?.includes("whatsapp") || log.action?.includes("message") ? "message" :
        "update"
      ) as MockActionLog["type"],
    }));

    return {
      id: tenant.id,
      full_name: tenant.full_name,
      id_number: tenant.id_number,
      phone: tenant.phone,
      whatsapp: tenant.whatsapp || tenant.phone,
      email: tenant.email,
      unit: unit?.unit_identifier || "",
      property: property?.name || "",
      entity: property?.legal_entity?.name || contract?.legal_entity?.name || "",
      unit_type: unit?.unit_type || "residential",
      floor: unit?.floor ?? null,
      notes: tenant.notes || "",
      contract: {
        id: contract?.id || "",
        start_date: contract?.start_date || "",
        end_date: contract?.end_date || "",
        monthly_rent: contract?.monthly_rent || 0,
        annual_increase_percent: contract?.annual_increase_percent || 0,
        building_fee: contract?.building_fee || 0,
        arnona: contract?.arnona || 0,
        payment_method: contract?.payment_method || "checks",
        total_checks: contract?.total_checks || 0,
        checks_received: contract?.checks_received || 0,
        status: contract?.status || "active",
        google_drive_url: contract?.google_drive_url || null,
      },
      payment_schedule: paymentSchedule,
      checks: checksData,
      action_logs: logs,
    };
  }, [tenant, activeContract, scheduleRows, payments, checks, actionLogs]);

  if (tenantLoading) {
    return <PageSpinner />;
  }

  if (!tenant) {
    return (
      <EmptyState
        icon={UserX}
        title="דייר לא נמצא"
        description="הדייר המבוקש לא קיים במערכת"
      />
    );
  }

  if (!tenantDetail) {
    return <PageSpinner />;
  }

  const handleRecordPayment = (monthYear?: string) => {
    setPaymentMonth(monthYear);
    // Find the schedule row for this month to pre-fill the form
    if (monthYear && scheduleRows) {
      const row = scheduleRows.find((r) => r.month_year === monthYear);
      if (row) {
        setPaymentScheduleId(row.id);
        setPaymentAmount(row.expected_amount);
      }
    } else {
      setPaymentScheduleId(undefined);
      setPaymentAmount(activeContract?.monthly_rent);
    }
    setShowPaymentForm(true);
  };

  return (
    <div className="space-y-4">
      <TenantHeader tenant={tenantDetail} onRecordPayment={() => handleRecordPayment()} />

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <div className="mt-4">
        {activeTab === "personal" && <PersonalInfo tenant={tenantDetail} />}
        {activeTab === "contract" && <ContractDetails tenant={tenantDetail} />}
        {activeTab === "payments" && (
          <PaymentScheduleTable
            schedule={tenantDetail.payment_schedule}
            onRecordPayment={handleRecordPayment}
          />
        )}
        {activeTab === "checks" && (
          <ChecksManager
            checks={tenantDetail.checks}
            totalRequired={tenantDetail.contract.total_checks}
          />
        )}
        {activeTab === "balance" && <BalanceSummary schedule={tenantDetail.payment_schedule} />}
        {activeTab === "logs" && <ActionLog logs={tenantDetail.action_logs} />}
      </div>

      <PaymentForm
        isOpen={showPaymentForm}
        onClose={() => setShowPaymentForm(false)}
        tenantName={tenantDetail.full_name}
        tenantId={tenantId}
        contractId={activeContract?.id}
        scheduleId={paymentScheduleId}
        defaultMonth={paymentMonth}
        defaultAmount={paymentAmount || tenantDetail.contract.monthly_rent}
      />
    </div>
  );
}
