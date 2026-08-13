import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
} from "lucide-react-native";
import React, { useState } from "react";
import {
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
import { colors, cardShadow, fonts, radius, softShadow } from "@/constants/theme";
import { useDoctorHome } from "@/hooks/useDoctorHome";
import { supabase } from "@/lib/supabase";

type GoalType = "weight" | "lab_marker" | "course_completion" | "custom";

const GOAL_OPTIONS: { key: GoalType; label: string }[] = [
  { key: "weight", label: "Вага" },
  { key: "lab_marker", label: "Лаб." },
  { key: "course_completion", label: "Курс" },
  { key: "custom", label: "Кастом" },
];

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}.${m}.${date.getFullYear()}`;
}

function parseNumber(text: string): number | null {
  const value = parseFloat(text.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

export default function CreateCycleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { profile, relations, isLoading } = useDoctorHome();
  const doctorId = profile?.id ?? null;

  const patients = relations.filter((rel) => rel.patient !== null);
  const hasPatients = patients.length > 0;

  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    null,
  );
  const [isPickerOpen, setIsPickerOpen] = useState<boolean>(false);
  const [protocolName, setProtocolName] = useState<string>("");
  const [goalType, setGoalType] = useState<GoalType>("weight");
  const [goalStart, setGoalStart] = useState<string>("");
  const [goalTarget, setGoalTarget] = useState<string>("");
  const [customGoal, setCustomGoal] = useState<string>("");
  const [goalWaist, setGoalWaist] = useState<string>("");
  const [goalHips, setGoalHips] = useState<string>("");
  const [goalAbdomen, setGoalAbdomen] = useState<string>("");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [startDateText, setStartDateText] = useState<string>(
    toISODate(new Date()),
  );
  const [endDateText, setEndDateText] = useState<string>("");
  const [activePicker, setActivePicker] = useState<"start" | "end" | null>(
    null,
  );
  const [draftStartDate, setDraftStartDate] = useState<Date | null>(null);
  const [draftEndDate, setDraftEndDate] = useState<Date | null>(null);
  const [metricName, setMetricName] = useState<string>("");
  const [metricValue, setMetricValue] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isCreated, setIsCreated] = useState<boolean>(false);

  const selectedPatient =
    patients.find((rel) => rel.patient?.id === selectedPatientId) ?? null;

  const createCycle = useMutation({
    mutationFn: async (): Promise<void> => {
      if (doctorId === null) throw new Error("Профіль лікаря не знайдено.");
      if (selectedPatientId === null) throw new Error("Оберіть пацієнта.");

      const isWeb = Platform.OS === "web";
      const start = isWeb ? startDateText.trim() : toISODate(startDate);
      const end = isWeb
        ? endDateText.trim().length > 0
          ? endDateText.trim()
          : null
        : endDate !== null
          ? toISODate(endDate)
          : null;

      const notesParts: string[] = [];
      if (goalType === "custom" && customGoal.trim().length > 0) {
        notesParts.push(`Мета: ${customGoal.trim()}`);
      }
      if (metricName.trim().length > 0 || metricValue.trim().length > 0) {
        notesParts.push(
          `Показник: ${metricName.trim()} — Значення: ${metricValue.trim()}`,
        );
      }
      if (notes.trim().length > 0) {
        notesParts.push(notes.trim());
      }

      const { error: insertError } = await supabase
        .from("therapy_cycles")
        .insert({
          doctor_id: doctorId,
          patient_id: selectedPatientId,
          protocol_name: protocolName.trim(),
          goal_type: goalType,
          goal_start: goalType === "weight" ? parseNumber(goalStart) : null,
          goal_target: goalType === "weight" ? parseNumber(goalTarget) : null,
          goal_unit: goalType === "weight" ? "кг" : null,
          // Measurement goals are optional — blank fields stay null.
          goal_waist_cm: parseNumber(goalWaist),
          goal_hips_cm: parseNumber(goalHips),
          goal_abdomen_cm: parseNumber(goalAbdomen),
          start_date: start,
          expected_end: end,
          status: "active",
          doctor_notes: notesParts.length > 0 ? notesParts.join("\n") : null,
        });
      if (insertError) {
        throw new Error(`Не вдалося створити цикл: ${insertError.message}`);
      }
    },
    onSuccess: () => {
      setIsCreated(true);
      queryClient.invalidateQueries({ queryKey: ["doctor-active-patients"] });
      queryClient.invalidateQueries({ queryKey: ["patient-active-cycle"] });
    },
    onError: (err: unknown) => {
      setError(
        err instanceof Error ? err.message : "Не вдалося створити цикл.",
      );
    },
  });

  const handleSubmit = () => {
    setError(null);
    if (selectedPatientId === null) {
      setError("Оберіть пацієнта.");
      return;
    }
    if (protocolName.trim().length === 0) {
      setError("Вкажіть назву протоколу.");
      return;
    }
    if (goalType === "weight") {
      if (parseNumber(goalStart) === null || parseNumber(goalTarget) === null) {
        setError("Вкажіть стартову та цільову вагу.");
        return;
      }
    }
    createCycle.mutate();
  };

  if (isCreated) {
    return (
      <View
        style={[styles.screen, styles.successWrap, { paddingTop: insets.top }]}
        testID="cycle-success"
      >
        <View style={styles.successIcon}>
          <CheckCircle2 size={40} color={colors.teal} strokeWidth={1.5} />
        </View>
        <Text style={styles.successTitle}>Цикл створено!</Text>
        <View style={styles.successButton}>
          <PrimaryButton
            testID="cycle-done-button"
            label="На головну"
            onPress={() => router.back()}
          />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          testID="create-cycle-screen"
        >
          <Pressable
            testID="cycle-back-button"
            onPress={() => router.back()}
            style={styles.back}
            hitSlop={12}
          >
            <ArrowLeft size={22} color={colors.ink} />
          </Pressable>

          <Text style={styles.title}>Новий цикл</Text>

          <Text style={styles.label}>Пацієнт</Text>
          {!isLoading && !hasPatients ? (
            <View style={styles.noPatients} testID="no-patients-notice">
              <Text style={styles.noPatientsText}>
                Спочатку додайте пацієнта
              </Text>
            </View>
          ) : (
            <>
              <Pressable
                testID="patient-picker"
                style={styles.pickerField}
                onPress={() => setIsPickerOpen((prev) => !prev)}
              >
                <Text
                  style={[
                    styles.pickerText,
                    selectedPatient === null && styles.pickerPlaceholder,
                  ]}
                >
                  {selectedPatient?.patient !== null &&
                  selectedPatient !== null
                    ? `${selectedPatient.patient?.first_name ?? ""} ${selectedPatient.patient?.last_name ?? ""}`
                    : "Оберіть пацієнта"}
                </Text>
                <ChevronDown size={19} color={colors.sub} strokeWidth={1.8} />
              </Pressable>
              {isPickerOpen && (
                <View style={styles.pickerList}>
                  {patients.map((rel, index) => (
                    <View key={rel.id}>
                      {index > 0 && <View style={styles.divider} />}
                      <Pressable
                        testID={`patient-option-${rel.patient?.id ?? ""}`}
                        style={styles.pickerOption}
                        onPress={() => {
                          setSelectedPatientId(rel.patient?.id ?? null);
                          setIsPickerOpen(false);
                        }}
                      >
                        <Text style={styles.pickerOptionText}>
                          {rel.patient?.first_name ?? ""}{" "}
                          {rel.patient?.last_name ?? ""}
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          <Text style={styles.label}>Назва протоколу</Text>
          <TextInput
            testID="protocol-name-input"
            style={styles.input}
            value={protocolName}
            onChangeText={setProtocolName}
            placeholder="Напр., Семаглутид 0,25 мг"
            placeholderTextColor={colors.sub}
            editable={hasPatients}
          />

          <Text style={styles.label}>Тип мети</Text>
          <View style={styles.segmented}>
            {GOAL_OPTIONS.map((option) => (
              <Pressable
                key={option.key}
                testID={`goal-type-${option.key}`}
                onPress={() => setGoalType(option.key)}
                style={[
                  styles.segment,
                  goalType === option.key && styles.segmentActive,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    goalType === option.key && styles.segmentTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {goalType === "weight" && (
            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Старт (кг)</Text>
                <TextInput
                  testID="goal-start-input"
                  style={styles.input}
                  value={goalStart}
                  onChangeText={setGoalStart}
                  keyboardType="decimal-pad"
                  placeholder="96,4"
                  placeholderTextColor={colors.sub}
                  editable={hasPatients}
                />
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Ціль (кг)</Text>
                <TextInput
                  testID="goal-target-input"
                  style={styles.input}
                  value={goalTarget}
                  onChangeText={setGoalTarget}
                  keyboardType="decimal-pad"
                  placeholder="85,0"
                  placeholderTextColor={colors.sub}
                  editable={hasPatients}
                />
              </View>
            </View>
          )}

          <View style={styles.measureHead}>
            <Text style={styles.label}>Цілі по замірах</Text>
            <Text style={styles.optional}>необовʼязково</Text>
          </View>
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={styles.smallLabel}>Талія (см)</Text>
              <TextInput
                testID="goal-waist-input"
                style={styles.input}
                value={goalWaist}
                onChangeText={setGoalWaist}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={colors.sub}
                editable={hasPatients}
              />
            </View>
            <View style={styles.rowItem}>
              <Text style={styles.smallLabel}>Стегна (см)</Text>
              <TextInput
                testID="goal-hips-input"
                style={styles.input}
                value={goalHips}
                onChangeText={setGoalHips}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={colors.sub}
                editable={hasPatients}
              />
            </View>
          </View>
          <View style={styles.rowItemFull}>
            <Text style={styles.smallLabel}>Живіт (см)</Text>
            <TextInput
              testID="goal-abdomen-input"
              style={styles.input}
              value={goalAbdomen}
              onChangeText={setGoalAbdomen}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor={colors.sub}
              editable={hasPatients}
            />
          </View>

          {goalType === "custom" && (
            <>
              <Text style={styles.label}>Опишіть мету</Text>
              <TextInput
                testID="custom-goal-input"
                style={styles.input}
                value={customGoal}
                onChangeText={setCustomGoal}
                placeholder="Опишіть мету"
                placeholderTextColor={colors.sub}
                editable={hasPatients}
              />
            </>
          )}

          <Text style={styles.label}>Дата початку</Text>
          {Platform.OS === "web" ? (
            React.createElement("input", {
              "data-testid": "start-date-input",
              type: "date",
              value: startDateText,
              disabled: !hasPatients,
              onChange: (e: { target: { value: string } }) =>
                setStartDateText(e.target.value),
              style: {
                height: 54,
                borderRadius: radius.button,
                backgroundColor: colors.card,
                paddingLeft: 16,
                paddingRight: 16,
                border: "none",
                outline: "none",
                fontSize: 16,
                fontFamily: fonts.medium,
                color: colors.ink,
                width: "100%",
                boxSizing: "border-box",
              },
            })
          ) : (
            <Pressable
              testID="start-date-input"
              style={styles.pickerField}
              onPress={() => {
                setDraftStartDate(startDate);
                setActivePicker((prev) => (prev === "start" ? null : "start"));
              }}
            >
              <Text style={styles.pickerText}>
                {formatDisplayDate(startDate)}
              </Text>
              <CalendarDays size={19} color={colors.sub} strokeWidth={1.8} />
            </Pressable>
          )}
          {activePicker === "start" && Platform.OS !== "web" && (
            <View style={styles.pickerPanel}>
              <DateTimePicker
                value={draftStartDate ?? startDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(event: DateTimePickerEvent, selected?: Date) => {
                  if (Platform.OS === "android") {
                    setActivePicker(null);
                    if (event.type !== "dismissed" && selected !== undefined) {
                      setStartDate(selected);
                    }
                    return;
                  }
                  if (event.type !== "dismissed" && selected !== undefined) {
                    setDraftStartDate(selected);
                  }
                }}
              />
              {Platform.OS === "ios" && (
                <Pressable
                  testID="start-date-done"
                  style={styles.pickerDoneButton}
                  onPress={() => {
                    if (draftStartDate !== null) {
                      setStartDate(draftStartDate);
                    }
                    setDraftStartDate(null);
                    setActivePicker(null);
                  }}
                >
                  <Text style={styles.pickerDoneText}>Готово</Text>
                </Pressable>
              )}
            </View>
          )}

          <Text style={styles.label}>Дата завершення</Text>
          {Platform.OS === "web" ? (
            React.createElement("input", {
              "data-testid": "end-date-input",
              type: "date",
              value: endDateText,
              disabled: !hasPatients,
              onChange: (e: { target: { value: string } }) =>
                setEndDateText(e.target.value),
              style: {
                height: 54,
                borderRadius: radius.button,
                backgroundColor: colors.card,
                paddingLeft: 16,
                paddingRight: 16,
                border: "none",
                outline: "none",
                fontSize: 16,
                fontFamily: fonts.medium,
                color: colors.ink,
                width: "100%",
                boxSizing: "border-box",
              },
            })
          ) : (
            <Pressable
              testID="end-date-input"
              style={styles.pickerField}
              onPress={() => {
                setDraftEndDate(endDate);
                setActivePicker((prev) => (prev === "end" ? null : "end"));
              }}
            >
              <Text
                style={[
                  styles.pickerText,
                  endDate === null && styles.pickerPlaceholder,
                ]}
              >
                {endDate !== null ? formatDisplayDate(endDate) : "Оберіть дату"}
              </Text>
              <CalendarDays size={19} color={colors.sub} strokeWidth={1.8} />
            </Pressable>
          )}
          {activePicker === "end" && Platform.OS !== "web" && (
            <View style={styles.pickerPanel}>
              <DateTimePicker
                value={draftEndDate ?? endDate ?? new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                minimumDate={startDate}
                onChange={(event: DateTimePickerEvent, selected?: Date) => {
                  if (Platform.OS === "android") {
                    setActivePicker(null);
                    if (event.type !== "dismissed" && selected !== undefined) {
                      setEndDate(selected);
                    }
                    return;
                  }
                  if (event.type !== "dismissed" && selected !== undefined) {
                    setDraftEndDate(selected);
                  }
                }}
              />
              {Platform.OS === "ios" && (
                <Pressable
                  testID="end-date-done"
                  style={styles.pickerDoneButton}
                  onPress={() => {
                    if (draftEndDate !== null) {
                      setEndDate(draftEndDate);
                    }
                    setDraftEndDate(null);
                    setActivePicker(null);
                  }}
                >
                  <Text style={styles.pickerDoneText}>Готово</Text>
                </Pressable>
              )}
            </View>
          )}

          <Text style={styles.sectionLabel}>Протокол терапії</Text>

          <Text style={styles.label}>Показник</Text>
          <TextInput
            testID="metric-name-input"
            style={styles.input}
            value={metricName}
            onChangeText={setMetricName}
            placeholder="Напр., доза, мг"
            placeholderTextColor={colors.sub}
            editable={hasPatients}
          />

          <Text style={styles.label}>Значення</Text>
          <TextInput
            testID="metric-value-input"
            style={styles.input}
            value={metricValue}
            onChangeText={setMetricValue}
            keyboardType="decimal-pad"
            placeholder="0,25"
            placeholderTextColor={colors.sub}
            editable={hasPatients}
          />

          <Text style={styles.label}>Нотатки лікаря (приватно)</Text>
          <TextInput
            testID="doctor-notes-input"
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholder="Нотатки видно лише вам"
            placeholderTextColor={colors.sub}
            editable={hasPatients}
          />

          {error !== null && (
            <Text style={styles.error} testID="cycle-error">
              {error}
            </Text>
          )}
        </ScrollView>

        <View
          style={[styles.stickyBottom, { paddingBottom: insets.bottom + 12 }]}
        >
          <PrimaryButton
            testID="create-cycle-submit"
            label="Створити цикл"
            onPress={handleSubmit}
            disabled={!hasPatients}
            loading={createCycle.isPending}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    ...softShadow,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 32,
    color: colors.ink,
    marginTop: 24,
    marginBottom: 16,
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.sub,
    marginTop: 14,
    marginBottom: 8,
  },
  sectionLabel: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.ink,
    marginTop: 24,
  },
  input: {
    height: 54,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.ink,
    ...softShadow,
  },
  multiline: {
    height: 110,
    paddingTop: 14,
  },
  pickerField: {
    height: 54,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    ...softShadow,
  },
  pickerText: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.ink,
  },
  pickerPlaceholder: {
    color: colors.sub,
  },
  pickerPanel: {
    marginTop: 8,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    paddingBottom: 8,
    ...softShadow,
  },
  pickerDoneButton: {
    alignSelf: "center",
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: radius.button,
    backgroundColor: colors.navy,
  },
  pickerDoneText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  pickerList: {
    backgroundColor: colors.card,
    borderRadius: radius.button,
    marginTop: 8,
    paddingHorizontal: 16,
    ...cardShadow,
  },
  pickerOption: {
    paddingVertical: 14,
  },
  pickerOptionText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  divider: {
    height: 1,
    backgroundColor: colors.hairline,
  },
  noPatients: {
    backgroundColor: colors.goldTint,
    borderRadius: radius.button,
    padding: 16,
  },
  noPatientsText: {
    fontFamily: fonts.semibold,
    fontSize: 14.5,
    color: colors.gold,
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.button,
    padding: 4,
    gap: 4,
    ...softShadow,
  },
  segment: {
    flex: 1,
    height: 42,
    borderRadius: radius.button - 4,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: {
    backgroundColor: colors.navy,
  },
  segmentText: {
    fontFamily: fonts.bold,
    fontSize: 13.5,
    color: colors.sub,
  },
  segmentTextActive: {
    color: "#FFFFFF",
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  measureHead: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginTop: 4,
  },
  optional: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.sub,
  },
  smallLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.sub,
    marginBottom: 7,
  },
  rowItemFull: { marginTop: 4 },
  rowItem: {
    flex: 1,
  },
  error: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.amber,
    marginTop: 14,
  },
  stickyBottom: {
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  successWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  successIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  successTitle: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
    marginBottom: 28,
  },
  successButton: {
    alignSelf: "stretch",
  },
});
