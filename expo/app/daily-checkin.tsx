import { useMutation } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { ArrowLeft, Check } from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, cardShadow, fonts, radius, softShadow } from "@/constants/theme";
import { usePatientHome } from "@/hooks/usePatientHome";
import { supabase } from "@/lib/supabase";
import { skipTodaysDaily } from "@/lib/notifications";

const THUMB_SIZE = 32;

const SYMPTOMS = ["Немає", "Нудота", "Головний біль", "Втома", "Запор"] as const;

const DUPLICATE_CHECKIN = "__duplicate_checkin__";

function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Counts consecutive daily check-in days for a cycle ending today. */
function countStreak(dates: string[]): number {
  const set = new Set(dates);
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    if (!set.has(`${y}-${m}-${d}`)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function lightTap() {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

interface GradientSliderProps {
  value: number;
  onChange: (value: number) => void;
  testID?: string;
}

/** 1–10 slider with navy→teal gradient fill and a white thumb with teal border. */
function GradientSlider({ value, onChange, testID }: GradientSliderProps) {
  const [trackWidth, setTrackWidth] = useState<number>(0);
  const trackWidthRef = useRef<number>(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef<number>(value);
  valueRef.current = value;

  const updateFromX = useCallback((x: number) => {
    const w = trackWidthRef.current;
    if (w <= 0) return;
    const ratio = Math.min(Math.max(x / w, 0), 1);
    const next = Math.round(ratio * 9) + 1;
    if (next !== valueRef.current) {
      onChangeRef.current(next);
      lightTap();
    }
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => updateFromX(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => updateFromX(evt.nativeEvent.locationX),
    }),
  ).current;

  const ratio = (value - 1) / 9;
  const thumbLeft = Math.max(
    0,
    Math.min(ratio * trackWidth - THUMB_SIZE / 2, trackWidth - THUMB_SIZE),
  );
  const fillWidth = Math.max(ratio * trackWidth, THUMB_SIZE / 2);

  return (
    <View
      style={sliderStyles.hitArea}
      onLayout={(e) => {
        setTrackWidth(e.nativeEvent.layout.width);
        trackWidthRef.current = e.nativeEvent.layout.width;
      }}
      {...panResponder.panHandlers}
      testID={testID}
    >
      <View style={sliderStyles.track} pointerEvents="none">
        <LinearGradient
          colors={[colors.blue, colors.teal]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[sliderStyles.fill, { width: fillWidth }]}
        />
      </View>
      {trackWidth > 0 && (
        <View
          style={[sliderStyles.thumb, { left: thumbLeft }]}
          pointerEvents="none"
        />
      )}
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  hitArea: {
    height: 44,
    justifyContent: "center",
  },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.hairline,
    overflow: "hidden",
  },
  fill: {
    height: 10,
    borderRadius: 5,
  },
  thumb: {
    position: "absolute",
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: "#FFFFFF",
    borderWidth: 4,
    borderColor: colors.teal,
    ...cardShadow,
  },
});

function StepProgressBar({ step }: { step: number }) {
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressTrack}>
        <LinearGradient
          colors={[colors.blue, colors.teal]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.progressFill, { width: `${(step / 5) * 100}%` }]}
        />
      </View>
      <Text style={styles.progressLabel}>{step}/5</Text>
    </View>
  );
}

function SliderLabels({ left, right }: { left: string; right: string }) {
  return (
    <View style={styles.sliderLabels}>
      <Text style={styles.sliderLabelText}>{left}</Text>
      <Text style={styles.sliderLabelText}>{right}</Text>
    </View>
  );
}

