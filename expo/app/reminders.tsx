import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowLeft, BellOff, BellRing } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import PrimaryButton from "@/components/PrimaryButton";
import { cardShadow, colors, fonts, radius } from "@/constants/theme";
import { usePatientHome } from "@/hooks/usePatientHome";
import { supabase } from "@/lib/supabase";
import {
  DEFAULT_REMINDERS,
  WEEKDAY_LABELS,
  isSupported,
  rescheduleReminders,
  type ReminderSettings,
} from "@/lib/notifications";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];
const INTERVALS: { value: number; label: string }[] = [
  { value: 1, label: "Щодня" },
  { value: 3, label: "Кожні 3 дні" },
];

function buildTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function splitTime(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(":");
  return { hour: Number(h) || 9, minute: Number(m) || 0 };
}

export default function RemindersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { profile } = usePatientHome();
  const patientId = profile?.id ?? null;

  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_REMINDERS);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["reminder-settings", patientId],
    enabled: patientId !== null,
    queryFn: async (): Promise<ReminderSettings | null> => {
      const { data, error: qError } = await supabase
        .from("reminder_settings")
        .select(
          "daily_enabled, daily_time, daily_interval_days, weekly_weekday, weekly_time",
        )
        .eq("patient_id", patientId as string)
        .maybeSingle();
      if (qError) throw qError;
      return (data as ReminderSettings | null) ?? null;
    },
  });

  useEffect(() => {
    if (settingsQuery.data !== undefined && settingsQuery.data !== null) {
      setSettings(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (): Promise<boolean> => {
      if (patientId === null) throw new Error("Профіль не знайдено");

      const { error: upsertError } = await supabase
        .from("reminder_settings")
        .upsert(
          {
            patient_id: patientId,
            ...settings,
            onboarding_seen: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "patient_id" },
        );
      if (upsertError) throw upsertError;

      return await rescheduleReminders(settings);
    },
    onSuccess: (scheduled: boolean) => {
      setError(null);
      setStatus(
        scheduled
          ? "Нагадування збережено"
          : "Збережено. Увімкніть сповіщення в налаштуваннях телефону, щоб отримувати нагадування.",
      );
      void queryClient.invalidateQueries({
        queryKey: ["reminder-settings", patientId],
      });
    },
    onError: (e: unknown) => {
      setStatus(null);
      setError(e instanceof Error ? e.message : "Не вдалося зберегти");
    },
  });

  const update = (patch: Partial<ReminderSettings>): void => {
    setStatus(null);
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const dailyParts = splitTime(settings.daily_time);
  const weeklyParts = splitTime(settings.weekly_time);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          testID="reminders-back"
        >
          <ArrowLeft size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Нагадування</Text>
      </View>

      {settingsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.teal} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 120 },
          ]}
        >
          {Platform.OS === "web" && (
            <View style={styles.webNotice}>
              <Text style={styles.webNoticeText}>
                Нагадування працюють у застосунку на телефоні. Тут можна
                налаштувати їх наперед.
              </Text>
            </View>
          )}

          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.cardIcon}>
                {settings.daily_enabled ? (
                  <BellRing size={18} color={colors.tealDeep} strokeWidth={2} />
                ) : (
                  <BellOff size={18} color={colors.sub} strokeWidth={2} />
                )}
              </View>
              <View style={styles.cardHeadText}>
                <Text style={styles.cardTitle}>Щоденний чек-ін</Text>
                <Text style={styles.cardSub}>Самопочуття, апетит, енергія</Text>
              </View>
              <Switch
                value={settings.daily_enabled}
                onValueChange={(v) => update({ daily_enabled: v })}
                trackColor={{ false: colors.hairline, true: colors.teal }}
                testID="daily-switch"
              />
            </View>

            {settings.daily_enabled && (
              <>
                <Text style={styles.label}>Частота</Text>
                <View style={styles.chipRow}>
                  {INTERVALS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      onPress={() => update({ daily_interval_days: opt.value })}
                      style={[
                        styles.chip,
                        settings.daily_interval_days === opt.value
                          ? styles.chipActive
                          : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          settings.daily_interval_days === opt.value
                            ? styles.chipTextActive
                            : null,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>Час</Text>
                <TimePicker
                  hour={dailyParts.hour}
                  minute={dailyParts.minute}
                  onChange={(h, m) => update({ daily_time: buildTime(h, m) })}
                  testID="daily-time"
                />
              </>
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.cardIcon}>
                <BellRing size={18} color={colors.tealDeep} strokeWidth={2} />
              </View>
              <View style={styles.cardHeadText}>
                <Text style={styles.cardTitle}>Щотижневий чек-ін</Text>
                <Text style={styles.cardSub}>Вага, заміри — обовʼязково</Text>
              </View>
            </View>

            <Text style={styles.label}>День тижня</Text>
            <View style={styles.chipWrap}>
              {WEEKDAY_LABELS.map((label, index) => (
                <Pressable
                  key={label}
                  onPress={() => update({ weekly_weekday: index })}
                  style={[
                    styles.dayChip,
                    settings.weekly_weekday === index ? styles.chipActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      settings.weekly_weekday === index
                        ? styles.chipTextActive
                        : null,
                    ]}
                  >
                    {label.slice(0, 2)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.dayHint}>
              {WEEKDAY_LABELS[settings.weekly_weekday]}
            </Text>

            <Text style={styles.label}>Час</Text>
            <TimePicker
              hour={weeklyParts.hour}
              minute={weeklyParts.minute}
              onChange={(h, m) => update({ weekly_time: buildTime(h, m) })}
              testID="weekly-time"
            />
          </View>

          {error !== null && <Text style={styles.error}>{error}</Text>}
          {status !== null && <Text style={styles.success}>{status}</Text>}
        </ScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <PrimaryButton
          label="Зберегти"
          onPress={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
          variant="navy"
          testID="reminders-save"
        />
      </View>
    </View>
  );
}

interface TimePickerProps {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
  testID: string;
}

/** Compact hour/minute strip — avoids a native modal for a two-value choice. */
function TimePicker({ hour, minute, onChange, testID }: TimePickerProps) {
  return (
    <View testID={testID}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.timeStrip}
      >
        {HOURS.map((h) => (
          <Pressable
            key={h}
            onPress={() => onChange(h, minute)}
            style={[styles.timeCell, hour === h ? styles.chipActive : null]}
          >
            <Text
              style={[
                styles.chipText,
                hour === h ? styles.chipTextActive : null,
              ]}
            >
              {String(h).padStart(2, "0")}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.minuteRow}>
        {MINUTES.map((m) => (
          <Pressable
            key={m}
            onPress={() => onChange(hour, m)}
            style={[styles.timeCell, minute === m ? styles.chipActive : null]}
          >
            <Text
              style={[
                styles.chipText,
                minute === m ? styles.chipTextActive : null,
              ]}
            >
              :{String(m).padStart(2, "0")}
            </Text>
          </Pressable>
        ))}
      </View>
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
  webNotice: {
    backgroundColor: colors.mint,
    borderRadius: radius.button,
    padding: 14,
    marginBottom: 14,
  },
  webNoticeText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.tealDeep,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 18,
    marginBottom: 14,
    ...cardShadow,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeadText: { flex: 1 },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  cardSub: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.sub,
    marginTop: 1,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.sub,
    marginTop: 18,
    marginBottom: 8,
  },
  chipRow: { flexDirection: "row", gap: 8 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 16,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  dayChip: {
    width: 44,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.sub },
  chipTextActive: { color: colors.card },
  dayHint: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.navy,
    marginTop: 8,
  },
  timeStrip: { gap: 6, paddingRight: 6 },
  timeCell: {
    width: 48,
    height: 40,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  minuteRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  error: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.amber,
    textAlign: "center",
    marginTop: 8,
  },
  success: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.tealDeep,
    textAlign: "center",
    marginTop: 8,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
});
