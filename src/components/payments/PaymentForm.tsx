"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useCreatePayment } from "@/hooks/usePayments";
import { useContracts } from "@/hooks/useContracts";

interface PaymentFormProps {
  isOpen: boolean;
  onClose: () => void;
  tenantName: string;
  tenantId?: string;
  contractId?: string;
  scheduleId?: string;
  defaultMonth?: string;
  defaultAmount?: number;
}

export function PaymentForm({
  isOpen, onClose, tenantName, tenantId, contractId, scheduleId, defaultMonth, defaultAmount,
}: PaymentFormProps) {
  const [method, setMethod] = useState("check");
  const [issueReceipt, setIssueReceipt] = useState(true);
  const [amount, setAmount] = useState(defaultAmount || 0);
  const [monthPaid, setMonthPaid] = useState(defaultMonth || "");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [checkNumber, setCheckNumber] = useState("");
  const [checkBank, setCheckBank] = useState("");
  const [checkDate, setCheckDate] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedContractId, setSelectedContractId] = useState("");

  const needsTenantPicker = !tenantId || !contractId;
  const { data: contracts, isLoading: contractsLoading } = useContracts(
    needsTenantPicker ? { status: "active" } : undefined
  );

  const contractOptions = useMemo(() => {
    if (!contracts) return [];
    return contracts.map((c) => {
      const unit = c.unit?.unit_identifier || "";
      const property = c.unit?.property?.name || "";
      const suffix = [unit, property].filter(Boolean).join(" · ");
      return {
        value: c.id,
        label: `${c.tenant?.full_name || "—"}${suffix ? ` (${suffix})` : ""}`,
      };
    });
  }, [contracts]);

  const selectedContract = useMemo(
    () => contracts?.find((c) => c.id === selectedContractId),
    [contracts, selectedContractId]
  );

  const createPayment = useCreatePayment();

  const resolvedTenantId = tenantId || selectedContract?.tenant_id;
  const resolvedContractId = contractId || selectedContractId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (resolvedTenantId && resolvedContractId) {
      await createPayment.mutateAsync({
        tenant_id: resolvedTenantId,
        contract_id: resolvedContractId,
        schedule_id: scheduleId,
        amount,
        payment_date: paymentDate,
        month_paid_for: monthPaid,
        payment_method: method,
        check_number: method === "check" ? checkNumber : undefined,
        check_bank: method === "check" ? checkBank : undefined,
        check_date: method === "check" ? checkDate : undefined,
        notes: notes || undefined,
        created_by: "manual",
      });
    }

    // TODO: If issueReceipt, call /api/icount/receipt

    onClose();
    // Reset
    setAmount(defaultAmount || 0);
    setNotes("");
    setCheckNumber("");
    setSelectedContractId("");
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="רישום תשלום" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {needsTenantPicker ? (
          <Select
            label="דייר"
            value={selectedContractId}
            onChange={(e) => setSelectedContractId(e.target.value)}
            options={contractOptions}
            placeholder={contractsLoading ? "טוען..." : "בחר דייר"}
            required
          />
        ) : (
          <Input label="דייר" value={tenantName} readOnly className="bg-gray-50" />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="עבור חודש (MM/YYYY)"
            value={monthPaid}
            onChange={(e) => setMonthPaid(e.target.value)}
            placeholder="04/2026"
            required
          />
          <Input
            label="סכום (₪)"
            type="number"
            value={amount || ""}
            onChange={(e) => setAmount(Number(e.target.value))}
            placeholder="0"
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="תאריך תשלום"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            required
          />
          <Select
            label="אמצעי תשלום"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            options={[
              { value: "check", label: "צ׳ק" },
              { value: "transfer", label: "העברה בנקאית" },
              { value: "cash", label: "מזומן" },
            ]}
          />
        </div>

        {method === "check" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
            <Input label="מספר צ׳ק" value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} placeholder="1234" />
            <Input label="בנק" value={checkBank} onChange={(e) => setCheckBank(e.target.value)} placeholder="לאומי" />
            <Input label="תאריך פירעון" type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)} />
          </div>
        )}

        <Input label="הערה" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="הערה חופשית..." />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={issueReceipt}
            onChange={(e) => setIssueReceipt(e.target.checked)}
            className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm">הנפק קבלה אוטומטית</span>
        </label>

        <div className="flex gap-3 justify-end pt-4 border-t border-border">
          <Button variant="secondary" type="button" onClick={onClose}>ביטול</Button>
          <Button type="submit" isLoading={createPayment.isPending}>רשום תשלום</Button>
        </div>
      </form>
    </Modal>
  );
}
