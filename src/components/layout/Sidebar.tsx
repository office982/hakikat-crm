"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, CreditCard, FileCheck,
  FileText, BarChart3, FolderKanban, Settings, X,
  Building2, Bell, MessageCircle, Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "לוח בקרה", icon: LayoutDashboard },
  { href: "/properties", label: "נכסים", icon: Building2 },
  { href: "/tenants", label: "דיירים", icon: Users },
  { href: "/payments", label: "תשלומים", icon: CreditCard },
  { href: "/checks", label: "צ׳קים", icon: FileCheck },
  { href: "/contracts", label: "חוזים", icon: FileText },
  { href: "/reports", label: "דוחות", icon: BarChart3 },
  { href: "/projects", label: "פרויקטים", icon: FolderKanban },
  { href: "/suppliers", label: "ספקים", icon: Truck },
  { href: "/alerts", label: "התראות", icon: Bell },
  { href: "/ai-chat", label: "סוכן AI", icon: MessageCircle },
  { href: "/settings", label: "הגדרות", icon: Settings },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={onClose} />
      )}

      <aside
        className={cn(
          "fixed md:static inset-y-0 right-0 z-50 w-64 bg-primary text-white min-h-screen flex flex-col shrink-0 transition-transform duration-200",
          "md:translate-x-0",
          isOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"
        )}
      >
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">קבוצת חקיקת</h1>
            <p className="text-sm text-blue-200 mt-1">ניהול נדל&quot;ן מניב</p>
          </div>
          <button onClick={onClose} className="md:hidden p-1 rounded-lg hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-white/20 text-white"
                    : "text-blue-100 hover:bg-white/10 hover:text-white"
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 text-xs text-blue-300">
          v1.0 · מערכת ניהול נדל&quot;ן מניב
        </div>
      </aside>
    </>
  );
}
