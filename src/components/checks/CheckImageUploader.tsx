"use client";

import { useState, useRef, useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { useTenants } from "@/hooks/useTenants";
import { useContracts } from "@/hooks/useContracts";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, X, Camera, CheckCircle2, AlertCircle, Receipt } from "lucide-react";

interface ScannedCheck {
  check_number: string | null;
  bank_name: string | null;
  branch_number: string | null;
  account_number: string | null;
  amount: number | null;
  due_date: string | null;
}

interface CheckImageUploaderProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CheckImageUploader({ isOpen, onClose }: CheckImageUploaderProps) {
  const [images, setImages] = useState<{ file: File; preview: string; base64: string }[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scannedChecks, setScannedChecks] = useState<ScannedCheck[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState("");
  const [selectedContract, setSelectedContract] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const { data: tenants = [] } = useTenants({ status: "active" });
  const { data: contracts = [] } = useContracts({ status: "active" });
  const queryClient = useQueryClient();
  const [saveResults, setSaveResults] = useState<{
    receipts: number;
    skipped: number;
    failed: number;
  } | null>(null);

  // Filter contracts for selected tenant
  const tenantContracts = selectedTenant
    ? contracts.filter((c) => c.tenant_id === selectedTenant && c.status === "active")
    : [];

  const tenantOptions = tenants.map((t) => ({
    value: t.id,
    label: t.full_name,
  }));

  const contractOptions = tenantContracts.map((c) => ({
    value: c.id,
    label: `${c.unit?.property?.name || ""} ${c.unit?.unit_identifier || ""} - ${c.monthly_rent} ₪/חודש`,
  }));

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const newImages: { file: File; preview: string; base64: string }[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const base64 = await fileToBase64(file);
      newImages.push({
        file,
        preview: URL.createObjectURL(file),
        base64,
      });
    }
    setImages((prev) => [...prev, ...newImages]);
    setError(null);
  }, []);

  const removeImage = (index: number) => {
    setImages((prev) => {
      const newImages = [...prev];
      URL.revokeObjectURL(newImages[index].preview);
      newImages.splice(index, 1);
      return newImages;
    });
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleScan = async () => {
    if (images.length === 0) return;
    setScanning(true);
    setError(null);

    try {
      const response = await fetch("/api/checks/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: images.map((img) => img.base64),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "שגיאה בסריקה");
      }

      setScannedChecks(data.checks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בסריקת הצ'קים");
    } finally {
      setScanning(false);
    }
  };

  const updateCheck = (index: number, field: keyof ScannedCheck, value: string | number | null) => {
    setScannedChecks((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSave = async () => {
    if (!selectedTenant || !selectedContract) {
      setError("יש לבחור דייר וחוזה");
      return;
    }

    const invalidChecks = scannedChecks.filter(
      (c) => !c.check_number || !c.amount || !c.due_date
    );
    if (invalidChecks.length > 0) {
      setError("יש למלא מספר צ'ק, סכום ותאריך פירעון לכל הצ'קים");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/checks/scan-and-record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: selectedTenant,
          contract_id: selectedContract,
          checks: scannedChecks,
          source: "manual",
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "שגיאה בשמירת הצ'קים");

      const receipts = (json.results || []).filter(
        (r: { receipt_doc_number: number | null }) => r.receipt_doc_number != null
      ).length;
      const skipped = (json.results || []).filter(
        (r: { receipt_skipped: boolean; receipt_doc_number: number | null }) =>
          r.receipt_skipped && r.receipt_doc_number == null
      ).length;
      const failed = (json.errors || []).length;

      setSaveResults({ receipts, skipped, failed });
      // Invalidate everything that may have changed
      queryClient.invalidateQueries({ queryKey: ["checks"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment_schedule"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירת הצ'קים");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    // Cleanup previews
    images.forEach((img) => URL.revokeObjectURL(img.preview));
    setImages([]);
    setScannedChecks([]);
    setError(null);
    setSuccess(false);
    setSaveResults(null);
    setSelectedTenant("");
    setSelectedContract("");
    onClose();
  };

  // Contract comparison
  const selectedContractData = contracts.find((c) => c.id === selectedContract);
  const totalExpected = selectedContractData?.total_checks || 0;
  const existingChecks = selectedContractData?.checks_received || 0;
  const newChecks = scannedChecks.length;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="סריקת צ'קים עם AI" size="xl">
      <div className="space-y-6">
        {/* Success state */}
        {success ? (
          <div className="text-center py-8 space-y-4">
            <CheckCircle2 className="w-16 h-16 text-success mx-auto" />
            <p className="text-lg font-semibold">הצ'קים נשמרו בהצלחה!</p>
            <p className="text-muted">{scannedChecks.length} צ'קים נוספו למערכת</p>
            {saveResults && (
              <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2 max-w-md mx-auto text-right">
                {saveResults.receipts > 0 && (
                  <div className="flex items-center gap-2 text-success">
                    <Receipt className="w-4 h-4" />
                    <span>{saveResults.receipts} קבלות הופקו אוטומטית</span>
                  </div>
                )}
                {saveResults.skipped > 0 && (
                  <div className="text-muted">{saveResults.skipped} ללא קבלה (ישות פרטית או כיבוי אוטומטי)</div>
                )}
                {saveResults.failed > 0 && (
                  <div className="text-danger">{saveResults.failed} שגיאות — ראה את היומן</div>
                )}
              </div>
            )}
            <Button onClick={handleClose}>סגור</Button>
          </div>
        ) : (
          <>
            {/* Step 1: Tenant & Contract selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="דייר"
                options={tenantOptions}
                placeholder="בחר דייר..."
                value={selectedTenant}
                onChange={(e) => {
                  setSelectedTenant(e.target.value);
                  setSelectedContract("");
                }}
              />
              <Select
                label="חוזה"
                options={contractOptions}
                placeholder={selectedTenant ? "בחר חוזה..." : "בחר דייר תחילה"}
                value={selectedContract}
                onChange={(e) => setSelectedContract(e.target.value)}
                disabled={!selectedTenant}
              />
            </div>

            {/* Step 2: Image upload */}
            {scannedChecks.length === 0 && (
              <>
                <div
                  ref={dropZoneRef}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-600">גרור תמונות לכאן</p>
                  <p className="text-xs text-muted mt-1">או לחץ לבחירת קבצים</p>
                  <p className="text-xs text-muted mt-1">JPG, PNG, HEIC - ניתן לבחור מספר קבצים</p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/heic,image/heif"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />

                {/* Image previews */}
                {images.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">{images.length} תמונות נבחרו</p>
                    <div className="flex flex-wrap gap-3">
                      {images.map((img, i) => (
                        <div key={i} className="relative group">
                          <img
                            src={img.preview}
                            alt={`צ'ק ${i + 1}`}
                            className="w-24 h-24 object-cover rounded-lg border border-border"
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeImage(i);
                            }}
                            className="absolute -top-2 -right-2 bg-danger text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mobile camera button */}
                <div className="flex gap-3">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    className="flex-1"
                  >
                    <Camera className="w-4 h-4" />
                    בחר קבצים
                  </Button>
                  <Button
                    onClick={handleScan}
                    disabled={images.length === 0 || scanning}
                    isLoading={scanning}
                    className="flex-1"
                  >
                    {scanning ? "סורק..." : "סרוק עם AI"}
                  </Button>
                </div>
              </>
            )}

            {/* Scanning spinner */}
            {scanning && (
              <div className="flex flex-col items-center py-8 gap-3">
                <Spinner className="w-10 h-10" />
                <p className="text-sm text-muted">סורק צ'קים... אנא המתן</p>
              </div>
            )}

            {/* Step 3: Editable results table */}
            {scannedChecks.length > 0 && !scanning && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    נמצאו {scannedChecks.length} צ'קים - ניתן לערוך לפני שמירה
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setScannedChecks([]);
                      setImages([]);
                    }}
                  >
                    סרוק מחדש
                  </Button>
                </div>

                {/* Contract comparison */}
                {selectedContractData && (
                  <div className="bg-gray-50 rounded-lg p-3 text-sm flex flex-wrap gap-4">
                    <span>
                      צ'קים בחוזה: {existingChecks + newChecks}/{totalExpected}{" "}
                      {existingChecks + newChecks >= totalExpected ? (
                        <span className="text-success font-medium">&#10003;</span>
                      ) : (
                        <span className="text-danger font-medium">
                          (חסרים {totalExpected - existingChecks - newChecks})
                        </span>
                      )}
                    </span>
                  </div>
                )}

                <div className="overflow-x-auto -mx-6 px-6">
                  <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-gray-50 border-b border-border">
                        <th className="text-right px-3 py-2 font-medium text-muted">מס' צ'ק</th>
                        <th className="text-right px-3 py-2 font-medium text-muted">בנק</th>
                        <th className="text-right px-3 py-2 font-medium text-muted">סניף</th>
                        <th className="text-right px-3 py-2 font-medium text-muted">חשבון</th>
                        <th className="text-right px-3 py-2 font-medium text-muted">סכום</th>
                        <th className="text-right px-3 py-2 font-medium text-muted">תאריך פירעון</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {scannedChecks.map((check, i) => (
                        <tr key={i} className="border-b border-border">
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full border border-border rounded px-2 py-1 text-sm"
                              value={check.check_number || ""}
                              onChange={(e) => updateCheck(i, "check_number", e.target.value)}
                              dir="ltr"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full border border-border rounded px-2 py-1 text-sm"
                              value={check.bank_name || ""}
                              onChange={(e) => updateCheck(i, "bank_name", e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full border border-border rounded px-2 py-1 text-sm w-16"
                              value={check.branch_number || ""}
                              onChange={(e) => updateCheck(i, "branch_number", e.target.value)}
                              dir="ltr"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full border border-border rounded px-2 py-1 text-sm"
                              value={check.account_number || ""}
                              onChange={(e) => updateCheck(i, "account_number", e.target.value)}
                              dir="ltr"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full border border-border rounded px-2 py-1 text-sm w-24"
                              type="number"
                              value={check.amount || ""}
                              onChange={(e) =>
                                updateCheck(i, "amount", e.target.value ? Number(e.target.value) : null)
                              }
                              dir="ltr"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full border border-border rounded px-2 py-1 text-sm"
                              type="date"
                              value={check.due_date || ""}
                              onChange={(e) => updateCheck(i, "due_date", e.target.value)}
                              dir="ltr"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <button
                              onClick={() =>
                                setScannedChecks((prev) => prev.filter((_, idx) => idx !== i))
                              }
                              className="text-danger hover:text-red-700 p-1"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Save button */}
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={handleClose}>
                    ביטול
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={saving || !selectedTenant || !selectedContract}
                    isLoading={saving}
                  >
                    {saving ? "שומר..." : `שמור ${scannedChecks.length} צ'קים`}
                  </Button>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-danger text-sm bg-red-50 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
