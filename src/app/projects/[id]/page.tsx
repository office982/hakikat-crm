"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PageSpinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Plus, ArrowRight, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import {
  useProject,
  useProjectExpenses,
  useDeleteProjectExpense,
  useMarkExpensePaid,
} from "@/hooks/useProjects";
import { ProjectExpenseFormModal } from "@/components/projects/ProjectExpenseFormModal";
import type { ProjectExpense } from "@/types/database";

const statusMap: Record<string, { label: string; variant: "success" | "danger" | "warning" }> = {
  paid: { label: "שולם", variant: "success" },
  unpaid: { label: "לא שולם", variant: "danger" },
  partial: { label: "חלקי", variant: "warning" },
};

const projectStatusMap: Record<string, { label: string; variant: "success" | "warning" | "default" }> = {
  active: { label: "פעיל", variant: "success" },
  planning: { label: "בתכנון", variant: "warning" },
  completed: { label: "הושלם", variant: "default" },
};

export default function ProjectDetailPage() {
  const params = useParams();
  const id = String(params?.id || "");
  const { data: project, isLoading: projectLoading } = useProject(id);
  const { data: expenses = [], isLoading: expensesLoading } = useProjectExpenses(id);
  const deleteMut = useDeleteProjectExpense();
  const markPaidMut = useMarkExpensePaid();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectExpense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectExpense | null>(null);

  if (projectLoading || expensesLoading) return <PageSpinner />;
  if (!project) {
    return (
      <div className="space-y-6">
        <Link href="/projects" className="text-sm text-primary hover:underline">
          ← חזרה לפרויקטים
        </Link>
        <Card>
          <p className="text-center text-muted py-12">פרויקט לא נמצא</p>
        </Card>
      </div>
    );
  }

  const totalBudget = Number(project.total_budget || 0);
  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const remaining = totalBudget - totalSpent;
  const percent = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const projStatus = projectStatusMap[project.status] || projectStatusMap.active;

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (e: ProjectExpense) => {
    setEditing(e);
    setFormOpen(true);
  };
  const togglePaid = async (e: ProjectExpense) => {
    await markPaidMut.mutateAsync({
      id: e.id,
      project_id: e.project_id,
      paid: e.status !== "paid",
    });
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteMut.mutateAsync({ id: deleteTarget.id, project_id: deleteTarget.project_id });
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/projects" className="p-1 rounded-lg hover:bg-gray-100">
          <ArrowRight className="w-5 h-5 text-muted" />
        </Link>
        <h1 className="text-xl font-bold">{project.name}</h1>
        <Badge variant={projStatus.variant}>{projStatus.label}</Badge>
        {project.address && <span className="text-sm text-muted">· {project.address}</span>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <p className="text-xs text-muted mb-1">תקציב כולל</p>
          <p className="text-xl font-bold" dir="ltr">{formatCurrency(totalBudget)}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted mb-1">הוצאה בפועל</p>
          <p className="text-xl font-bold text-primary" dir="ltr">{formatCurrency(totalSpent)}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted mb-1">נותר</p>
          <p className={cn("text-xl font-bold", remaining >= 0 ? "text-success" : "text-danger")} dir="ltr">
            {formatCurrency(remaining)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-muted mb-1">% ניצול</p>
          <p className={cn("text-xl font-bold", percent > 90 ? "text-danger" : percent > 70 ? "text-warning" : "text-success")}>
            {percent}%
          </p>
          <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
            <div
              className={cn("h-2 rounded-full", percent > 90 ? "bg-danger" : percent > 70 ? "bg-warning" : "bg-success")}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
        </Card>
      </div>

      <Card noPadding>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-semibold">הוצאות לפי ספק</h3>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4" />הוסף הוצאה
          </Button>
        </div>
        {expenses.length === 0 ? (
          <div className="px-4 py-12 text-center text-muted text-sm">
            אין הוצאות בפרויקט. לחץ "הוסף הוצאה" כדי להתחיל.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50">
                  <th className="text-right px-4 py-3 font-medium text-muted">ספק</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">תיאור</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">סכום</th>
                  <th className="text-right px-4 py-3 font-medium text-muted hidden md:table-cell">תאריך חשבונית</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">סטטוס</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => {
                  const s = statusMap[expense.status] || statusMap.unpaid;
                  const supplierName =
                    (expense as ProjectExpense & { supplier?: { name: string } | null }).supplier?.name ||
                    expense.supplier_name ||
                    "ספק לא ידוע";
                  return (
                    <tr key={expense.id} className="border-b border-border hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{supplierName}</td>
                      <td className="px-4 py-3 text-muted">{expense.description || "—"}</td>
                      <td className="px-4 py-3 font-medium" dir="ltr">{formatCurrency(Number(expense.amount))}</td>
                      <td className="px-4 py-3 text-muted hidden md:table-cell">
                        {expense.invoice_date ? formatDate(expense.invoice_date) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {expense.status !== "paid" && (
                            <button
                              onClick={() => togglePaid(expense)}
                              className="text-xs text-primary font-medium hover:underline"
                            >
                              סמן כשולם
                            </button>
                          )}
                          <button
                            onClick={() => openEdit(expense)}
                            className="p-1 rounded hover:bg-gray-100 text-muted"
                            aria-label="ערוך"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(expense)}
                            className="p-1 rounded hover:bg-red-50 text-danger"
                            aria-label="מחק"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ProjectExpenseFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        projectId={id}
        expense={editing}
      />
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="מחיקת הוצאה"
        message={
          deleteTarget
            ? `למחוק את ההוצאה ${deleteTarget.supplier_name || ""} (₪${Number(deleteTarget.amount).toLocaleString()})?`
            : ""
        }
        variant="danger"
        confirmText="מחק"
        isLoading={deleteMut.isPending}
      />
    </div>
  );
}
