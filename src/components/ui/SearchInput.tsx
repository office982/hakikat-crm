"use client";

import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = "חיפוש...", className }: SearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border pr-10 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-gray-400"
      />
    </div>
  );
}
