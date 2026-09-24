import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import IndicatorRuler from "@/components/IndicatorRuler";
import IndicatorTrendChart from "@/components/IndicatorTrendChart";
import { cardShadow, colors, fonts, radius } from "@/constants/theme";
import {
  useLabIndicatorValuesForPatient,
  useLabIndicatorsCatalog,
  usePatientLabIndicatorValues,
  type LabIndicator,
} from "@/hooks/useLabIndicators";
import { useAuth } from "@/providers/AuthProvider";
import { formatDateShort } from "@/utils/dates";

const CONSENT_PREFIX =
  "Я підтверджую, що особисто вніс(ла) та перевірив(ла) ці дані, і несу відповідальність за їх достовірність. Ознайомлений(а) з ";
const CONSENT_LINK_LABEL = "Умовами використання";

function decimalsOf(indicator: LabIndicator): number {
  const text = String(indicator.step);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

function roundToStep(value: number, indicator: LabIndicator): number {
  const factor = 10 ** decimalsOf(indicator);
  return Math.round(value * factor) / factor;
}

export default function LabIndicatorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [chartWidth, setChartWidth] = useState<number>(0);
  const { code, patientId: patientIdParam } = useLocalSearchParams<{
    code: string;
    patientId?: string;
  }>();
  const { role } = useAuth();
  const isDoctor = role === "doctor";

  const catalogQuery = useLabIndicatorsCatalog();
  const indicator =
    catalogQuery.data?.find((i) => i.code === code) ?? null;

  const patientSide = usePatientLabIndicatorValues();
  const doctorSide = useLabIndicatorValuesForPatient(
    isDoctor && typeof patientIdParam === "string" ? patientIdParam : null,
  );

  const values = isDoctor ? doctorSide.data ?? [] : patientSide.values;
  const isLoading = isDoctor
    ? doctorSide.isPending
    : catalogQuery.isPending || patientSide.isLoading;

  const indicatorValues =
    indicator !== null
      ? values.filter((v) => v.indicator_id === indicator.id)
      : [];
  // Oldest first for the chart; the list below shows newest first.
  const chronological = [...indicatorValues].sort((a, b) =>
    a.measured_at.localeCompare(b.measured_at),
  );
  const history = [...indicatorValues].sort((a, b) =>
    b.measured_at.localeCompare(a.measured_at),
  );
  const latest = history[0] ?? null;

  const [draftValue, setDraftValue] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the draft once the indicator (and its latest value) are known.
  if (draftValue === null && indicator !== null) {
    const seed =
      history[0]?.value ??
      roundToStep((indicator.min_value + indicator.max_value) / 2, indicator);
    setDraftValue(seed);
  }

  const handleAdd = (): void => {
    if (indicator === null || draftValue === null || !confirmed) return;
    setError(null);
    patientSide.addValue.mutate(
      { indicatorId: indicator.id, value: draftValue },
      {
        onSuccess: () => setConfirmed(false),
        onError: (err: unknown) =>
          setError(err instanceof Error ? err.message : "Не вдалося зберегти."),
      },
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={() => router.back()}
            style={styles.iconBtn}
            testID="lab-indicator-back"
          >
            <ArrowLeft size={20} color={colors.ink} />
          </Pressable>
          <Text style={styles.title}>{indicator?.label ?? "Показник"}</Text>
        </View>

        {isLoading || indicator === null ? (
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
            showsVerticalScrollIndicator={false}
            testID="lab-indicator-screen"
          >
            <View style={styles.latestCard}>
              <Text style={styles.latestValue}>
                {latest !== null ? latest.value : "—"}
                {latest !== null && (
                  <Text style={styles.latestUnit}> {indicator.unit}</Text>
                )}
              </Text>
              <Text style={styles.latestDate}>
                {latest !== null
                  ? `Оновлено ${formatDateShort(latest.measured_at)}`
                  : "Ще немає значень"}
              </Text>
            </View>

            {chronological.length > 1 && (
              <View style={styles.chartCard} testID="indicator-chart">
                <View
                  style={styles.chartArea}
                  onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
                >
                  {chartWidth > 0 && (
                    <IndicatorTrendChart
                      points={chronological}
                      width={chartWidth}
                    />
                  )}
                </View>
              </View>
            )}

            {!isDoctor && draftValue !== null && (
              <View style={styles.addCard}>
                <Text style={styles.addLabel}>Нове значення</Text>
                <View style={styles.draftCenter}>
                  <Text style={styles.draftValue}>
                    {draftValue.toFixed(decimalsOf(indicator))}
                  </Text>
                  <Text style={styles.draftUnit}> {indicator.unit}</Text>
                </View>
                <IndicatorRuler
                  testID="indicator-value-ruler"
                  value={draftValue}
                  onChange={setDraftValue}
                  min={indicator.min_value}
                  max={indicator.max_value}
                  step={indicator.step}
                />
                <Text style={styles.rulerHint}>
                  Проведіть пальцем вліво/вправо, щоб змінити значення
                </Text>

                <View style={styles.consentRow}>
                  <Pressable
                    testID="indicator-consent-checkbox"
                    onPress={() => setConfirmed((prev) => !prev)}
                    style={[
                      styles.checkbox,
                      confirmed && styles.checkboxChecked,
                    ]}
                  >
                    {confirmed && (
                      <Check size={13} color="#FFFFFF" strokeWidth={3} />
                    )}
                  </Pressable>
                  <Text
                    style={styles.consentText}
                    onPress={() => setConfirmed((prev) => !prev)}
                  >
                    {CONSENT_PREFIX}
                    <Text
                      style={styles.consentLink}
                      onPress={() =>
                        router.push("/patient-consent?review=1" as never)
                      }
                    >
                      {CONSENT_LINK_LABEL}
                    </Text>
                    .
                  </Text>
                </View>

                <Pressable
                  testID="indicator-value-save"
                  onPress={handleAdd}
                  disabled={patientSide.addValue.isPending || !confirmed}
                  style={({ pressed }) => [
                    styles.addButton,
                    !confirmed && styles.addButtonDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  {patientSide.addValue.isPending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.addButtonText}>Зберегти</Text>
                  )}
                </Pressable>
                {error !== null && (
                  <Text style={styles.error} testID="indicator-value-error">
                    {error}
                  </Text>
                )}
              </View>
            )}

            {history.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>ІСТОРІЯ</Text>
                <View style={styles.historyCard}>
                  {history.map((v, i) => (
                    <View
                      key={v.id}
                      style={[
                        styles.historyRow,
                        i > 0 && styles.historyRowBorder,
                      ]}
                    >
                      <Text style={styles.historyDate}>
                        {formatDateShort(v.measured_at)}
                      </Text>
                      <Text style={styles.historyValue}>
                        {v.value} {indicator.unit}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  screen: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, fontFamily: fonts.serif, fontSize: 20, color: colors.ink },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20 },
  latestCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: 24,
    alignItems: "center",
    marginBottom: 14,
    ...cardShadow,
  },
  latestValue: {
    fontFamily: fonts.serif,
    fontSize: 40,
    color: colors.navyDeep,
  },
  latestUnit: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.sub,
  },
  latestDate: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.sub,
    marginTop: 6,
  },
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 14,
    marginBottom: 14,
    ...cardShadow,
  },
  chartArea: { width: "100%" },
  addCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 16,
    marginBottom: 14,
    ...cardShadow,
  },
  addLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.sub,
    marginBottom: 10,
  },
  draftCenter: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    marginBottom: 8,
  },
  draftValue: {
    fontFamily: fonts.serif,
    fontSize: 40,
    color: colors.navyDeep,
  },
  draftUnit: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.sub,
  },
  rulerHint: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: colors.sub,
    textAlign: "center",
    marginTop: 6,
  },
  consentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 18,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.6,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  consentText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.sub,
  },
  consentLink: {
    fontFamily: fonts.semibold,
    color: colors.navy,
    textDecorationLine: "underline",
  },
  addButton: {
    height: 48,
    borderRadius: radius.button,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    fontFamily: fonts.bold,
    fontSize: 14.5,
    color: "#FFFFFF",
  },
  error: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.amber,
    marginTop: 10,
  },
  sectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.sub,
    marginBottom: 10,
  },
  historyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingHorizontal: 16,
    ...cardShadow,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
  },
  historyRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  historyDate: {
    fontFamily: fonts.medium,
    fontSize: 13.5,
    color: colors.sub,
  },
  historyValue: {
    fontFamily: fonts.semibold,
    fontSize: 14.5,
    color: colors.ink,
  },
  pressed: { opacity: 0.85 },
});
