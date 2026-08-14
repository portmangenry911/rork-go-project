import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowLeft, BellOff, BellRing, Clock } from "lucide-react-native";
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
  WEEKDAY_ORDER,
  WEEKDAY_SHORT,
  isSupported,
  rescheduleReminders,
  type ReminderSettings,
} from "@/lib/notifications";

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

/** Wraps "HH:MM" in a throwaway Date, which is what the picker consumes. */
function timeToDate(value: string): Date {
  const { hour, minute } = splitTime(value);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
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
  const [openPicker, setOpenPicker] = useState<"daily" | "weekly" | null>(null);

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
                <TimeField
                  value={settings.daily_time}
                  isOpen={openPicker === "daily"}
                  onToggle={() =>
                    setOpenPicker(openPicker === "daily" ? null : "daily")
                  }
                  onChange={(h, m) => update({ daily_time: buildTime(h, m) })}
                  onClose={() => setOpenPicker(null)}
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
              {WEEKDAY_ORDER.map((day) => (
                <Pressable
                  key={day}
                  onPress={() => update({ weekly_weekday: day })}
                  style={[
                    styles.dayChip,
                    settings.weekly_weekday === day ? styles.chipActive : null,
                  ]}
                  testID={`weekday-${day}`}
                >
                  <Text
                    style={[
                      styles.chipText,
                      settings.weekly_weekday === day
                        ? styles.chipTextActive
                        : null,
                    ]}
                  >
                    {WEEKDAY_SHORT[day]}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.dayHint}>
              {WEEKDAY_LABELS[settings.weekly_weekday]}
            </Text>

            <Text style={styles.label}>Час</Text>
            <TimeField
              value={settings.weekly_time}
              isOpen={openPicker === "weekly"}
              onToggle={() =>
                setOpenPicker(openPicker === "weekly" ? null : "weekly")
              }
              onChange={(h, m) => update({ weekly_time: buildTime(h, m) })}
              onClose={() => setOpenPicker(null)}
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

interface TimeFieldProps {
  value: string;
  isOpen: boolean;
  onToggle: () => void;
  onChange: (hour: number, minute: number) => void;
  onClose: () => void;
  testID: string;
}

/** Native time wheel on iOS/Android, native time input on web. */
function TimeField({
  value,
  isOpen,
  onToggle,
  onChange,
  onClose,
  testID,
}: TimeFieldProps) {
  if (Platform.OS === "web") {
    return React.createElement("input", {
      type: "time",
      value,
      "data-testid": testID,
      onChange: (e: { target: { value: string } }) => {
        const raw = e.target.value;
        if (raw.length < 4) return;
        const [h, m] = raw.split(":");
        onChange(Number(h), Number(m));
      },
      style: {
        height: 50,
        borderRadius: radius.button,
        backgroundColor: colors.paper,
        border: `1px solid ${colors.hairline}`,
        paddingLeft: 14,
        paddingRight: 14,
        outline: "none",
        fontSize: 17,
        fontFamily: fonts.semibold,
        color: colors.ink,
        width: "100%",
        boxSizing: "border-box",
      },
    });
  }

  return (
    <View>
      <Pressable style={styles.timeField} onPress={onToggle} testID={testID}>
        <Clock size={17} color={colors.sub} strokeWidth={1.8} />
        <Text style={styles.timeFieldValue}>{value}</Text>
      </Pressable>

      {isOpen && (
        <View style={styles.wheelPanel}>
          <DateTimePicker
            value={timeToDate(value)}
            mode="time"
            is24Hour
            display={Platform.OS === "ios" ? "spinner" : "default"}
            minuteInterval={5}
            onChange={(event: DateTimePickerEvent, selected?: Date) => {
              if (Platform.OS === "android") {
                onClose();
                if (event.type !== "dismissed" && selected !== undefined) {
                  onChange(selected.getHours(), selected.getMinutes());
                }
                return;
              }
              if (event.type !== "dismissed" && selected !== undefined) {
                onChange(selected.getHours(), selected.getMinutes());
              }
            }}
          />
          {Platform.OS === "ios" && (
            <Pressable style={styles.wheelDone} onPress={onClose}>
              <Text style={styles.wheelDoneText}>Готово</Text>
            </Pressable>
          )}
        </View>
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
  timeField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 50,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.paper,
    paddingHorizontal: 14,
  },
  timeFieldValue: {
    fontFamily: fonts.semibold,
    fontSize: 17,
    color: colors.ink,
  },
  wheelPanel: {
    marginTop: 8,
    backgroundColor: colors.card,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: 4,
  },
  wheelDone: {
    alignSelf: "flex-end",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  wheelDoneText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.navy,
  },
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
