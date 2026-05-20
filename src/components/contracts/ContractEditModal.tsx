"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Cloud } from "lucide-react";
import { useUpdateContract } from "@/hooks/useContracts";
import { createTenantFolder, uploadAndShare } from "@/lib/api/onedrive";
import type { Contract } from "@/types/database";
import { CloudDestinationModal, type CloudDestination } from "./CloudDestinationModal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  contract: Contract | null;
}

const STATUS_OPTIONS = [
  { value: "active", label: "פעיל" },
  { value: "pending_signature", label: "ממתין לחתימה" },
  { value: "expired", label: "פג תוקף" },
  { value: "cancelled", label: "מבוטל" },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: "checks", label: "צ'קים" },
  { value: "transfer", label: "העברה בנקאית" },
  { value: "cash", label: "מזומן" },
];

interface ContractEditForm {
  start_date: string;
  end_date: string;
  monthly_rent: number;
  annual_increase_percent: number;
  building_fee: number;
  arnona: number;
  payment_method: "checks" | "transfer" | "cash";
  total_checks: number;
  status: "active" | "pending_signature" | "expired" | "cancelled";
  google_drive_url: string;
}

export function ContractEditModal({ isOpen, onClose, contract }: Props) {
  const updateMut = useUpdateContract();
  const [form, setForm] = useState<ContractEditForm>({
    start_date: "",
    end_date: "",
    monthly_rent: 0,
    annual_increase_percent: 0,
    building_fee: 0,
    arnona: 0,
    payment_method: "checks",
    total_checks: 12,
    status: "active",
    google_drive_url: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);

  useEffect(() => {
    if (contract) {
      setForm({
        start_date: contract.start_date,
        end_date: contract.end_date,
        monthly_rent: contract.monthly_rent,
        annual_increase_percent: contract.annual_increase_percent,
        building_fee: contract.building_fee,
        arnona: contract.arnona,
        payment_method: contract.payment_method,
        total_checks: contract.total_checks,
        status: contract.status,
        google_drive_url: contract.google_drive_url ?? "",
      });
    }
    setError(null);
  }, [contract, isOpen]);

  const runBackup = async (destination: CloudDestination) => {
    if (!contract) return;
    setPickerOpen(false);
    setBackupBusy(true);
    setBackupNotice(null);
    setError(null);
    try {
      // First call: server uploads (Google Drive) or returns render data (OneDrive).
      const r1 = await fetch(`/api/contracts/${contract.id}/backup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination }),
      });
      const j1 = await r1.json();
      if (!r1.ok) throw new Error(j1.error || "גיבוי נכשל");

      let savedUrl: string = j1.url ?? "";

      if (j1.needs_upload) {
        // OneDrive: upload client-side, then call back to persist the URL.
        const { html, file_name, tenant_name } = j1.render as {
          html: string;
          file_name: string;
          tenant_name: string;
        };
        const folder = await createTenantFolder(tenant_name);
        const { url } = await uploadAndShare(
          folder.id,
          file_name,
          new Blob([html], { type: "text/html" })
        );
        const r2 = await fetch(`/api/contracts/${contract.id}/backup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destination, uploaded_url: url }),
        });
        const j2 = await r2.json();
        if (!r2.ok) throw new Error(j2.error || "שמירת קישור הגיבוי נכשלה");
        savedUrl = j2.url;
      }

      setForm((f) => ({ ...f, google_drive_url: savedUrl }));
      setBackupNotice(
        destination === "google_drive"
          ? "נשמר עותק ב-Google Drive"
          : "נשמר עותק ב-OneDrive"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "גיבוי נכשל");
    } finally {
      setBackupBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contract) return;
    setError(null);
    try {
      await updateMut.mutateAsync({
        id: contract.id,
        start_date: form.start_date,
        end_date: form.end_date,
        monthly_rent: form.monthly_rent,
        annual_increase_percent: form.annual_increase_percent,
        building_fee: form.building_fee,
        arnona: form.arnona,
        payment_method: form.payment_method,
        total_checks: form.total_checks,
        status: form.status,
        google_drive_url: form.google_drive_url.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="עריכת חוזה" size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="תאריך התחלה"
            type="date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
          <Input
            label="תאריך סיום"
            type="date"
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="שכ״ד חודשי (₪)"
            type="number"
            min={0}
            value={form.monthly_rent}
            onChange={(e) => setForm({ ...form, monthly_rent: Number(e.target.value) })}
          />
          <Input
            label="עלייה שנתית (%)"
            type="number"
            min={0}
            step="0.1"
            value={form.annual_increase_percent}
            onChange={(e) => setForm({ ...form, annual_increase_percent: Number(e.target.value) })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="ועד בית (₪)"
            type="number"
            min={0}
            value={form.building_fee}
            onChange={(e) => setForm({ ...form, building_fee: Number(e.target.value) })}
          />
          <Input
            label="ארנונה (₪)"
            type="number"
            min={0}
            value={form.arnona}
            onChange={(e) => setForm({ ...form, arnona: Number(e.target.value) })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="אופן תשלום"
            value={form.payment_method}
            onChange={(e) => setForm({ ...form, payment_method: e.target.value as ContractEditForm["payment_method"] })}
            options={PAYMENT_METHOD_OPTIONS}
          />
          <Input
            label="מספר צ׳קים"
            type="number"
            min={0}
            value={form.total_checks}
            onChange={(e) => setForm({ ...form, total_checks: Number(e.target.value) })}
          />
        </div>
        <Select
          label="סטטוס"
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value as ContractEditForm["status"] })}
          options={STATUS_OPTIONS}
        />
        <div className="space-y-2">
          <Input
            label="קישור גיבוי בענן"
            value={form.google_drive_url}
            onChange={(e) => setForm({ ...form, google_drive_url: e.target.value })}
            placeholder="https://..."
            dir="ltr"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPickerOpen(true)}
            isLoading={backupBusy}
          >
            <Cloud className="w-4 h-4" />
            שמור עותק לענן
          </Button>
          {backupNotice && <p className="text-sm text-success">{backupNotice}</p>}
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button type="submit" isLoading={updateMut.isPending}>
            שמור שינויים
          </Button>
        </div>
      </form>
      <CloudDestinationModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={runBackup}
        title="שמור עותק לענן"
        confirmLabel="שמור"
      />
    </Modal>
  );
}
