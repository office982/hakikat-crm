"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Send, CheckCircle, Clock, FileText } from "lucide-react";
import type { ContractFormData } from "../ContractWizard";

interface Props {
  data: ContractFormData;
  onChange: (partial: Partial<ContractFormData>) => void;
}

export function Step5Sign({ data, onChange }: Props) {
  const [isSending, setIsSending] = useState(false);

  const handleSendForSignature = async () => {
    setIsSending(true);
    // TODO: Call EasyDo API to send for signature
    // TODO: Send WhatsApp notification to tenant
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulate API call
    onChange({ signing_status: "sent" });
    setIsSending(false);
  };

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
                החוזה ייווצר כ-PDF ויישלח לחתימה דיגיטלית דרך EasyDo
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

            {/* Action items that happen after signing */}
            {data.signing_status === "sent" && (
              <div className="bg-warning-light rounded-lg p-4 text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-warning" />
                  <span className="font-medium">ממתין לחתימת הדייר</span>
                </div>
                <p className="text-muted">הודעת WhatsApp נשלחה לדייר עם קישור לחתימה.</p>
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
                  <li>✓ PDF נשמר ב-Google Drive</li>
                  <li>✓ לוח תשלומים נוצר</li>
                  <li>✓ יחידה סומנה כמאוכלסת</li>
                </ul>
              </div>
            )}
          </div>

          {data.signing_status === "pending" && (
            <Button
              onClick={handleSendForSignature}
              isLoading={isSending}
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
