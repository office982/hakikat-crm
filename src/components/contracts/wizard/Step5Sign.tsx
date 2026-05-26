"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Send, CheckCircle, Clock, FileText, AlertCircle, Copy, ExternalLink } from "lucide-react";
import type { ContractFormData } from "../ContractWizard";
import { renderContractHtml } from "@/lib/contract-render";
import { createTenantFolder, uploadAndShare } from "@/lib/api/onedrive";
import { CloudDestinationModal, type CloudDestination } from "../CloudDestinationModal";

interface Props {
  data: ContractFormData;
  onChange: (partial: Partial<ContractFormData>) => void;
}

export function Step5Sign({ data, onChange }: Props) {
  const [step, setStep] = useState<"idle" | "creating" | "uploading" | "sending" | "done" | "error">(
    data.contract_id ? (data.signing_status === "sent" ? "done" : "idle") : "idle"
  );
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lastDestination, setLastDestination] = useState<CloudDestination | null>(null);
  const [copied, setCopied] = useState(false);

  const copyFillUrl = async () => {
    if (!data.fill_url) return;
    try {
      await navigator.clipboard.writeText(data.fill_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (insecure context) — nothing to do.
    }
  };

  const runFlow = async (destination: CloudDestination) => {
    setError("");
    setPickerOpen(false);
    setLastDestination(destination);
    try {
      // 1. Create the contract record (if not already created)
      let contractId = data.contract_id;
      if (!contractId) {
        setStep("creating");
        const createRes = await fetch("/api/contracts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenant_id: data.tenant_id || undefined,
            tenant_full_name: data.full_name,
            tenant_id_number: data.id_number,
            tenant_phone: data.phone,
            tenant_whatsapp: data.whatsapp || data.phone,
            tenant_email: data.email,
            unit_id: data.unit_id || null,
            legal_entity_id: data.legal_entity_id,
            start_date: data.start_date,
            end_date: data.end_date,
            monthly_rent: data.monthly_rent,
            annual_increase_percent: data.annual_increase_percent,
            building_fee: data.building_fee,
            arnona: data.arnona,
            payment_method: data.payment_method,
            contract_text: data.contract_text,
            ai_instructions: data.ai_instructions,
          }),
        });

        const createJson = await createRes.json();
        if (!createRes.ok) throw new Error(createJson.error || "יצירת חוזה נכשלה");
        contractId = createJson.contract_id;
        onChange({ contract_id: contractId, tenant_id: createJson.tenant_id });
      }

      // 2. If destination = OneDrive, upload archive copy client-side.
      // Google Drive archiving is handled server-side (single configured account).
      let uploadedUrl: string | undefined;
      if (destination === "onedrive") {
        setStep("uploading");
        const html = renderContractHtml({
          title: `חוזה שכירות — ${data.full_name}`,
          body: data.contract_text,
          signerName: data.full_name,
          signerId: data.id_number,
        });
        const blob = new Blob([html], { type: "text/html" });
        const folder = await createTenantFolder(data.full_name);
        const fileName = `חוזה_${data.full_name}_${new Date().toISOString().split("T")[0]}.html`;
        const { url } = await uploadAndShare(folder.id, fileName, blob);
        uploadedUrl = url;
      }

      // 3. Send to EasyDo (server renders PDF + uploads it; ignores uploaded_url)
      setStep("sending");
      const sendRes = await fetch(`/api/contracts/${contractId}/send-for-signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contract_text: data.contract_text,
          destination,
          uploaded_url: uploadedUrl,
        }),
      });

      const sendJson = await sendRes.json();
      if (!sendRes.ok) throw new Error(sendJson.error || "שליחה לחתימה נכשלה");

      onChange({
        signing_status: "sent",
        easydo_document_id: sendJson.document_id,
        contract_pdf_url: sendJson.document_url,
        fill_url: sendJson.fill_url ?? undefined,
      });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
      setStep("error");
    }
  };

  const isWorking = step === "creating" || step === "uploading" || step === "sending";

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">שלב 5 — חתימה ושליחה</h2>

      <Card>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-primary" />
            <div>
              <p className="font-medium">חוזה מוכן לשליחה</p>
              <p className="text-sm text-muted">
                החוזה יישמר במערכת ויישלח לחתימה דיגיטלית דרך EasyDo
              </p>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium mb-2">פרטי שליחה:</p>
            <ul className="text-sm text-muted space-y-1">
              <li>דייר: <span className="text-gray-900">{data.full_name}</span></li>
              <li>טלפון: <span className="text-gray-900" dir="ltr">{data.phone}</span></li>
              {data.email && <li>אימייל: <span className="text-gray-900" dir="ltr">{data.email}</span></li>}
              <li>יחידה: <span className="text-gray-900">{data.unit_name} — {data.property_name}</span></li>
            </ul>
          </div>

          {/* Status indicator */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm font-medium">סטטוס חתימה:</span>
              {data.signing_status === "pending" && (
                <Badge variant="default">ממתין לשליחה</Badge>
              )}
              {data.signing_status === "sent" && (
                <Badge variant="warning">נשלח — ממתין לחתימה</Badge>
              )}
              {data.signing_status === "signed" && (
                <Badge variant="success">נחתם</Badge>
              )}
            </div>

            {step === "creating" && (
              <p className="text-sm text-muted">⏳ יוצר רשומת חוזה במערכת...</p>
            )}
            {step === "uploading" && (
              <p className="text-sm text-muted">⏳ מעלה ל-OneDrive...</p>
            )}
            {step === "sending" && (
              <p className="text-sm text-muted">⏳ שולח ל-EasyDo...</p>
            )}

            {data.signing_status === "sent" && step !== "sending" && (
              <div className="bg-warning-light rounded-lg p-4 text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-warning" />
                  <span className="font-medium">ממתין לחתימת הדייר</span>
                </div>
                <p className="text-muted"> מייל נשלח לדייר עם קישור לחתימה.</p>

                {data.fill_url && (
                  <div className="mt-3 border-t border-warning/30 pt-3">
                    <p className="text-xs text-muted mb-2">
                      אם הדייר לא קיבל את המייל — אפשר לשלוח לו את הקישור הזה ידנית:
                    </p>
                    <div className="flex items-center gap-2 bg-white rounded border border-warning/40 p-2">
                      <input
                        type="text"
                        readOnly
                        value={data.fill_url}
                        dir="ltr"
                        className="flex-1 bg-transparent text-xs text-gray-700 outline-none truncate"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button
                        type="button"
                        onClick={copyFillUrl}
                        className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-primary text-white hover:bg-primary/90"
                      >
                        <Copy className="w-3 h-3" />
                        {copied ? "הועתק" : "העתק"}
                      </button>
                      <a
                        href={data.fill_url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-primary text-primary hover:bg-primary/10"
                      >
                        <ExternalLink className="w-3 h-3" />
                        פתח
                      </a>
                    </div>
                  </div>
                )}

                {data.contract_pdf_url && (
                  <p className="mt-2">
                    <a href={data.contract_pdf_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      צפה בחוזה
                    </a>
                  </p>
                )}
              </div>
            )}

            {data.signing_status === "signed" && (
              <div className="bg-success-light rounded-lg p-4 text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-success" />
                  <span className="font-medium">החוזה נחתם בהצלחה!</span>
                </div>
                <ul className="text-muted space-y-1 mt-2">
                  <li>✓ תיק דייר נפתח אוטומטית</li>
                  <li>✓ PDF נשמר ב-{lastDestination === "onedrive" ? "OneDrive" : "Google Drive"}</li>
                  <li>✓ לוח תשלומים נוצר</li>
                  <li>✓ יחידה סומנה כמאוכלסת</li>
                </ul>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 text-danger rounded-lg p-3 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {data.signing_status === "pending" && (
            <Button
              onClick={() => setPickerOpen(true)}
              isLoading={isWorking}
              className="w-full"
              size="lg"
            >
              <Send className="w-5 h-5" />
              שלח לחתימה דיגיטלית
            </Button>
          )}
        </div>
      </Card>

      <CloudDestinationModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={runFlow}
        title="בחירת יעד אחסון לחוזה"
        confirmLabel="שלח לחתימה"
      />
    </div>
  );
}