export default function DailyCheckinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, cycle, isLoading } = usePatientHome();

  const [step, setStep] = useState<number>(1);
  const [wellbeing, setWellbeing] = useState<number>(8);
  const [appetite, setAppetite] = useState<number>(5);
  const [foodNoise, setFoodNoise] = useState<number>(5);
  const [energy, setEnergy] = useState<number>(7);
  const [sleep, setSleep] = useState<number>(7);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [note, setNote] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [streak, setStreak] = useState<number>(1);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isDuplicate, setIsDuplicate] = useState<boolean>(false);

  const toggleSymptom = (symptom: string) => {
    lightTap();
    setSymptoms((prev) => {
      if (symptom === "Немає") {
        return prev.includes("Немає") ? [] : ["Немає"];
      }
      const withoutNone = prev.filter((s) => s !== "Немає");
      return withoutNone.includes(symptom)
        ? withoutNone.filter((s) => s !== symptom)
        : [...withoutNone, symptom];
    });
  };

  const saveCheckin = useMutation({
    mutationFn: async (): Promise<number> => {
      if (cycle === null) {
        throw new Error("Активний цикл не знайдено.");
      }
      if (profile === null) {
        throw new Error("Профіль пацієнта не знайдено.");
      }
      const { error: insertError } = await supabase
        .from("daily_checkins")
        .insert({
          therapy_cycle_id: cycle.id,
          patient_id: profile.id,
          checkin_date: todayISO(),
          wellbeing,
          appetite,
          food_noise: foodNoise,
          energy,
          sleep,
          nausea: symptoms.includes("Нудота"),
          weakness: symptoms.includes("Втома"),
          notes: note.trim().length > 0 ? note.trim() : null,
        });
      if (insertError) {
        if (insertError.code === "23505") {
          throw new Error(DUPLICATE_CHECKIN);
        }
        throw new Error(insertError.message);
      }
      const { data: rows, error: streakError } = await supabase
        .from("daily_checkins")
        .select("checkin_date")
        .eq("therapy_cycle_id", cycle.id)
        .order("checkin_date", { ascending: false })
        .limit(60);
      if (streakError) {
        return 1;
      }
      const dates = (rows ?? [])
        .map((r) => (r.checkin_date as string | null) ?? "")
        .filter((d) => d.length > 0);
      return Math.max(countStreak(dates), 1);
    },
    onSuccess: (streakCount: number) => {
      setStreak(streakCount);
      setIsSaved(true);
      // Today's job is done — drop the pending reminder so it stays quiet.
      void skipTodaysDaily();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (message === DUPLICATE_CHECKIN) {
        setIsDuplicate(true);
        setIsSaved(true);
        return;
      }
      console.log("[daily-checkin] save failed:", message);
      setError(message);
    },
  });

  const goNext = () => {
    lightTap();
    setStep((prev) => Math.min(prev + 1, 5));
  };

  const goBack = () => {
    lightTap();
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleFinish = () => {
    setError(null);
    saveCheckin.mutate();
  };

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  if (isSaved) {
    return (
      <View
        style={[styles.screen, styles.successWrap, { paddingTop: insets.top }]}
        testID="checkin-success"
      >
        <View style={styles.successIcon}>
          <Check size={44} color={colors.tealDeep} strokeWidth={2.4} />
        </View>
        <Text style={styles.successTitle}>
          {isDuplicate ? "Ви вже зробили чек-ін сьогодні 👍" : "Збережено!"}
        </Text>
        {!isDuplicate && (
          <>
            <Text style={styles.successText}>
              Дякуємо! Дані надіслано лікарю. Побачимось завтра 👋
            </Text>
            <View style={styles.streakPill} testID="streak-pill">
              <Text style={styles.streakText}>🔥 {streak} днів поспіль</Text>
            </View>
          </>
        )}
        <Pressable
          testID="checkin-home-button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.homeButtonWrap, pressed && styles.pressed]}
        >
          <LinearGradient
            colors={[colors.navyDeep, colors.navy]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientButton}
          >
            <Text style={styles.gradientButtonText}>На головну</Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={[styles.screen, { paddingTop: insets.top + 12 }]}
        testID="daily-checkin-screen"
      >
        <View style={styles.header}>
          <Pressable
            testID="checkin-close-button"
            onPress={() => router.back()}
            style={styles.back}
            hitSlop={12}
          >
            <ArrowLeft size={22} color={colors.ink} />
          </Pressable>
          <View style={styles.headerBar}>
            <StepProgressBar step={step} />
          </View>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 1 && (
            <View testID="checkin-step-1">
              <Text style={styles.title}>Як ви почуваєтесь сьогодні?</Text>
              <View style={styles.card}>
                <Text style={styles.bigNumber}>{wellbeing}</Text>
                <GradientSlider
                  value={wellbeing}
                  onChange={setWellbeing}
                  testID="wellbeing-slider"
                />
                <SliderLabels left="Погано" right="Чудово" />
              </View>
            </View>
          )}

          {step === 2 && (
            <View testID="checkin-step-2">
              <Text style={styles.title}>Рівень апетиту сьогодні?</Text>
              <View style={styles.card}>
                <Text style={styles.bigNumber}>{appetite}</Text>
                <GradientSlider
                  value={appetite}
                  onChange={setAppetite}
                  testID="appetite-slider"
                />
                <SliderLabels left="Немає" right="Сильний" />
              </View>
            </View>
          )}

          {step === 3 && (
            <View testID="checkin-step-3">
              <Text style={styles.title}>Харчовий шум</Text>
              <Text style={styles.subtitle}>
                Наскільки нав'язливі думки про їжу протягом дня
              </Text>
              <View style={styles.card}>
                <Text style={styles.bigNumber}>{foodNoise}</Text>
                <GradientSlider
                  value={foodNoise}
                  onChange={setFoodNoise}
                  testID="food-noise-slider"
                />
                <SliderLabels left="Тихо" right="Нав'язливо" />
              </View>
            </View>
          )}

          {step === 4 && (
            <View testID="checkin-step-4">
              <Text style={styles.title}>Енергія та сон</Text>
              <View style={styles.card}>
                <View style={styles.dualRow}>
                  <Text style={styles.dualLabel}>Рівень енергії</Text>
                  <Text style={styles.dualValue}>{energy}</Text>
                </View>
                <GradientSlider
                  value={energy}
                  onChange={setEnergy}
                  testID="energy-slider"
                />
              </View>
              <View style={styles.card}>
                <View style={styles.dualRow}>
                  <Text style={styles.dualLabel}>Якість сну</Text>
                  <Text style={styles.dualValue}>{sleep}</Text>
                </View>
                <GradientSlider
                  value={sleep}
                  onChange={setSleep}
                  testID="sleep-slider"
                />
              </View>
            </View>
          )}

          {step === 5 && (
            <View testID="checkin-step-5">
              <Text style={styles.title}>Чи були симптоми?</Text>
              <Text style={styles.subtitle}>Оберіть усе, що відчували</Text>
              <View style={styles.chipsWrap}>
                {SYMPTOMS.map((symptom) => {
                  const selected = symptoms.includes(symptom);
                  return (
                    <Pressable
                      key={symptom}
                      testID={`symptom-chip-${symptom}`}
                      onPress={() => toggleSymptom(symptom)}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selected && styles.chipTextSelected,
                        ]}
                      >
                        {symptom}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                testID="checkin-note-input"
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="Додати нотатку лікарю… (опційно)"
                placeholderTextColor={colors.sub}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          )}

          {error !== null && (
            <Text style={styles.error} testID="checkin-error">
              {error}
            </Text>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          {step === 1 ? (
            <Pressable
              testID="checkin-next-button"
              onPress={goNext}
              style={({ pressed }) => [styles.flex1, pressed && styles.pressed]}
            >
              <LinearGradient
                colors={[colors.navyDeep, colors.navy]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientButton}
              >
                <Text style={styles.gradientButtonText}>Далі →</Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <>
              <Pressable
                testID="checkin-back-button"
                onPress={goBack}
                style={({ pressed }) => [
                  styles.backButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.backButtonText}>Назад</Text>
              </Pressable>
              {step < 5 ? (
                <Pressable
                  testID="checkin-next-button"
                  onPress={goNext}
                  style={({ pressed }) => [
                    styles.flex2,
                    pressed && styles.pressed,
                  ]}
                >
                  <LinearGradient
                    colors={[colors.navyDeep, colors.navy]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.gradientButton}
                  >
                    <Text style={styles.gradientButtonText}>Далі →</Text>
                  </LinearGradient>
                </Pressable>
              ) : (
                <Pressable
                  testID="checkin-finish-button"
                  onPress={handleFinish}
                  disabled={saveCheckin.isPending}
                  style={({ pressed }) => [
                    styles.flex2,
                    pressed && styles.pressed,
                  ]}
                >
                  <LinearGradient
                    colors={[colors.tealDeep, colors.teal]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.gradientButton}
                  >
                    {saveCheckin.isPending ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.gradientButtonText}>✓ Завершити</Text>
                    )}
                  </LinearGradient>
                </Pressable>
              )}
            </>
          )}
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
  flex1: {
    flex: 1,
  },
  flex2: {
    flex: 2,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 24,
  },
  headerBar: {
    flex: 1,
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
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.hairline,
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
  },
  progressLabel: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.sub,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 14.5,
    color: colors.sub,
    lineHeight: 21,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingHorizontal: 20,
    paddingVertical: 24,
    marginTop: 16,
    ...cardShadow,
  },
  bigNumber: {
    fontFamily: fonts.serif,
    fontSize: 64,
    color: colors.navyDeep,
    textAlign: "center",
    marginBottom: 12,
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  sliderLabelText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.sub,
  },
  dualRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  dualLabel: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  dualValue: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.navyDeep,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    ...softShadow,
  },
  chipSelected: {
    backgroundColor: colors.navy,
  },
  chipText: {
    fontFamily: fonts.semibold,
    fontSize: 14.5,
    color: colors.ink,
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  noteInput: {
    marginTop: 20,
    minHeight: 96,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingTop: 14,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
    ...softShadow,
  },
  error: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.amber,
    marginTop: 16,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  gradientButton: {
    height: 54,
    borderRadius: radius.button,
    alignItems: "center",
    justifyContent: "center",
  },
  gradientButtonText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
  },
  backButton: {
    flex: 1,
    height: 54,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    ...softShadow,
  },
  backButtonText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.sub,
  },
  successWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  successTitle: {
    fontFamily: fonts.serif,
    fontSize: 30,
    color: colors.ink,
    marginBottom: 10,
  },
  successText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.sub,
    textAlign: "center",
    lineHeight: 23,
    marginBottom: 20,
  },
  streakPill: {
    backgroundColor: colors.goldTint,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginBottom: 32,
  },
  streakText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.gold,
  },
  homeButtonWrap: {
    alignSelf: "stretch",
  },
  pressed: {
    opacity: 0.85,
  },
});
