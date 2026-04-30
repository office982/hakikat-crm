"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CreditCard, FileText, MessageCircle, RefreshCw, Plus } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import type { ActionLogRow } from "@/types/tenant-profile";

const typeConfig = {
  payment: { icon: CreditCard, color: "text-green-500 bg-green-50" },
  contract: { icon: FileText, color: "text-blue-500 bg-blue-50" },
  message: { icon: MessageCircle, color: "text-purple-500 bg-purple-50" },
  update: { icon: RefreshCw, color: "text-amber-500 bg-amber-50" },
};

const filterOptions = [
  { id: "all", label: "הכל" },
  { id: "payment", label: "תשלומים" },
  { id: "contract", label: "חוזה" },
  { id: "message", label: "הודעות" },
  { id: "update", label: "עדכונים" },
];

export function ActionLog({ logs }: { logs: MockActionLog[] }) {
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all" ? logs : logs.filter((l) => l.type === filter);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">יומן פעולות</h3>
        <Button variant="ghost" size="sm">
          <Plus className="w-4 h-4" />
          הוסף הערה
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {filterOptions.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setFilter(opt.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              filter === opt.id
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* AI Summary */}
      <div className="bg-accent rounded-lg p-3 mb-4 text-sm">
        <p className="font-medium text-primary mb-1">סיכום AI</p>
        <p className="text-gray-700">
          בחודש האחרון נרשמו {logs.filter((l) => l.type === "payment").length} תשלומים.
          {logs.some((l) => l.type === "message") && " נשלחו תזכורות בוואטסאפ."}
        </p>
      </div>

      {/* Log entries */}
      <div className="space-y-4">
        {filtered.map((log) => {
          const config = typeConfig[log.type];
          const Icon = config.icon;
          return (
            <div key={log.id} className="flex items-start gap-3">
              <div className={`p-2 rounded-lg shrink-0 ${config.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm">{log.description}</p>
                <div className="flex gap-2 mt-0.5 text-xs text-muted">
                  <span>{relativeTime(log.timestamp)}</span>
                  <span>·</span>
                  <span>{log.source === "manual" ? "ידני" : log.source === "whatsapp" ? "WhatsApp" : log.source === "easydo" ? "EasyDo" : "מערכת"}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
