import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, GripVertical, Plus, Trash2 } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import PrimaryButton from "@/components/PrimaryButton";
import { cardShadow, colors, fonts, radius } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

interface TitrationRow {
  id: string;
  therapy_cycle_id: string;
  step_order: number;
  dose_value: number;
  dose_unit: string;
  frequency: string;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
}

/** Local draft row — values stay as text while the doctor types. */
interface DraftStep {
  key: string;
  id: string | null;
  dose: string;
  unit: string;
  frequency: string;
  startDate: string;
  endDate: string;
  notes: string;
}

const UNIT_OPTIONS = ["мг", "мкг", "МО"] as const;

const FREQUENCY_OPTIONS = [
  "раз на тиждень",
  "раз на день",
  "двічі на тиждень",
  "раз на 2 тижні",
] as const;

function makeKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseDose(text: string): number | null {
  const value = parseFloat(text.replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Accepts "12.08.2026" or "2026-08-12", returns ISO or null. */
function toISO(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const dotted = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
  if (dotted !== null) return `${dotted[3]}-${dotted[2]}-${dotted[1]}`;
  return null;
}

function fromISO(iso: string | null): string {
  if (iso === null || iso.length < 10) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function emptyStep(): DraftStep {
  return {
    key: makeKey(),
    id: null,
    dose: "",
    unit: "мг",
    frequency: "раз на тиждень",
    startDate: "",
    endDate: "",
    notes: "",
  };
}

export default function TitrationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ cycleId?: string; patientName?: string }>();
  const cycleId = typeof params.cycleId === "string" ? params.cycleId : null;
  const patientName =
    typeof params.patientName === "string" ? params.patientName : "";

  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean>(false);

  const stepsQuery = useQuery({
    queryKey: ["titration", cycleId],
    enabled: cycleId !== null,
    queryFn: async (): Promise<TitrationRow[]> => {
      const { data, error: qError } = await supabase
        .from("titration_steps")
        .select(
          "id, therapy_cycle_id, step_order, dose_value, dose_unit, frequency, start_date, end_date, notes",
        )
        .eq("therapy_cycle_id", cycleId as string)
        .order("step_order", { ascending: true });
      if (qError) throw qError;
      return (data ?? []) as TitrationRow[];
    },
  });

  useEffect(() => {
    if (stepsQuery.data === undefined) return;
    if (stepsQuery.data.length === 0) {
      setSteps([emptyStep()]);
      return;
    }
    setSteps(
      stepsQuery.data.map((row) => ({
        key: row.id,
        id: row.id,
        dose: String(row.dose_value).replace(".", ","),
        unit: row.dose_unit,
        frequency: row.frequency,
        startDate: fromISO(row.start_date),
        endDate: fromISO(row.end_date),
        notes: row.notes ?? "",
      })),
    );
  }, [stepsQuery.data]);

  const updateStep = (key: string, patch: Partial<DraftStep>): void => {
    setSaved(false);
    setSteps((prev) =>
      prev.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    );
  };

  const addStep = (): void => {
    setSaved(false);
    setSteps((prev) => {
      const last = prev[prev.length - 1];
      const next = emptyStep();
      if (last !== undefined) {
        next.unit = last.unit;
        next.frequency = last.frequency;
      }
      return [...prev, next];
    });
  };

  const removeStep = (key: string): void => {
    setSaved(false);
    setSteps((prev) =>
      prev.length === 1 ? prev : prev.filter((s) => s.key !== key),
    );
  };

  const saveMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      if (cycleId === null) throw new Error("Цикл не знайдено");

      const filled = steps.filter((s) => s.dose.trim().length > 0);
      if (filled.length === 0) {
        throw new Error("Додайте хоча б один крок із дозуванням");
      }

      const payload = filled.map((s, index) => {
        const dose = parseDose(s.dose);
        if (dose === null) {
          throw new Error(`Крок ${index + 1}: некоректне дозування`);
        }
        return {
          therapy_cycle_id: cycleId,
          step_order: index + 1,
          dose_value: dose,
          dose_unit: s.unit,
          frequency: s.frequency,
          start_date: toISO(s.startDate),
          end_date: toISO(s.endDate),
          notes: s.notes.trim().length > 0 ? s.notes.trim() : null,
        };
      });

      // Full rewrite keeps step_order contiguous after reorder or delete.
      const { error: delError } = await supabase
        .from("titration_steps")
        .delete()
        .eq("therapy_cycle_id", cycleId);
      if (delError) throw delError;

      const { error: insError } = await supabase
        .from("titration_steps")
        .insert(payload);
      if (insError) throw insError;
    },
    onSuccess: () => {
      setError(null);
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ["titration", cycleId] });
    },
    onError: (e: unknown) => {
      setSaved(false);
      setError(e instanceof Error ? e.message : "Не вдалося зберегти схему");
    },
  });

  if (cycleId === null) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyText}>Цикл не передано</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          testID="titration-back"
        >
          <ArrowLeft size={20} color={colors.ink} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Схема титрації</Text>
          {patientName.length > 0 ? (
            <Text style={styles.subtitle}>{patientName}</Text>
          ) : null}
        </View>
      </View>

      {stepsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.teal} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 120 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.hint}>
            Дозування задаються вручну. Пацієнт бачить лише поточний крок —
            той, у чий діапазон дат потрапляє сьогоднішня дата.
          </Text>

          {steps.map((step, index) => (
            <View key={step.key} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.stepBadge}>
                  <GripVertical size={13} color={colors.sub} />
                  <Text style={styles.stepBadgeText}>Крок {index + 1}</Text>
                </View>
                {steps.length > 1 ? (
                  <Pressable
                    onPress={() => removeStep(step.key)}
                    hitSlop={10}
                    testID={`titration-remove-${index}`}
                  >
                    <Trash2 size={17} color={colors.sub} />
                  </Pressable>
                ) : null}
              </View>

              <Text style={styles.label}>Дозування</Text>
              <View style={styles.doseRow}>
                <TextInput
                  style={styles.doseInput}
                  value={step.dose}
                  onChangeText={(t) => updateStep(step.key, { dose: t })}
                  placeholder="2,5"
                  placeholderTextColor={colors.sub}
                  keyboardType="decimal-pad"
                  testID={`titration-dose-${index}`}
                />
                <View style={styles.chipRow}>
                  {UNIT_OPTIONS.map((u) => (
                    <Pressable
                      key={u}
                      onPress={() => updateStep(step.key, { unit: u })}
                      style={[
                        styles.chip,
                        step.unit === u ? styles.chipActive : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          step.unit === u ? styles.chipTextActive : null,
                        ]}
                      >
                        {u}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <Text style={styles.label}>Частота</Text>
              <View style={styles.freqWrap}>
                {FREQUENCY_OPTIONS.map((f) => (
                  <Pressable
                    key={f}
                    onPress={() => updateStep(step.key, { frequency: f })}
                    style={[
                      styles.freqChip,
                      step.frequency === f ? styles.chipActive : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        step.frequency === f ? styles.chipTextActive : null,
                      ]}
                    >
                      {f}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.dateRow}>
                <View style={styles.dateCol}>
                  <Text style={styles.label}>Початок</Text>
                  <TextInput
                    style={styles.input}
                    value={step.startDate}
                    onChangeText={(t) => updateStep(step.key, { startDate: t })}
                    placeholder="12.08.2026"
                    placeholderTextColor={colors.sub}
                    testID={`titration-start-${index}`}
                  />
                </View>
                <View style={styles.dateCol}>
                  <Text style={styles.label}>Завершення</Text>
                  <TextInput
                    style={styles.input}
                    value={step.endDate}
                    onChangeText={(t) => updateStep(step.key, { endDate: t })}
                    placeholder="08.09.2026"
                    placeholderTextColor={colors.sub}
                    testID={`titration-end-${index}`}
                  />
                </View>
              </View>

              <Text style={styles.label}>Примітка (необовʼязково)</Text>
              <TextInput
                style={[styles.input, styles.notesInput]}
                value={step.notes}
                onChangeText={(t) => updateStep(step.key, { notes: t })}
                placeholder="Напр. при нудоті затримати крок на тиждень"
                placeholderTextColor={colors.sub}
                multiline
                testID={`titration-notes-${index}`}
              />
            </View>
          ))}

          <Pressable
            onPress={addStep}
            style={styles.addBtn}
            testID="titration-add"
          >
            <Plus size={17} color={colors.navy} />
            <Text style={styles.addText}>Додати крок</Text>
          </Pressable>

          {error !== null ? <Text style={styles.error}>{error}</Text> : null}
          {saved ? (
            <Text style={styles.success}>Схему збережено</Text>
          ) : null}
        </ScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <PrimaryButton
          label="Зберегти схему"
          onPress={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
          variant="navy"
          testID="titration-save"
        />
      </View>
    </KeyboardAvoidingView>
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
    backgroundColor: colors.paper,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1 },
  title: { fontFamily: fonts.serif, fontSize: 22, color: colors.ink },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.sub,
    marginTop: 2,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4 },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.sub,
    marginBottom: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 18,
    marginBottom: 14,
    ...cardShadow,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  stepBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  stepBadgeText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.sub,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.sub,
    marginBottom: 7,
    marginTop: 4,
  },
  doseRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  doseInput: {
    width: 92,
    height: 48,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.paper,
    paddingHorizontal: 14,
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.ink,
  },
  chipRow: { flexDirection: "row", gap: 6 },
  chip: {
    paddingHorizontal: 13,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.sub },
  chipTextActive: { color: colors.card },
  freqWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  freqChip: {
    paddingHorizontal: 13,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  dateRow: { flexDirection: "row", gap: 10 },
  dateCol: { flex: 1 },
  input: {
    height: 46,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.paper,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
  notesInput: { height: 62, paddingTop: 12, textAlignVertical: "top" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    height: 50,
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.navy,
    marginTop: 2,
  },
  addText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.navy },
  error: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.amber,
    marginTop: 14,
    textAlign: "center",
  },
  success: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.tealDeep,
    marginTop: 14,
    textAlign: "center",
  },
  emptyText: { fontFamily: fonts.regular, fontSize: 15, color: colors.sub },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
});
