"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useCreatePayment } from "@/hooks/usePayments";

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

  const createPayment = useCreatePayment();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (tenantId && contractId) {
      await createPayment.mutateAsync({
        tenant_id: tenantId,
        contract_id: contractId,
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
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="רישום תשלום" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="דייר" value={tenantName} readOnly className="bg-gray-50" />

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
