"use client";

import { Menu } from "lucide-react";
import { NotificationBell } from "./NotificationBell";

interface TopBarProps {
  title: string;
  onMenuClick: () => void;
}

export function TopBar({ title, onMenuClick }: TopBarProps) {
  return (
    <header className="bg-surface border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
      </div>
      <div className="flex items-center gap-4">
        <NotificationBell />
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-medium">
            מ
          </div>
          <span className="text-sm font-medium text-gray-700 hidden sm:block">מנהל</span>
        </div>
      </div>
    </header>
  );
}
