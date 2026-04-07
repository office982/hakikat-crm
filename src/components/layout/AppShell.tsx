"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

const pageTitles: Record<string, string> = {
  "/": "לוח בקרה",
  "/properties": "נכסים",
  "/tenants": "דיירים",
  "/payments": "תשלומים",
  "/checks": "צ׳קים",
  "/contracts": "חוזים",
  "/reports": "דוחות",
  "/projects": "פרויקטים",
  "/alerts": "התראות",
  "/ai-chat": "סוכן AI",
  "/settings": "הגדרות",
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  for (const [path, title] of Object.entries(pageTitles)) {
    if (path !== "/" && pathname.startsWith(path)) return title;
  }
  return "קבוצת חקיקת";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <div className="flex min-h-screen">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        <TopBar title={title} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
