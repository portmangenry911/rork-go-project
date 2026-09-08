import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowLeft, BellRing } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cardShadow, colors, fonts, radius } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

interface DoctorNotificationSettings {
  checkins_enabled: boolean;
  messages_enabled: boolean;
  alerts_enabled: boolean;
}

const DEFAULT_SETTINGS: DoctorNotificationSettings = {
  checkins_enabled: true,
  messages_enabled: true,
  alerts_enabled: true,
};

export default function DoctorNotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  const [settings, setSettings] =
    useState<DoctorNotificationSettings>(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);

  const doctorIdQuery = useQuery({
    queryKey: ["doctor-profile-id", userId],
    enabled: userId !== null,
    queryFn: async (): Promise<string | null> => {
      const { data, error: qError } = await supabase
        .from("doctor_profiles")
        .select("id")
        .eq("user_id", userId as string)
        .maybeSingle();
      if (qError) throw qError;
      return (data?.id as string | undefined) ?? null;
    },
  });
  const doctorId = doctorIdQuery.data ?? null;

  const settingsQuery = useQuery({
    queryKey: ["doctor-notification-settings", doctorId],
    enabled: doctorId !== null,
    queryFn: async (): Promise<DoctorNotificationSettings | null> => {
      const { data, error: qError } = await supabase
        .from("doctor_notification_settings")
        .select("checkins_enabled, messages_enabled, alerts_enabled")
        .eq("doctor_id", doctorId as string)
        .maybeSingle();
      if (qError) throw qError;
      return (data as DoctorNotificationSettings | null) ?? null;
    },
  });

  useEffect(() => {
    if (settingsQuery.data !== undefined && settingsQuery.data !== null) {
      setSettings(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (
      next: DoctorNotificationSettings,
    ): Promise<void> => {
      if (doctorId === null) throw new Error("Профіль лікаря не знайдено");
      const { error: upsertError } = await supabase
        .from("doctor_notification_settings")
        .upsert(
          {
            doctor_id: doctorId,
            ...next,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "doctor_id" },
        );
      if (upsertError) throw upsertError;
    },
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({
        queryKey: ["doctor-notification-settings", doctorId],
      });
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Не вдалося зберегти");
    },
  });

  const toggle = (patch: Partial<DoctorNotificationSettings>): void => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveMutation.mutate(next);
  };

  const isLoading = doctorIdQuery.isLoading || settingsQuery.isLoading;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          testID="doctor-notifications-back"
        >
          <ArrowLeft size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Сповіщення</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.teal} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 24 },
          ]}
        >
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <BellRing size={18} color={colors.tealDeep} strokeWidth={2} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Чек-іни пацієнтів</Text>
                <Text style={styles.rowSub}>
                  Щоденні та щотижневі чек-іни
                </Text>
              </View>
              <Switch
                value={settings.checkins_enabled}
                onValueChange={(v) => toggle({ checkins_enabled: v })}
                trackColor={{ false: colors.hairline, true: colors.teal }}
                testID="checkins-switch"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <BellRing size={18} color={colors.tealDeep} strokeWidth={2} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Нові повідомлення</Text>
                <Text style={styles.rowSub}>Чат із пацієнтами</Text>
              </View>
              <Switch
                value={settings.messages_enabled}
                onValueChange={(v) => toggle({ messages_enabled: v })}
                trackColor={{ false: colors.hairline, true: colors.teal }}
                testID="messages-switch"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <BellRing size={18} color={colors.tealDeep} strokeWidth={2} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Тривожні сигнали</Text>
                <Text style={styles.rowSub}>
                  Низьке самопочуття пацієнта
                </Text>
              </View>
              <Switch
                value={settings.alerts_enabled}
                onValueChange={(v) => toggle({ alerts_enabled: v })}
                trackColor={{ false: colors.hairline, true: colors.teal }}
                testID="alerts-switch"
              />
            </View>
          </View>

          {error !== null && (
            <Text style={styles.error} testID="doctor-notifications-error">
              {error}
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingHorizontal: 18,
    ...cardShadow,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  rowSub: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.sub,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.hairline,
  },
  error: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.amber,
    textAlign: "center",
    marginTop: 14,
  },
});
