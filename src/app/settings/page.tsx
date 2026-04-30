"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { Save, TestTube, Building2, Link2, FileText, Bell, Briefcase } from "lucide-react";
import { useLegalEntities } from "@/hooks/useProperties";
import { LegalEntityFormModal } from "@/components/properties/LegalEntityFormModal";
import type { LegalEntity } from "@/types/database";

const tabs = [
  { id: "properties", label: "נכסים ויחידות" },
  { id: "integrations", label: "חיבורים חיצוניים" },
  { id: "templates", label: "תבניות" },
  { id: "alerts", label: "התראות" },
  { id: "business", label: "פרטי עסק" },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("integrations");

  return (
    <div className="space-y-4">
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "properties" && <PropertiesSection />}
      {activeTab === "integrations" && <IntegrationsSection />}
      {activeTab === "templates" && <TemplatesSection />}
      {activeTab === "alerts" && <AlertsSection />}
      {activeTab === "business" && <BusinessSection />}
    </div>
  );
}

function PropertiesSection() {
  const { data: entities = [], isLoading } = useLegalEntities();
  const [editing, setEditing] = useState<LegalEntity | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Building2 className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">ניהול נכסים ויחידות</h3>
      </div>
      <p className="text-sm text-muted mb-4">ניהול ישויות משפטיות, מתחמים, נכסים ויחידות.</p>
      <div className="space-y-3">
        {isLoading && <p className="text-sm text-muted">טוען...</p>}
        {!isLoading && entities.length === 0 && (
          <p className="text-sm text-muted">אין ישויות משפטיות עדיין.</p>
        )}
        {entities.map((entity) => (
          <div key={entity.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="font-medium">{entity.name}</span>
            <Button variant="ghost" size="sm" onClick={() => setEditing(entity)}>
              ערוך
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
          + הוסף ישות משפטית
        </Button>
      </div>

      <LegalEntityFormModal
        isOpen={!!editing || creating}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        entity={editing}
      />
    </Card>
  );
}

function IntegrationsSection() {
  const integrations = [
    { name: "WATI (WhatsApp)", fields: ["API Key", "Base URL", "מספר WhatsApp"], env: ["WATI_API_KEY", "WATI_BASE_URL"] },
    { name: "iCount (חשבוניות)", fields: ["API Key", "Company ID"], env: ["ICOUNT_COMPANY_ID"] },
    { name: "Google Drive", fields: ["Client ID", "Client Secret", "תיקיית בסיס"], env: ["GOOGLE_CLIENT_ID"] },
    { name: "EasyDo (חתימות)", fields: ["API Key"], env: ["EASYDO_API_KEY"] },
    { name: "Claude API", fields: ["API Key"], env: ["ANTHROPIC_API_KEY"] },
  ];

  return (
    <div className="space-y-4">
      {integrations.map((integration) => (
        <Card key={integration.name}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">{integration.name}</h3>
            </div>
            <Badge variant="default">לא מחובר</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {integration.fields.map((field) => (
              <Input key={field} label={field} type="password" placeholder="••••••••" />
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <Button size="sm"><Save className="w-4 h-4" />שמור</Button>
            <Button variant="outline" size="sm"><TestTube className="w-4 h-4" />בדוק חיבור</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function TemplatesSection() {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">תבניות</h3>
      </div>
      <div className="text-center py-8 text-muted">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">ניהול תבניות עדיין לא זמין.</p>
      </div>
    </Card>
  );
}

function AlertsSection() {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Bell className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">הגדרות התראות</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="התראה ראשונה לפני פקיעת חוזה (ימים)" type="number" defaultValue="45" />
        <Input label="התראה שנייה לפני פקיעת חוזה (ימים)" type="number" defaultValue="30" />
        <Input label="יום בחודש לתשלום" type="number" defaultValue="10" hint="התראה תיווצר אם לא שולם עד תאריך זה" />
        <Input label="ימים לפני פירעון צ׳ק להתראה" type="number" defaultValue="7" />
        <Input label="ימים לחשבונית ספק לא שולמה" type="number" defaultValue="30" />
      </div>
      <Button size="sm" className="mt-4"><Save className="w-4 h-4" />שמור הגדרות</Button>
    </Card>
  );
}

function BusinessSection() {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Briefcase className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">פרטי עסק</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="שם העסק" defaultValue="קבוצת חקיקת" />
        <Input label="מספר עוסק מורשה" placeholder="..." />
        <Input label="כתובת" placeholder="..." />
        <Input label="טלפון" placeholder="..." dir="ltr" />
        <Input label="אימייל" placeholder="..." dir="ltr" />
      </div>
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">לוגו</label>
        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
          <p className="text-sm text-muted">גרור לוגו לכאן או לחץ להעלאה</p>
        </div>
      </div>
      <Button size="sm" className="mt-4"><Save className="w-4 h-4" />שמור</Button>
    </Card>
  );
}
