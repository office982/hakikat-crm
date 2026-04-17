"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useLegalEntities } from "@/hooks/useProperties";
import {
  useCreateProject,
  useUpdateProject,
  type ProjectInput,
} from "@/hooks/useProjects";
import type { Project } from "@/types/database";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  project?: Project | null;
}

const STATUS_OPTIONS = [
  { value: "planning", label: "בתכנון" },
  { value: "active", label: "פעיל" },
  { value: "completed", label: "הושלם" },
];

const EMPTY: ProjectInput = {
  name: "",
  legal_entity_id: "",
  address: "",
  description: "",
  total_budget: 0,
  status: "planning",
  start_date: "",
  end_date: "",
};

export function ProjectFormModal({ isOpen, onClose, project }: Props) {
  const [form, setForm] = useState<ProjectInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const { data: entities = [] } = useLegalEntities();
  const createMut = useCreateProject();
  const updateMut = useUpdateProject();

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name,
        legal_entity_id: project.legal_entity_id,
        address: project.address ?? "",
        description: project.description ?? "",
        total_budget: project.total_budget,
        status: project.status,
        start_date: project.start_date ?? "",
        end_date: project.end_date ?? "",
      });
    } else {
      setForm(EMPTY);
    }
    setError(null);
  }, [project, isOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("שם פרויקט חובה.");
      return;
    }
    if (!form.legal_entity_id) {
      setError("יש לבחור ישות משפטית.");
      return;
    }

    try {
      if (project) {
        await updateMut.mutateAsync({ id: project.id, ...form });
      } else {
        await createMut.mutateAsync(form);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה.");
    }
  };

  const isLoading = createMut.isPending || updateMut.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={project ? "עריכת פרויקט" : "פרויקט חדש"}
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="שם פרויקט"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="למשל: שיפוץ כלבייה 1"
        />

        <Select
          label="ישות משפטית"
          placeholder="בחר ישות"
          value={form.legal_entity_id}
          onChange={(e) => setForm({ ...form, legal_entity_id: e.target.value })}
          options={entities.map((e) => ({ value: e.id, label: e.name }))}
        />

        <Input
          label="כתובת"
          value={form.address ?? ""}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />

        <Input
          label="תיאור"
          value={form.description ?? ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="תקציב (₪)"
            type="number"
            min={0}
            value={form.total_budget ?? 0}
            onChange={(e) =>
              setForm({ ...form, total_budget: Number(e.target.value) || 0 })
            }
          />
          <Select
            label="סטטוס"
            value={form.status}
            onChange={(e) =>
              setForm({
                ...form,
                status: e.target.value as ProjectInput["status"],
              })
            }
            options={STATUS_OPTIONS}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="תאריך התחלה"
            type="date"
            value={form.start_date ?? ""}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
          <Input
            label="תאריך סיום"
            type="date"
            value={form.end_date ?? ""}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button type="submit" isLoading={isLoading}>
            {project ? "שמור שינויים" : "צור פרויקט"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
