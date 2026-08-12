import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { ArrowLeft, Camera, Check } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
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

import GradientSlider from "@/components/GradientSlider";
import WeightRuler from "@/components/WeightRuler";
import { colors, cardShadow, fonts, radius, softShadow } from "@/constants/theme";
import { usePatientHome } from "@/hooks/usePatientHome";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import type { PhotoAngle } from "@/types/db";
import { base64ToBytes } from "@/utils/base64";
import { daysSince, todayISO } from "@/utils/dates";
import { formatKg } from "@/utils/format";

const SYMPTOMS = ["Немає", "Нудота", "Втома", "Головний біль", "Запор"] as const;

const ANGLES: { key: PhotoAngle; label: string }[] = [
  { key: "front", label: "Спереду" },
  { key: "side", label: "Збоку" },
  { key: "back", label: "Ззаду" },
];

interface PickedPhoto {
  uri: string;
  base64: string;
}

function lightTap() {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

/** Formats a signed kg delta: -1.5 → "−1,5". */
function formatSignedKg(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatKg(Math.abs(value))}`;
}

function parseMeasure(text: string): number | null {
  const cleaned = text.replace(",", ".").trim();
  if (cleaned.length === 0) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
}

export default function WeeklyCheckinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const { profile, cycle, latestCheckin, isLoading } = usePatientHome();

  const weekNumber =
    cycle?.start_date != null
      ? Math.max(Math.ceil(daysSince(cycle.start_date) / 7), 1)
      : 1;

  const prevWeight = latestCheckin?.weight_kg ?? null;

  const [step, setStep] = useState<number>(1);
  const [weight, setWeight] = useState<number>(prevWeight ?? 80.0);
  const [weightReady, setWeightReady] = useState<boolean>(false);
  const [waist, setWaist] = useState<string>("");
  const [hips, setHips] = useState<string>("");
  const [abdomen, setAbdomen] = useState<string>("");
  const [photos, setPhotos] = useState<Record<PhotoAngle, PickedPhoto | null>>({
    front: null,
    side: null,
    back: null,
  });
  const [wellbeing, setWellbeing] = useState<number>(7);
  const [energy, setEnergy] = useState<number>(7);
  const [appetite, setAppetite] = useState<number>(5);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [note, setNote] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isDuplicate, setIsDuplicate] = useState<boolean>(false);

  // Initialize weight from previous weekly once data loads
  if (!weightReady && !isLoading) {
    setWeightReady(true);
    if (prevWeight !== null) {
      setWeight(prevWeight);
    }
  }

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

  const pickPhoto = async (angle: PhotoAngle) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.7,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset?.uri && asset.base64) {
        lightTap();
        setPhotos((prev) => ({
          ...prev,
          [angle]: { uri: asset.uri, base64: asset.base64 as string },
        }));
      }
    } catch (err) {
      console.log("[weekly-checkin] photo pick skipped:", err);
    }
  };

  const saveWeekly = useMutation({
    mutationFn: async (): Promise<{
      weekDelta: number | null;
      cycleDelta: number | null;
      isRepeat: boolean;
    }> => {
      if (cycle === null) {
        throw new Error("Активний цикл не знайдено.");
      }
      if (profile === null) {
        throw new Error("Профіль пацієнта не знайдено.");
      }

      // A patient can now log more than one weekly check-in for the same
      // week (e.g. someone who wants to track more closely). We just note
      // whether this is a repeat entry for the success screen — it no
      // longer blocks the save.
      const { count: existingCount } = await supabase
        .from("weekly_checkins")
        .select("id", { count: "exact", head: true })
        .eq("therapy_cycle_id", cycle.id)
        .eq("week_number", weekNumber);
      const isRepeat = (existingCount ?? 0) > 0;

      const checkinDate = todayISO();
      const selectedSymptoms = symptoms.includes("Немає") ? [] : symptoms;

      const { data: inserted, error: insertError } = await supabase
        .from("weekly_checkins")
        .insert({
          therapy_cycle_id: cycle.id,
          patient_id: profile.id,
          week_number: weekNumber,
          checkin_date: checkinDate,
          weight_kg: weight,
          waist_cm: parseMeasure(waist),
          hips_cm: parseMeasure(hips),
          abdomen_cm: parseMeasure(abdomen),
          wellbeing,
          energy,
          appetite,
          food_noise: null,
          symptoms: selectedSymptoms,
          symptoms_notes: note.trim().length > 0 ? note.trim() : null,
        })
        .select("id")
        .single();
      if (insertError) {
        throw new Error(insertError.message);
      }

      const weeklyCheckinId = (inserted as { id: string }).id;

      // Upload photos — skip gracefully on any failure
      for (const { key } of ANGLES) {
        const photo = photos[key];
        if (photo === null || userId === null) continue;
        try {
          const path = `${userId}/${cycle.id}/${weeklyCheckinId}/${key}.jpg`;
          const bytes = base64ToBytes(photo.base64);
          const { error: uploadError } = await supabase.storage
            .from("progress-photos")
            .upload(path, bytes.buffer as ArrayBuffer, {
              contentType: "image/jpeg",
              upsert: true,
            });
          if (uploadError) {
            console.log("[weekly-checkin] upload skipped:", uploadError.message);
            continue;
          }
          // The "progress-photos" bucket is private (contains sensitive
          // patient body photos), so we store the storage path here, not a
          // public URL. Readers (patient progress screen, doctor detail
          // screen) generate a short-lived signed URL from this path.
          const { error: photoRowError } = await supabase
            .from("progress_photos")
            .insert({
              patient_id: profile.id,
              therapy_cycle_id: cycle.id,
              weekly_checkin_id: weeklyCheckinId,
              file_url: path,
              angle: key,
              photo_date: checkinDate,
            });
          if (photoRowError) {
            console.log(
              "[weekly-checkin] photo row skipped:",
              photoRowError.message,
            );
          }
        } catch (err) {
          console.log("[weekly-checkin] photo upload error:", err);
        }
      }

      return {
        weekDelta: prevWeight !== null ? weight - prevWeight : null,
        cycleDelta: cycle.goal_start !== null ? weight - cycle.goal_start : null,
        isRepeat,
      };
    },
    onSuccess: (result) => {
      setDeltas(result);
      setIsDuplicate(result.isRepeat);
      setIsSaved(true);
      queryClient.invalidateQueries({ queryKey: ["weekly-checkins"] });
      queryClient.invalidateQueries({ queryKey: ["latest-checkin"] });
      queryClient.invalidateQueries({ queryKey: ["progress-photos"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.log("[weekly-checkin] save failed:", message);
      setError(message);
    },
  });

  const [deltas, setDeltas] = useState<{
    weekDelta: number | null;
    cycleDelta: number | null;
  }>({ weekDelta: null, cycleDelta: null });

  const goNext = () => {
    lightTap();
    setStep((prev) => Math.min(prev + 1, 5));
  };

  const goBack = () => {
    lightTap();
    setStep((prev) => Math.max(prev - 1, 1));
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
        testID="weekly-success"
      >
        <View style={styles.successIcon}>
          <Check size={40} color={colors.tealDeep} strokeWidth={2.4} />
        </View>
        <Text style={styles.successTitle}>
          {isDuplicate ? "Повторний чек-ін збережено!" : "Тиждень зафіксовано!"}
        </Text>
        <Text style={styles.successText}>
          {isDuplicate
            ? "Це вже не перший запис за цей тиждень — лікар побачить обидва."
            : "Прогрес оновлено. Лікар побачить нові дані та фото."}
        </Text>
        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, styles.tealText]}>
              {deltas.weekDelta !== null
                ? `${formatSignedKg(deltas.weekDelta)} кг`
                : "—"}
            </Text>
            <Text style={styles.statLabel}>за тиждень</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, styles.navyText]}>
              {deltas.cycleDelta !== null
                ? `${formatSignedKg(deltas.cycleDelta)} кг`
                : "—"}
            </Text>
            <Text style={styles.statLabel}>за цикл</Text>
          </View>
        </View>
        <Pressable
          testID="weekly-to-progress-button"
          onPress={() => router.replace("/(patient)/progress")}
          style={({ pressed }) => [styles.fullWidth, pressed && styles.pressed]}
        >
          <LinearGradient
            colors={[colors.tealDeep, colors.teal]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientButton}
          >
            <Text style={styles.gradientButtonText}>До прогресу</Text>
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
        testID="weekly-checkin-screen"
      >
        <View style={styles.header}>
          <Pressable
            testID="weekly-close-button"
            onPress={() => router.back()}
            style={styles.back}
            hitSlop={12}
          >
            <ArrowLeft size={22} color={colors.ink} />
          </Pressable>
          <View style={styles.headerBar}>
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
          </View>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.contextLabel}>WEEKLY · ТИЖДЕНЬ {weekNumber}</Text>

          {step === 1 && (
            <View testID="weekly-step-1">
              <Text style={styles.title}>Ваша вага цього тижня?</Text>
              <View style={styles.card}>
                <View style={styles.weightCenter}>
                  <Text style={styles.weightNumber}>
                    {weight.toFixed(1).replace(".", ",")}
                  </Text>
                  <Text style={styles.weightUnit}>кг</Text>
                </View>
                <WeightRuler
                  testID="weight-ruler"
                  value={weight}
                  onChange={setWeight}
                />
                <Text style={styles.rulerHint}>
                  Проведіть пальцем вліво/вправо, щоб змінити вагу
                </Text>
                {prevWeight !== null && (
                  <Text style={styles.prevWeekText} testID="prev-week-line">
                    Минулого тижня — {formatKg(prevWeight)} кг ·{" "}
                    {formatSignedKg(weight - prevWeight)} кг
                  </Text>
                )}
              </View>
            </View>
          )}

          {step === 2 && (
            <View testID="weekly-step-2">
              <Text style={styles.title}>Заміри тіла</Text>
              <Text style={styles.subtitle}>
                Необовʼязково, але корисно для динаміки.
              </Text>
              {[
                { label: "Талія", value: waist, set: setWaist, id: "waist" },
                { label: "Стегна", value: hips, set: setHips, id: "hips" },
                { label: "Живіт", value: abdomen, set: setAbdomen, id: "abdomen" },
              ].map((row) => (
                <View key={row.id} style={styles.measureRow}>
                  <Text style={styles.measureLabel}>{row.label}</Text>
                  <TextInput
                    testID={`measure-${row.id}`}
                    style={styles.measureInput}
                    value={row.value}
                    onChangeText={row.set}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor={colors.sub}
                  />
                  <Text style={styles.measureUnit}>см</Text>
                </View>
              ))}
            </View>
          )}

          {step === 3 && (
            <View testID="weekly-step-3">
              <Text style={styles.title}>Фото прогресу</Text>
              <Text style={styles.subtitle}>
                Три ракурси. Приватні — бачите ви та лікар.
              </Text>
              <View style={styles.photoRow}>
                {ANGLES.map(({ key, label }) => {
                  const picked = photos[key];
                  return (
                    <Pressable
                      key={key}
                      testID={`photo-slot-${key}`}
                      onPress={() => pickPhoto(key)}
                      style={styles.photoSlotWrap}
                    >
                      <View
                        style={[
                          styles.photoSlot,
                          picked !== null && styles.photoSlotFilled,
                        ]}
                      >
                        {picked !== null ? (
                          <>
                            <Image
                              source={{ uri: picked.uri }}
                              style={styles.photoImage}
                              resizeMode="cover"
                            />
                            <View style={styles.photoCheck}>
                              <Check size={12} color="#FFFFFF" strokeWidth={3} />
                            </View>
                          </>
                        ) : (
                          <Camera
                            size={26}
                            color={colors.sub}
                            strokeWidth={1.6}
                          />
                        )}
                      </View>
                      <Text style={styles.photoLabel}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.tipBox}>
                <Text style={styles.tipText}>
                  💡 Однакове освітлення й поза щотижня — так порівняння
                  найточніше.
                </Text>
              </View>
            </View>
          )}

          {step === 4 && (
            <View testID="weekly-step-4">
              <Text style={styles.title}>Як минув тиждень?</Text>
              {[
                {
                  label: "Самопочуття",
                  value: wellbeing,
                  set: setWellbeing,
                  id: "wellbeing",
                },
                { label: "Енергія", value: energy, set: setEnergy, id: "energy" },
                {
                  label: "Апетит",
                  value: appetite,
                  set: setAppetite,
                  id: "appetite",
                },
              ].map((row) => (
                <View key={row.id} style={styles.card}>
                  <View style={styles.sliderHeader}>
                    <Text style={styles.sliderLabel}>{row.label}</Text>
                    <Text style={styles.sliderValue}>{row.value}</Text>
                  </View>
                  <GradientSlider
                    value={row.value}
                    onChange={row.set}
                    testID={`weekly-${row.id}-slider`}
                  />
                </View>
              ))}
            </View>
          )}

          {step === 5 && (
            <View testID="weekly-step-5">
              <Text style={styles.title}>Симптоми за тиждень?</Text>
              <Text style={styles.subtitle}>Оберіть усе, що відчували.</Text>
              <View style={styles.chipsWrap}>
                {SYMPTOMS.map((symptom) => {
                  const selected = symptoms.includes(symptom);
                  return (
                    <Pressable
                      key={symptom}
                      testID={`weekly-chip-${symptom}`}
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
                testID="weekly-note-input"
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="Нотатка лікарю… (опційно)"
                placeholderTextColor={colors.sub}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          )}

          {error !== null && (
            <Text style={styles.error} testID="weekly-error">
              {error}
            </Text>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          {step === 1 ? (
            <Pressable
              testID="weekly-next-button"
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
                testID="weekly-back-button"
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
                  testID="weekly-next-button"
                  onPress={goNext}
                  style={({ pressed }) => [styles.flex2, pressed && styles.pressed]}
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
                  testID="weekly-finish-button"
                  onPress={() => {
                    setError(null);
                    saveWeekly.mutate();
                  }}
                  disabled={saveWeekly.isPending}
                  style={({ pressed }) => [styles.flex2, pressed && styles.pressed]}
                >
                  <LinearGradient
                    colors={[colors.tealDeep, colors.teal]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.gradientButton}
                  >
                    {saveWeekly.isPending ? (
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
  fullWidth: {
    alignSelf: "stretch",
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
    paddingTop: 24,
    paddingBottom: 24,
  },
  contextLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.gold,
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.navyDeep,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.sub,
    lineHeight: 21,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingHorizontal: 20,
    paddingVertical: 24,
    marginTop: 14,
    ...cardShadow,
  },
  weightCenter: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 6,
  },
  weightNumber: {
    fontFamily: fonts.serif,
    fontSize: 52,
    color: colors.navyDeep,
  },
  weightUnit: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.sub,
  },
  rulerHint: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: colors.sub,
    textAlign: "center",
    marginTop: 6,
  },
  prevWeekText: {
    fontFamily: fonts.semibold,
    fontSize: 13.5,
    color: colors.tealDeep,
    textAlign: "center",
    marginTop: 16,
  },
  measureRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginTop: 12,
    ...softShadow,
  },
  measureLabel: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  measureInput: {
    width: 80,
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.navyDeep,
    textAlign: "right",
    paddingVertical: 0,
  },
  measureUnit: {
    fontFamily: fonts.medium,
    fontSize: 13.5,
    color: colors.sub,
    marginLeft: 8,
  },
  photoRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },
  photoSlotWrap: {
    flex: 1,
    alignItems: "center",
  },
  photoSlot: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 14,
    borderWidth: 1.6,
    borderStyle: "dashed",
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photoSlotFilled: {
    borderStyle: "solid",
    borderColor: colors.teal,
  },
  photoImage: {
    ...StyleSheet.absoluteFillObject,
  },
  photoCheck: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  photoLabel: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.sub,
    marginTop: 8,
  },
  tipBox: {
    backgroundColor: colors.mint,
    borderRadius: 14,
    padding: 14,
    marginTop: 18,
  },
  tipText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.tealDeep,
    lineHeight: 19,
  },
  sliderHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sliderLabel: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  sliderValue: {
    fontFamily: fonts.serif,
    fontSize: 26,
    color: colors.navyDeep,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
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
    marginTop: 18,
    minHeight: 96,
    borderRadius: 13,
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
    height: 48,
    borderRadius: 15,
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
    height: 48,
    borderRadius: 15,
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
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  successTitle: {
    fontFamily: fonts.serif,
    fontSize: 26,
    color: colors.ink,
    marginBottom: 10,
    textAlign: "center",
  },
  successText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.sub,
    textAlign: "center",
    lineHeight: 23,
    marginBottom: 24,
  },
  statRow: {
    flexDirection: "row",
    gap: 12,
    alignSelf: "stretch",
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    ...softShadow,
  },
  statValue: {
    fontFamily: fonts.serif,
    fontSize: 22,
  },
  tealText: {
    color: colors.tealDeep,
  },
  navyText: {
    color: colors.navy,
  },
  statLabel: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.sub,
    marginTop: 4,
  },
  pressed: {
    opacity: 0.85,
  },
});
