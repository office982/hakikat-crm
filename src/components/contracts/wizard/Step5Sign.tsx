"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Send, CheckCircle, Clock, FileText, AlertCircle, Cloud, HardDrive } from "lucide-react";
import type { ContractFormData } from "../ContractWizard";
import { renderContractHtml } from "@/lib/contract-render";
import {
  isSignedIn as isOneDriveSignedIn,
  signIn as oneDriveSignIn,
  createTenantFolder,
  uploadAndShare,
} from "@/lib/api/onedrive";

interface Props {
  data: ContractFormData;
  onChange: (partial: Partial<ContractFormData>) => void;
}

type Destination = "google_drive" | "onedrive";

export function Step5Sign({ data, onChange }: Props) {
  const [step, setStep] = useState<"idle" | "creating" | "uploading" | "sending" | "done" | "error">(
    data.contract_id ? (data.signing_status === "sent" ? "done" : "idle") : "idle"
  );
  const [error, setError] = useState("");
  const [destination, setDestination] = useState<Destination>("google_drive");

  const handleSendForSignature = async () => {
    setError("");
    try {
      // 1. Create the contract record (if not already created)
      let contractId = data.contract_id;
      if (!contractId) {
        setStep("creating");
        const createRes = await fetch("/api/contracts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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

      // 2. If destination = OneDrive, upload client-side and pass URL
      let uploadedUrl: string | undefined;
      if (destination === "onedrive") {
        setStep("uploading");
        if (!isOneDriveSignedIn()) {
          await oneDriveSignIn();
        }
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

      // 3. Send to EasyDo
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

          {/* Destination selector */}
          {data.signing_status === "pending" && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium mb-2">יעד אחסון לחוזה:</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDestination("google_drive")}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-colors ${
                    destination === "google_drive"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:bg-gray-50"
                  }`}
                >
                  <HardDrive className="w-4 h-4" />
                  Google Drive
                </button>
                <button
                  type="button"
                  onClick={() => setDestination("onedrive")}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-colors ${
                    destination === "onedrive"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:bg-gray-50"
                  }`}
                >
                  <Cloud className="w-4 h-4" />
                  OneDrive
                </button>
              </div>
              {destination === "onedrive" && !isOneDriveSignedIn() && (
                <p className="text-xs text-warning mt-2">⚠ תידרש להתחבר ל-OneDrive בלחיצה על השליחה.</p>
              )}
            </div>
          )}

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
                <p className="text-muted">הודעת WhatsApp נשלחה לדייר עם קישור לחתימה.</p>
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
                  <li>✓ PDF נשמר ב-{destination === "onedrive" ? "OneDrive" : "Google Drive"}</li>
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
              onClick={handleSendForSignature}
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
    </div>
  );
}
