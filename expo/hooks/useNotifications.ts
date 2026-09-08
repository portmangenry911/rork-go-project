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

export interface DoctorContact {
  /** doctor_profiles.id — used to look up doctor_notification_settings. */
  doctorProfileId: string;
  /** auth user id — used as the notification recipient. */
  userId: string;
}

/** Resolves a patient's active doctor (profile id + auth user id), or null. */
export async function getDoctorUserIdForPatient(
  patientId: string,
): Promise<DoctorContact | null> {
  const { data, error } = await supabase
    .from("doctor_patient_relations")
    .select("doctor_id, doctor:doctor_profiles(user_id)")
    .eq("patient_id", patientId)
    .eq("status", "active")
    .maybeSingle();
  if (error || data === null) return null;
  const doctor = data.doctor as unknown as { user_id: string } | null;
  const doctorProfileId = data.doctor_id as string | undefined;
  if (doctor?.user_id === undefined || doctorProfileId === undefined) {
    return null;
  }
  return { doctorProfileId, userId: doctor.user_id };
}

export type DoctorNotificationSetting =
  | "checkins_enabled"
  | "messages_enabled"
  | "alerts_enabled";

/**
 * True when the doctor has this notification category enabled. Missing
 * settings row (doctor never opened the settings screen) defaults to true.
 */
export async function isDoctorNotificationEnabled(
  doctorProfileId: string,
  setting: DoctorNotificationSetting,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("doctor_notification_settings")
    .select(setting)
    .eq("doctor_id", doctorProfileId)
    .maybeSingle();
  if (error || data === null) return true;
  const value = (data as Record<DoctorNotificationSetting, boolean | null>)[
    setting
  ];
  return value ?? true;
}

/** Resolves the auth user_id behind a patient_profiles row, or null if none. */
export async function getPatientUserId(
  patientProfileId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("patient_profiles")
    .select("user_id")
    .eq("id", patientProfileId)
    .maybeSingle();
  if (error || data === null) return null;
  return (data.user_id as string | undefined) ?? null;
}
