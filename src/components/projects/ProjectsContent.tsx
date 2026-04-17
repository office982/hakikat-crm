"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Plus, FolderKanban, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useProjects, useDeleteProject } from "@/hooks/useProjects";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import type { Project } from "@/types/database";

const statusLabels: Record<string, { label: string; variant: "success" | "warning" | "default" }> = {
  active: { label: "פעיל", variant: "success" },
  planning: { label: "בתכנון", variant: "warning" },
  completed: { label: "הושלם", variant: "default" },
};

export function ProjectsContent() {
  const { data: projects, isLoading } = useProjects();
  const deleteMut = useDeleteProject();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (p: Project) => {
    setEditing(p);
    setFormOpen(true);
  };

  const remove = async (p: Project) => {
    if (!confirm(`למחוק את הפרויקט "${p.name}"?`)) return;
    try {
      await deleteMut.mutateAsync(p.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "מחיקה נכשלה.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted">
          {isLoading ? "טוען..." : `${projects?.length ?? 0} פרויקטים`}
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4" />פרויקט חדש
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted">טוען פרויקטים...</div>
      ) : !projects || projects.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-muted">
            <FolderKanban className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-lg font-medium mb-1">אין פרויקטים</p>
            <p className="text-sm">צור פרויקט חדש כדי להתחיל</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((project) => {
            const budget = project.total_budget || 0;
            const spent = project.spent || 0;
            const percent = budget > 0 ? Math.round((spent / budget) * 100) : 0;
            const remaining = budget - spent;
            const s = statusLabels[project.status] || statusLabels.active;
            const entityName = project.legal_entity?.name || "";

            return (
              <Card key={project.id}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <FolderKanban className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold">{project.name}</h3>
                    </div>
                    <p className="text-xs text-muted">{entityName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={s.variant}>{s.label}</Badge>
                    <button
                      onClick={() => openEdit(project)}
                      className="p-1 rounded hover:bg-gray-100 text-muted"
                      aria-label="ערוך"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => remove(project)}
                      className="p-1 rounded hover:bg-red-50 text-danger"
                      aria-label="מחק"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted">תקציב: {formatCurrency(budget)}</span>
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
                  <span className="text-muted">הוצאות: <span className="font-medium text-gray-900" dir="ltr">{formatCurrency(spent)}</span></span>
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
      )}

      <ProjectFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        project={editing}
      />
    </div>
  );
}
