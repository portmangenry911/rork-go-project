import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import * as Print from "expo-print";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Syringe,
  MessageCircle,
  X,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from "react-native-svg";

import AvatarInitials from "@/components/AvatarInitials";
import { colors, cardShadow, fonts, radius, softShadow } from "@/constants/theme";
import { useDoctorHome } from "@/hooks/useDoctorHome";
import { supabase } from "@/lib/supabase";
import type {
  DailyCheckin,
  PatientProfile,
  ProgressPhoto,
  TherapyCycle,
  WeeklyCheckinFull,
} from "@/types/db";
import { dateParts, daysSince, formatDateShort, todayISO } from "@/utils/dates";
import { formatKg } from "@/utils/format";
import { buildReportHtml } from "@/utils/report-html";

interface FeedItem {
  kind: "daily" | "weekly";
  id: string;
  date: string;
  summary: string;
}

function ageFrom(dateOfBirth: string): number {
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Compact teal weight line chart for the doctor's patient detail view. */
function WeightChart({
  points,
  width,
}: {
  points: { value: number }[];
  width: number;
}) {
  const H = 130;
  const PADX = 8;
  const PADT = 14;
  const PADB = 10;

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const range = max - min;
  min -= range * 0.12;
  max += range * 0.12;

  const xFor = (i: number): number =>
    points.length === 1
      ? width / 2
      : PADX + (i * (width - 2 * PADX)) / (points.length - 1);
  const yFor = (v: number): number =>
    H - PADB - ((v - min) / (max - min)) * (H - PADT - PADB);

  const linePath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.value).toFixed(1)}`,
    )
    .join(" ");

  const areaPath =
    points.length > 1
      ? `${linePath} L ${xFor(points.length - 1).toFixed(1)} ${H - PADB} L ${xFor(0).toFixed(1)} ${H - PADB} Z`
      : null;

  const last = points[points.length - 1];

  return (
    <Svg width={width} height={H}>
      <Defs>
        <SvgLinearGradient id="detailAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.teal} stopOpacity={0.16} />
          <Stop offset="1" stopColor={colors.teal} stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Line
        x1={PADX}
        y1={H - PADB}
        x2={width - PADX}
        y2={H - PADB}
        stroke={colors.hairline}
        strokeWidth={1}
      />
      {areaPath !== null && <Path d={areaPath} fill="url(#detailAreaGrad)" />}
      {points.length > 1 && (
        <Path
          d={linePath}
          stroke={colors.teal}
          strokeWidth={2.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )}
      {last !== undefined && (
        <Circle
          cx={xFor(points.length - 1)}
          cy={yFor(last.value)}
          r={4.5}
          fill={colors.tealDeep}
        />
      )}
    </Svg>
  );
}

const ANGLE_ORDER: Record<string, number> = { front: 0, side: 1, back: 2 };

/**
 * Newest capture session first, and inside each session the angles always
 * run front -> side -> back. Sessions are keyed by weekly_checkin_id and
 * ranked by created_at, because several sessions can share one photo_date.
 */
function sortProgressPhotos(rows: ProgressPhoto[]): ProgressPhoto[] {
  const sessionKey = (row: ProgressPhoto): string =>
    row.weekly_checkin_id ?? `date:${row.photo_date ?? ""}`;

  const sessionStamp = new Map<string, string>();
  rows.forEach((row) => {
    const key = sessionKey(row);
    const stamp = row.created_at ?? row.photo_date ?? "";
    const current = sessionStamp.get(key);
    if (current === undefined || stamp > current) sessionStamp.set(key, stamp);
  });

  return [...rows].sort((a, b) => {
    const keyA = sessionKey(a);
    const keyB = sessionKey(b);
    if (keyA !== keyB) {
      const stampA = sessionStamp.get(keyA) ?? "";
      const stampB = sessionStamp.get(keyB) ?? "";
      if (stampA !== stampB) return stampA < stampB ? 1 : -1;
      return keyA < keyB ? 1 : -1;
    }
    return (ANGLE_ORDER[a.angle] ?? 9) - (ANGLE_ORDER[b.angle] ?? 9);
  });
}

export default function PatientDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [chartWidth, setChartWidth] = useState<number>(0);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const { profile: doctorProfile } = useDoctorHome();

  const patientQuery = useQuery({
    queryKey: ["doctor-patient-detail", id],
    enabled: typeof id === "string" && id.length > 0,
    queryFn: async (): Promise<PatientProfile | null> => {
      const { data, error } = await supabase
        .from("patient_profiles")
        .select("id, user_id, first_name, last_name, date_of_birth, city")
        .eq("id", id as string)
        .maybeSingle();
      if (error) throw error;
      return data as PatientProfile | null;
    },
  });

  const cycleQuery = useQuery({
    queryKey: ["doctor-patient-cycle", id],
    enabled: typeof id === "string" && id.length > 0,
    queryFn: async (): Promise<TherapyCycle | null> => {
      const { data, error } = await supabase
        .from("therapy_cycles")
        .select(
          "id, doctor_id, patient_id, protocol_name, goal_type, goal_start, goal_target, goal_unit, goal_waist_cm, goal_hips_cm, goal_abdomen_cm, start_date, expected_end, status",
        )
        .eq("patient_id", id as string)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as TherapyCycle | null;
    },
  });

  const cycleId = cycleQuery.data?.id ?? null;

  const weeklyQuery = useQuery({
    queryKey: ["doctor-patient-weekly", cycleId],
    enabled: cycleId !== null,
    queryFn: async (): Promise<WeeklyCheckinFull[]> => {
      const { data, error } = await supabase
        .from("weekly_checkins")
        .select(
          "id, therapy_cycle_id, patient_id, week_number, checkin_date, weight_kg, waist_cm, hips_cm, abdomen_cm, wellbeing, energy, appetite, food_noise, symptoms, symptoms_notes",
        )
        .eq("therapy_cycle_id", cycleId as string)
        .order("week_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WeeklyCheckinFull[];
    },
  });

  const dailyQuery = useQuery({
    queryKey: ["doctor-patient-daily", cycleId],
    enabled: cycleId !== null,
    queryFn: async (): Promise<DailyCheckin[]> => {
      const { data, error } = await supabase
        .from("daily_checkins")
        .select(
          "id, therapy_cycle_id, patient_id, checkin_date, wellbeing, appetite, food_noise, energy, sleep, nausea, weakness, notes",
        )
        .eq("therapy_cycle_id", cycleId as string)
        .order("checkin_date", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as DailyCheckin[];
    },
  });

  const photosQuery = useQuery({
    queryKey: ["doctor-patient-photos", cycleId],
    enabled: cycleId !== null,
    queryFn: async (): Promise<ProgressPhoto[]> => {
      const { data, error } = await supabase
        .from("progress_photos")
        .select(
          "id, patient_id, therapy_cycle_id, weekly_checkin_id, file_url, angle, photo_date, created_at",
        )
        .eq("therapy_cycle_id", cycleId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = sortProgressPhotos(
        (data ?? []) as unknown as ProgressPhoto[],
      );
      // Bucket is private — swap the stored path for a short-lived signed URL.
      const signed = await Promise.all(
        rows.map(async (row) => {
          const { data: signedData } = await supabase.storage
            .from("progress-photos")
            .createSignedUrl(row.file_url, 3600);
          return { ...row, file_url: signedData?.signedUrl ?? row.file_url };
        }),
      );
      return signed;
    },
  });

  const isLoading =
    patientQuery.isPending ||
    cycleQuery.isPending ||
    (cycleId !== null &&
      (weeklyQuery.isPending || dailyQuery.isPending || photosQuery.isPending));

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  const patient = patientQuery.data ?? null;
  const cycle = cycleQuery.data ?? null;
  const weekly = weeklyQuery.data ?? [];
  const daily = dailyQuery.data ?? [];
  const photos = photosQuery.data ?? [];

  const metaParts: string[] = [];
  if (patient?.city !== null && patient?.city !== undefined && patient.city.length > 0) {
    metaParts.push(patient.city);
  }
  if (patient?.date_of_birth != null) {
    metaParts.push(`${ageFrom(patient.date_of_birth)} р.`);
  }

  const cycleDay = cycle?.start_date != null ? daysSince(cycle.start_date) + 1 : null;
  const totalDays =
    cycle?.start_date != null && cycle?.expected_end != null
      ? Math.max(
          Math.round(
            (new Date(`${cycle.expected_end}T00:00:00`).getTime() -
              new Date(`${cycle.start_date}T00:00:00`).getTime()) /
              86400000,
          ),
          1,
        )
      : null;
  const cycleProgress =
    cycleDay !== null && totalDays !== null
      ? Math.min(Math.max(cycleDay / totalDays, 0), 1)
      : 0;

  const chartPoints: { value: number }[] = [];
  if (cycle?.goal_start != null) {
    chartPoints.push({ value: cycle.goal_start });
  }
  weekly
    .filter((w) => w.weight_kg !== null)
    .forEach((w) => chartPoints.push({ value: w.weight_kg as number }));

  const latestWeekly = weekly.length > 0 ? weekly[weekly.length - 1] : null;
  const latestDaily = daily.length > 0 ? daily[0] : null;

  let latestSummary: { title: string; text: string } | null = null;
  const weeklyDate = latestWeekly?.checkin_date ?? null;
  const dailyDate = latestDaily?.checkin_date ?? null;
  if (dailyDate !== null && (weeklyDate === null || dailyDate >= weeklyDate)) {
    latestSummary = {
      title: `Daily · ${formatDateShort(dailyDate)}`,
      text: `Самопоч. ${latestDaily?.wellbeing ?? "—"} · апетит ${latestDaily?.appetite ?? "—"} · енергія ${latestDaily?.energy ?? "—"}`,
    };
  } else if (weeklyDate !== null) {
    latestSummary = {
      title: `Weekly · ${formatDateShort(weeklyDate)}`,
      text: `Вага ${latestWeekly?.weight_kg !== null && latestWeekly?.weight_kg !== undefined ? `${formatKg(latestWeekly.weight_kg)} кг` : "—"} · самопоч. ${latestWeekly?.wellbeing ?? "—"}`,
    };
  }

  const feed: FeedItem[] = [
    ...daily.map((d) => ({
      kind: "daily" as const,
      id: d.id,
      date: d.checkin_date ?? "",
      summary: `Самопоч. ${d.wellbeing ?? "—"} · апетит ${d.appetite ?? "—"} · енергія ${d.energy ?? "—"}`,
    })),
    ...weekly.map((w) => ({
      kind: "weekly" as const,
      id: w.id,
      date: w.checkin_date ?? "",
      summary: `Вага ${w.weight_kg !== null ? `${formatKg(w.weight_kg)} кг` : "—"} · талія ${w.waist_cm !== null ? `${formatKg(w.waist_cm)} см` : "—"}`,
    })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 5);

  const handleExportPdf = async () => {
    if (patient === null) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const doctorName =
        doctorProfile !== null
          ? `${doctorProfile.first_name} ${doctorProfile.last_name}`
          : "—";
      const today = todayISO();
      const html = buildReportHtml({
        patient,
        cycle,
        weekly,
        daily,
        doctorName,
        doctorSpecialization: doctorProfile?.specialization ?? null,
        today,
        cycleDay,
        totalDays,
      });

      if (Platform.OS === "web") {
        // expo-print ignores `html` on web and prints the live DOM instead.
        // Render the report into a hidden iframe and print that document.
        const frame = document.createElement("iframe");
        frame.style.position = "fixed";
        frame.style.right = "0";
        frame.style.bottom = "0";
        frame.style.width = "0";
        frame.style.height = "0";
        frame.style.border = "0";
        document.body.appendChild(frame);

        const doc = frame.contentDocument;
        if (doc === null) throw new Error("Не вдалося створити документ звіту");
        doc.open();
        doc.write(html);
        doc.close();

        await new Promise<void>((resolve) => {
          const done = (): void => resolve();
          if (frame.contentWindow === null) {
            done();
            return;
          }
          frame.contentWindow.addEventListener("load", done, { once: true });
          setTimeout(done, 1500);
        });

        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        setTimeout(() => frame.remove(), 3000);
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri);
        } else {
          await Print.printAsync({ uri });
        }
      }
    } catch (err) {
      console.log("[patient-detail] pdf export failed:", err);
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Pressable
          testID="patient-detail-back"
          onPress={() => router.back()}
          style={styles.back}
          hitSlop={12}
        >
          <ArrowLeft size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Пацієнт
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        testID="patient-detail-screen"
      >
        {patient === null ? (
          <Text style={styles.notFound}>Пацієнта не знайдено.</Text>
        ) : (
          <>
            <View style={styles.heroCard}>
              <AvatarInitials
                firstName={patient.first_name}
                lastName={patient.last_name}
                size={72}
              />
              <Text style={styles.name}>
                {patient.first_name} {patient.last_name}
              </Text>
              {metaParts.length > 0 && (
                <Text style={styles.meta}>{metaParts.join(" · ")}</Text>
              )}
            </View>

            {cycle !== null ? (
              <View style={styles.cycleCard} testID="detail-cycle-card">
                <Text style={styles.cycleLabel}>Активний цикл</Text>
                <Text style={styles.cycleName}>
                  {cycle.protocol_name ?? "Без назви"}
                </Text>
                {cycleDay !== null && (
                  <Text style={styles.cycleDay}>
                    день {cycleDay}
                    {totalDays !== null ? ` з ${totalDays}` : ""}
                  </Text>
                )}
                <View style={styles.progressTrack}>
                  <LinearGradient
                    colors={[colors.navy, colors.teal]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[
                      styles.progressFill,
                      { width: `${Math.max(cycleProgress * 100, 2)}%` },
                    ]}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.cycleCard}>
                <Text style={styles.cycleLabel}>Немає активного циклу</Text>
              </View>
            )}

            {latestSummary !== null && (
              <View style={styles.summaryCard} testID="latest-checkin-summary">
                <Text style={styles.summaryTitle}>{latestSummary.title}</Text>
                <Text style={styles.summaryText}>{latestSummary.text}</Text>
              </View>
            )}

            {chartPoints.length > 0 && (
              <View style={styles.chartCard} testID="detail-weight-chart">
                <Text style={styles.chartTitle}>Динаміка ваги</Text>
                <View
                  style={styles.chartArea}
                  onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
                >
                  {chartWidth > 0 && (
                    <WeightChart points={chartPoints} width={chartWidth} />
                  )}
                </View>
              </View>
            )}

            {feed.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>ОСТАННІ ЧЕК-ІНИ</Text>
                <View style={styles.listCard}>
                  {feed.map((item, i) => {
                    const { day, month } = dateParts(item.date);
                    return (
                      <Pressable
                        key={`${item.kind}-${item.id}`}
                        testID={`checkin-row-${item.kind}-${item.id}`}
                        onPress={() =>
                          router.push({
                            pathname:
                              item.kind === "daily"
                                ? "/daily-detail"
                                : "/weekly-detail",
                            params: { id: item.id },
                          })
                        }
                        style={({ pressed }) => [
                          styles.feedRow,
                          i > 0 && styles.feedRowBorder,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.dateCol}>
                          <Text style={styles.dateDay}>{day}</Text>
                          <Text style={styles.dateMonth}>{month}</Text>
                        </View>
                        <View style={styles.feedCenter}>
                          <Text style={styles.feedTitle}>
                            {item.kind === "daily"
                              ? "Daily Check-in"
                              : "Weekly Check-in"}
                          </Text>
                          <Text style={styles.feedSummary} numberOfLines={1}>
                            {item.summary}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.badge,
                            item.kind === "daily"
                              ? styles.badgeNavy
                              : styles.badgeTeal,
                          ]}
                        >
                          <Text style={styles.badgeText}>
                            {item.kind === "daily" ? "D" : "W"}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {photos.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>ФОТО ПРОГРЕСУ</Text>
                <View style={styles.photoGrid} testID="doctor-progress-photos">
                  {photos.map((photo, index) => (
                    <Pressable
                      key={photo.id}
                      testID={`doctor-photo-${photo.id}`}
                      onPress={() => setViewerIndex(index)}
                      style={styles.photoGridItem}
                    >
                      <Image
                        source={{ uri: photo.file_url }}
                        style={styles.photoGridImage}
                        resizeMode="contain"
                      />
                      <Text style={styles.photoGridDate}>
                        {photo.photo_date !== null
                          ? formatDateShort(photo.photo_date)
                          : ""}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Modal
              visible={viewerIndex !== null}
              transparent
              animationType="fade"
              onRequestClose={() => setViewerIndex(null)}
            >
              <View style={styles.viewerOverlay}>
                <Pressable
                  testID="doctor-photo-viewer-close"
                  style={styles.viewerClose}
                  onPress={() => setViewerIndex(null)}
                  hitSlop={12}
                >
                  <X size={26} color="#FFFFFF" strokeWidth={2} />
                </Pressable>
                {viewerIndex !== null && photos[viewerIndex] !== undefined && (
                  <>
                    <Image
                      source={{ uri: photos[viewerIndex].file_url }}
                      style={styles.viewerImage}
                      resizeMode="contain"
                    />
                    <Text style={styles.viewerCaption}>
                      {photos[viewerIndex].photo_date !== null
                        ? formatDateShort(photos[viewerIndex].photo_date as string)
                        : ""}
                    </Text>
                    <View style={styles.viewerNav}>
                      <Pressable
                        testID="doctor-photo-viewer-prev"
                        onPress={() =>
                          setViewerIndex((prev) =>
                            prev !== null && prev > 0 ? prev - 1 : prev,
                          )
                        }
                        disabled={viewerIndex === 0}
                        style={[
                          styles.viewerNavButton,
                          viewerIndex === 0 && styles.viewerNavButtonDisabled,
                        ]}
                      >
                        <ChevronLeft size={22} color="#FFFFFF" strokeWidth={2} />
                      </Pressable>
                      <Pressable
                        testID="doctor-photo-viewer-next"
                        onPress={() =>
                          setViewerIndex((prev) =>
                            prev !== null && prev < photos.length - 1
                              ? prev + 1
                              : prev,
                          )
                        }
                        disabled={viewerIndex === photos.length - 1}
                        style={[
                          styles.viewerNavButton,
                          viewerIndex === photos.length - 1 &&
                            styles.viewerNavButtonDisabled,
                        ]}
                      >
                        <ChevronRight size={22} color="#FFFFFF" strokeWidth={2} />
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            </Modal>

            <Pressable
              testID="write-patient-button"
              onPress={() =>
                router.push({
                  pathname: "/chat-thread",
                  params: {
                    patientId: patient.id,
                    name: `${patient.first_name} ${patient.last_name}`,
                  },
                })
              }
              style={({ pressed }) => [styles.writeButton, pressed && styles.pressed]}
            >
              <MessageCircle size={18} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.writeButtonText}>Написати</Text>
            </Pressable>

            <Pressable
              testID="titration-button"
              onPress={() =>
                router.push({
                  pathname: "/titration",
                  params: {
                    cycleId: cycleId ?? "",
                    patientName: `${patient.first_name} ${patient.last_name}`,
                  },
                })
              }
              disabled={cycleId === null}
              style={({ pressed }) => [
                styles.titrationButton,
                cycleId === null && styles.titrationDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Syringe size={18} color={colors.navy} strokeWidth={2} />
              <Text style={styles.exportButtonText}>Схема титрації</Text>
            </Pressable>

            <Pressable
              testID="export-pdf-button"
              onPress={handleExportPdf}
              disabled={isExporting}
              style={({ pressed }) => [styles.exportButton, pressed && styles.pressed]}
            >
              {isExporting ? (
                <ActivityIndicator size="small" color={colors.navy} />
              ) : (
                <>
                  <FileDown size={18} color={colors.navy} strokeWidth={2} />
                  <Text style={styles.exportButtonText}>Експорт PDF</Text>
                </>
              )}
            </Pressable>

            {exportError !== null && (
              <Text style={styles.exportError} testID="export-error">
                {exportError}
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
    paddingHorizontal: 20,
    marginBottom: 12,
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
  headerTitle: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: 19,
    color: colors.navyDeep,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: 24,
    alignItems: "center",
    marginBottom: 12,
    ...cardShadow,
  },
  name: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ink,
    marginTop: 12,
  },
  meta: {
    fontFamily: fonts.medium,
    fontSize: 13.5,
    color: colors.sub,
    marginTop: 3,
  },
  cycleCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 18,
    marginBottom: 12,
    ...cardShadow,
  },
  cycleLabel: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.sub,
  },
  cycleName: {
    fontFamily: fonts.serif,
    fontSize: 19,
    color: colors.navyDeep,
    marginTop: 3,
  },
  cycleDay: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.sub,
    marginTop: 3,
    marginBottom: 12,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.hairline,
    overflow: "hidden",
    marginTop: 4,
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
  },
  summaryCard: {
    backgroundColor: colors.mint,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  summaryTitle: {
    fontFamily: fonts.bold,
    fontSize: 12.5,
    color: colors.tealDeep,
  },
  summaryText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.ink,
    marginTop: 3,
  },
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 18,
    marginBottom: 20,
    ...cardShadow,
  },
  chartTitle: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
    marginBottom: 8,
  },
  chartArea: {
    width: "100%",
  },
  sectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.sub,
    marginBottom: 10,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  photoGridItem: {
    width: "31%",
  },
  photoGridImage: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radius.button,
    backgroundColor: colors.card,
  },
  photoGridDate: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.sub,
    marginTop: 4,
    textAlign: "center",
  },
  viewerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  viewerClose: {
    position: "absolute",
    top: 56,
    right: 24,
    zIndex: 10,
  },
  viewerImage: {
    width: "100%",
    height: "70%",
  },
  viewerCaption: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#FFFFFF",
    marginTop: 16,
  },
  viewerNav: {
    flexDirection: "row",
    gap: 40,
    marginTop: 24,
  },
  viewerNavButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerNavButtonDisabled: {
    opacity: 0.3,
  },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingHorizontal: 16,
    marginBottom: 20,
    ...cardShadow,
  },
  feedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
  },
  feedRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  dateCol: {
    width: 48,
    alignItems: "center",
  },
  dateDay: {
    fontFamily: fonts.serif,
    fontSize: 16,
    color: colors.navy,
  },
  dateMonth: {
    fontFamily: fonts.semibold,
    fontSize: 9,
    color: colors.sub,
    letterSpacing: 0.5,
    marginTop: 1,
  },
  feedCenter: {
    flex: 1,
  },
  feedTitle: {
    fontFamily: fonts.bold,
    fontSize: 13.5,
    color: colors.ink,
  },
  feedSummary: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: colors.sub,
    marginTop: 2,
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeNavy: {
    backgroundColor: colors.navy,
  },
  badgeTeal: {
    backgroundColor: colors.teal,
  },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 9.5,
    color: "#FFFFFF",
  },
  writeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.navy,
  },
  writeButtonText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#FFFFFF",
  },
  titrationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderColor: colors.navy,
    backgroundColor: colors.card,
    marginBottom: 10,
  },
  titrationDisabled: { opacity: 0.4 },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    borderWidth: 1.4,
    borderColor: colors.navy,
    marginTop: 12,
  },
  exportButtonText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.navy,
  },
  exportError: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.amber,
    textAlign: "center",
    marginTop: 10,
  },
  notFound: {
    fontFamily: fonts.medium,
    fontSize: 14.5,
    color: colors.sub,
    textAlign: "center",
    marginTop: 40,
  },
  pressed: {
    opacity: 0.85,
  },
});
