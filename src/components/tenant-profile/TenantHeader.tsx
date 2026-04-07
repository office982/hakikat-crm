"use client";

import { Badge, ContractStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CreditCard, MessageCircle, FileText, ArrowRight } from "lucide-react";
import Link from "next/link";
import { daysUntil } from "@/lib/utils";
import type { MockTenantDetail } from "@/lib/mock-data";

interface TenantHeaderProps {
  tenant: MockTenantDetail;
  onRecordPayment: () => void;
}

export function TenantHeader({ tenant, onRecordPayment }: TenantHeaderProps) {
  const days = daysUntil(tenant.contract.end_date);

  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/tenants" className="p-1 rounded-lg hover:bg-gray-100">
              <ArrowRight className="w-5 h-5 text-muted" />
            </Link>
            <h1 className="text-2xl font-bold">{tenant.full_name}</h1>
            <ContractStatusBadge status={tenant.contract.status} />
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted">
            <span>{tenant.unit} · {tenant.property}</span>
            <span>{tenant.entity}</span>
            <span>
              {days > 0
                ? `${days} ימים לסיום חוזה`
                : "חוזה פג תוקף"}
            </span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={onRecordPayment}>
            <CreditCard className="w-4 h-4" />
            רשום תשלום
          </Button>
          <Button variant="outline" size="sm">
            <MessageCircle className="w-4 h-4" />
            שלח WhatsApp
          </Button>
          <Button variant="outline" size="sm">
            <FileText className="w-4 h-4" />
            הנפק מסמך
          </Button>
        </div>
      </div>
    </div>
  );
}
