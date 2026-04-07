import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Notification } from "@/types/database";

export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: ["notifications", unreadOnly],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return [];

      let query = supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (unreadOnly) query = query.eq("is_read", false);

      const { data, error } = await query;
      if (error) throw error;
      return data as Notification[];
    },
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ["notifications_count"],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return 0;

      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("is_read", false);

      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications_count"] });
    },
  });
}
