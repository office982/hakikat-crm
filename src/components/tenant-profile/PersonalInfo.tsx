"use client";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { User, Phone, Mail, MapPin, Hash } from "lucide-react";
import type { MockTenantDetail } from "@/lib/mock-data";

export function PersonalInfo({ tenant }: { tenant: MockTenantDetail }) {
  return (
    <Card>
      <h3 className="text-lg font-semibold mb-4">פרטים אישיים</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <InfoRow icon={User} label="שם מלא" value={tenant.full_name} />
        <InfoRow icon={Hash} label="תעודת זהות" value={tenant.id_number} />
        <InfoRow icon={Phone} label="טלפון" value={tenant.phone} dir="ltr" />
        <InfoRow icon={Phone} label="WhatsApp" value={tenant.whatsapp} dir="ltr" />
        <InfoRow icon={Mail} label="אימייל" value={tenant.email || "לא הוזן"} dir="ltr" />
        <InfoRow icon={MapPin} label="יחידה" value={`${tenant.unit} · ${tenant.property}`} />
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">סוג:</span>
          <Badge variant={tenant.unit_type === "commercial" ? "info" : "success"}>
            {tenant.unit_type === "commercial" ? "עסקי" : "מגורים"}
          </Badge>
        </div>
        {tenant.floor !== null && (
          <InfoRow icon={MapPin} label="קומה" value={String(tenant.floor)} />
        )}
      </div>
      {tenant.notes && (
        <div className="mt-6 pt-4 border-t border-border">
          <p className="text-sm text-muted mb-1">הערות</p>
          <p className="text-sm">{tenant.notes || "אין הערות"}</p>
        </div>
      )}
    </Card>
  );
}

function InfoRow({ icon: Icon, label, value, dir }: { icon: typeof User; label: string; value: string; dir?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-muted shrink-0" />
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="text-sm font-medium" dir={dir}>{value}</p>
      </div>
    </div>
  );
}
