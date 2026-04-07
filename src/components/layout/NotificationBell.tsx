"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useUnreadCount } from "@/hooks/useNotifications";

export function NotificationBell() {
  const { data: unreadCount = 0 } = useUnreadCount();

  return (
    <Link
      href="/alerts"
      className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
    >
      <Bell className="w-5 h-5 text-gray-600" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -left-0.5 bg-danger text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
