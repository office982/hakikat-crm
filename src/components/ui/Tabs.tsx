"use client";

import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  return (
    <div className={cn("flex gap-1 border-b border-border", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
            activeTab === tab.id
              ? "border-primary text-primary"
              : "border-transparent text-muted hover:text-gray-700 hover:border-gray-300"
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="mr-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
