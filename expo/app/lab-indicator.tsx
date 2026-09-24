import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import React, { useState } from "react";
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

import IndicatorTrendChart from "@/components/IndicatorTrendChart";
import { cardShadow, colors, fonts, radius, softShadow } from "@/constants/theme";
import {
  useLabIndicatorValuesForPatient,
  useLabIndicatorsCatalog,
  usePatientLabIndicatorValues,
} from "@/hooks/useLabIndicators";
import { useAuth } from "@/providers/AuthProvider";
import { formatDateShort } from "@/utils/dates";

/** "5.4" / "5,4" → 5.4; rejects anything else. */
function parseDecimal(text: string): number | null {
  const value = parseFloat(text.replace(",", "."));
  return Number.isFinite(value) ? value : null;
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

  const [inputValue, setInputValue] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = (): void => {
    if (indicator === null) return;
    const num = parseDecimal(inputValue);
    if (num === null) {
      setError("Введіть число.");
      return;
    }
    setError(null);
    patientSide.addValue.mutate(
      { indicatorId: indicator.id, value: num },
      {
        onSuccess: () => setInputValue(""),
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

            {!isDoctor && (
              <View style={styles.addCard}>
                <Text style={styles.addLabel}>
                  Нове значення ({indicator.unit || "число"})
                </Text>
                <View style={styles.addRow}>
                  <TextInput
                    testID="indicator-value-input"
                    style={styles.addInput}
                    value={inputValue}
                    onChangeText={setInputValue}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.sub}
                  />
                  <Pressable
                    testID="indicator-value-save"
                    onPress={handleAdd}
                    disabled={patientSide.addValue.isPending}
                    style={({ pressed }) => [
                      styles.addButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    {patientSide.addValue.isPending ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.addButtonText}>Зберегти</Text>
                    )}
                  </Pressable>
                </View>
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
  addRow: {
    flexDirection: "row",
    gap: 10,
  },
  addInput: {
    flex: 1,
    height: 48,
    borderRadius: radius.button,
    backgroundColor: colors.paper,
    paddingHorizontal: 16,
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.ink,
    ...softShadow,
  },
  addButton: {
    paddingHorizontal: 20,
    height: 48,
    borderRadius: radius.button,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
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
