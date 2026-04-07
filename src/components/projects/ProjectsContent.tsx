"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Plus, FolderKanban } from "lucide-react";
import Link from "next/link";

const mockProjects = [
  { id: "p1", name: "שיפוץ כלבייה 1", entity: "חקיקת נכסים", status: "active", budget: 250000, spent: 185000, unpaid_invoices: 3 },
  { id: "p2", name: "בניית חנויות חדשות", entity: "חקיקת נכסים", status: "planning", budget: 500000, spent: 12000, unpaid_invoices: 1 },
  { id: "p3", name: "שיפוץ הרצל 48", entity: 'שיא הכרמל מדור בע"מ', status: "active", budget: 180000, spent: 95000, unpaid_invoices: 2 },
  { id: "p4", name: "איטום גג הדקלים", entity: 'נכסי המושבה בע"מ', status: "completed", budget: 45000, spent: 43500, unpaid_invoices: 0 },
];

const statusLabels: Record<string, { label: string; variant: "success" | "warning" | "default" }> = {
  active: { label: "פעיל", variant: "success" },
  planning: { label: "בתכנון", variant: "warning" },
  completed: { label: "הושלם", variant: "default" },
};

export function ProjectsContent() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted">{mockProjects.length} פרויקטים</div>
        <Button size="sm"><Plus className="w-4 h-4" />פרויקט חדש</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mockProjects.map((project) => {
          const percent = Math.round((project.spent / project.budget) * 100);
          const remaining = project.budget - project.spent;
          const s = statusLabels[project.status];

          return (
            <Card key={project.id}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <FolderKanban className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold">{project.name}</h3>
                  </div>
                  <p className="text-xs text-muted">{project.entity}</p>
                </div>
                <Badge variant={s.variant}>{s.label}</Badge>
              </div>

              {/* Budget Progress */}
              <div className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted">תקציב: {formatCurrency(project.budget)}</span>
                  <span className={cn("font-medium", percent > 90 ? "text-danger" : percent > 70 ? "text-warning" : "text-success")}>
                    {percent}%
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className={cn(
                      "h-2.5 rounded-full transition-all",
                      percent > 90 ? "bg-danger" : percent > 70 ? "bg-warning" : "bg-success"
                    )}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                  />
                </div>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted">הוצאות: <span className="font-medium text-gray-900" dir="ltr">{formatCurrency(project.spent)}</span></span>
                <span className="text-muted">נותר: <span className="font-medium text-gray-900" dir="ltr">{formatCurrency(remaining)}</span></span>
              </div>

              {project.unpaid_invoices > 0 && (
                <div className="mt-2 text-xs text-danger">
                  {project.unpaid_invoices} חשבוניות לא שולמו
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-border">
                <Link href={`/projects/${project.id}`} className="text-sm text-primary font-medium hover:underline">
                  פתח פרויקט
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
