import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/providers/AuthProvider";
import { supabase } from "@/lib/supabase";

export type NotificationKind = "checkin" | "message" | "dose" | "cycle";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

/** Reads the signed-in user's notification feed and exposes read helpers. */
export function useNotifications() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["notifications", userId],
    enabled: userId !== null,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, kind, title, body, link, is_read, created_at")
        .eq("recipient_user_id", userId as string)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
  });

  const items = listQuery.data ?? [];
  const unreadCount = items.filter((n) => !n.is_read).length;

  const markRead = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async (): Promise<void> => {
      if (userId === null) return;
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("recipient_user_id", userId)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    },
  });

  return {
    items,
    unreadCount,
    isLoading: listQuery.isLoading,
    markRead,
    markAllRead,
  };
}

/** Inserts a notification for another user; failures stay silent by design. */
export async function pushNotification(input: {
  recipientUserId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("notifications").insert({
    recipient_user_id: input.recipientUserId,
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
  });
  if (error) console.log("[notifications] insert failed:", error.message);
}
