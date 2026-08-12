import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
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
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react-native";

import { colors, cardShadow, fonts, radius, softShadow } from "@/constants/theme";
import { useProgressPhotos, useWeeklyCheckins } from "@/hooks/useCycleCheckins";
import { usePatientHome } from "@/hooks/usePatientHome";
import type { WeeklyCheckinFull } from "@/types/db";
import { daysSince, formatDateShort } from "@/utils/dates";
import { formatKg } from "@/utils/format";

const ANGLE_LABELS: Record<string, string> = {
  front: "Спереду",
  side: "Збоку",
  back: "Ззаду",
};

type MetricKey = "weight_kg" | "waist_cm" | "hips_cm" | "abdomen_cm";

const METRICS: { key: MetricKey; label: string; unit: string }[] = [
  { key: "weight_kg", label: "Вага", unit: "кг" },
  { key: "waist_cm", label: "Талія", unit: "см" },
  { key: "hips_cm", label: "Стегна", unit: "см" },
  { key: "abdomen_cm", label: "Живіт", unit: "см" },
];

interface ChartPoint {
  label: string;
  value: number;
}

function formatSigned(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatKg(Math.abs(value))}`;
}

/** SVG line chart with teal area fill and optional amber goal line. */
function LineChart({
  points,
  goal,
  width,
}: {
  points: ChartPoint[];
  goal: number | null;
  width: number;
}) {
  const H = 160;
  const PADX = 10;
  const PADT = 22;
  const PADB = 12;

  const values = points.map((p) => p.value);
  const allValues = goal !== null ? [...values, goal] : values;
  let min = Math.min(...allValues);
  let max = Math.max(...allValues);
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
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.value).toFixed(1)}`)
    .join(" ");

  const areaPath =
    points.length > 1
      ? `${linePath} L ${xFor(points.length - 1).toFixed(1)} ${H - PADB} L ${xFor(0).toFixed(1)} ${H - PADB} Z`
      : null;

  const last = points[points.length - 1];
  const goalY = goal !== null ? yFor(goal) : null;

  return (
    <Svg width={width} height={H}>
      <Defs>
        <SvgLinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
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
      {goalY !== null && (
        <>
          <Line
            x1={PADX}
            y1={goalY}
            x2={width - PADX}
            y2={goalY}
            stroke={colors.amber}
            strokeWidth={1.4}
            strokeDasharray="4,4"
          />
          <Rect
            x={width - PADX - 58}
            y={goalY - 18}
            width={58}
            height={15}
            rx={7.5}
            fill={colors.goldTint}
          />
          <SvgText
            x={width - PADX - 29}
            y={goalY - 7}
            fontSize={9.5}
            fill={colors.amber}
            textAnchor="middle"
            fontWeight="700"
          >
            {`Ціль ${formatKg(goal as number)}`}
          </SvgText>
        </>
      )}
      {areaPath !== null && <Path d={areaPath} fill="url(#areaGrad)" />}
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

interface MilestoneRow {
  label: string;
  done: boolean;
  date: string | null;
}

export default function PatientProgressScreen() {
  const insets = useSafeAreaInsets();
  const { cycle, isLoading } = usePatientHome();
  const weeklyQuery = useWeeklyCheckins(cycle?.id ?? null);
  const photosQuery = useProgressPhotos(cycle?.id ?? null);
  const [metric, setMetric] = useState<MetricKey>("weight_kg");
  const [chartWidth, setChartWidth] = useState<number>(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const rows: WeeklyCheckinFull[] = useMemo(
    () => weeklyQuery.data ?? [],
    [weeklyQuery.data],
  );

  const series: ChartPoint[] = useMemo(() => {
    const pts: ChartPoint[] = rows
      .filter((r) => r[metric] !== null)
      .map((r) => ({
        label: `Тиж ${r.week_number ?? "?"}`,
        value: r[metric] as number,
      }));
    if (metric === "weight_kg" && cycle?.goal_start != null) {
      return [{ label: "Старт", value: cycle.goal_start }, ...pts];
    }
    return pts;
  }, [rows, metric, cycle?.goal_start]);

  const milestones: MilestoneRow[] = useMemo(() => {
    if (cycle?.goal_start == null) return [];
    const goalStart = cycle.goal_start;
    const goalTarget = cycle.goal_target;
    const weightRows = rows.filter((r) => r.weight_kg !== null);
    const latestWeight =
      weightRows.length > 0
        ? (weightRows[weightRows.length - 1].weight_kg as number)
        : null;

    const firstWhere = (
      predicate: (w: number) => boolean,
    ): string | null => {
      const found = weightRows.find((r) => predicate(r.weight_kg as number));
      return found?.checkin_date ?? null;
    };

    const first5Done = latestWeight !== null && goalStart - latestWeight >= 5;
    const first5Date = firstWhere((w) => goalStart - w >= 5);

    let halfDone = false;
    let halfDate: string | null = null;
    let goalDone = false;
    let goalDate: string | null = null;
    if (goalTarget !== null && goalStart !== goalTarget) {
      const span = goalStart - goalTarget;
      halfDone =
        latestWeight !== null && (goalStart - latestWeight) / span >= 0.5;
      halfDate = firstWhere((w) => (goalStart - w) / span >= 0.5);
      goalDone = latestWeight !== null && latestWeight <= goalTarget;
      goalDate = firstWhere((w) => w <= goalTarget);
    }

    return [
      { label: "Перші −5 кг", done: first5Done, date: first5Done ? first5Date : null },
      { label: "Половина шляху", done: halfDone, date: halfDone ? halfDate : null },
      { label: "Ціль досягнута", done: goalDone, date: goalDone ? goalDate : null },
    ];
  }, [rows, cycle?.goal_start, cycle?.goal_target]);

  if (isLoading || (cycle !== null && weeklyQuery.isPending)) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  const metricMeta = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  const startValue = series.length > 0 ? series[0].value : null;
  const currentValue = series.length > 0 ? series[series.length - 1].value : null;
  const goalValue = metric === "weight_kg" ? cycle?.goal_target ?? null : null;
  const change =
    startValue !== null && currentValue !== null ? currentValue - startValue : null;

  const dayX = cycle?.start_date != null ? daysSince(cycle.start_date) + 1 : null;
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

  const allPhotos = photosQuery.data ?? [];
  const frontPhotos = allPhotos.filter((p) => p.angle === "front");
  const firstPhoto = frontPhotos[0] ?? null;
  const lastPhoto =
    frontPhotos.length > 1 ? frontPhotos[frontPhotos.length - 1] : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: 32 },
      ]}
      showsVerticalScrollIndicator={false}
      testID="progress-screen"
    >
      <Text style={styles.title}>Прогрес</Text>
      {cycle !== null ? (
        <Text style={styles.subtitle}>
          Цикл &apos;{cycle.protocol_name ?? "—"}&apos;
          {dayX !== null ? ` · день ${dayX}${totalDays !== null ? ` з ${totalDays}` : ""}` : ""}
        </Text>
      ) : (
        <Text style={styles.subtitle}>Немає активного циклу</Text>
      )}

      {cycle !== null && (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            style={styles.chipScroll}
          >
            {METRICS.map((m) => {
              const active = m.key === metric;
              return (
                <Pressable
                  key={m.key}
                  testID={`metric-chip-${m.key}`}
                  onPress={() => setMetric(m.key)}
                  style={[styles.metricChip, active && styles.metricChipActive]}
                >
                  <Text
                    style={[
                      styles.metricChipText,
                      active && styles.metricChipTextActive,
                    ]}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.chartCard} testID="chart-card">
            <View style={styles.chartHeader}>
              <View>
                <Text style={styles.chartMetricLabel}>{metricMeta.label}</Text>
                <Text style={styles.chartCurrent}>
                  {currentValue !== null
                    ? `${formatKg(currentValue)} ${metricMeta.unit}`
                    : "—"}
                </Text>
              </View>
              {change !== null && (
                <View style={styles.chartDeltaWrap}>
                  <Text style={styles.chartDelta}>{formatSigned(change)}</Text>
                  <Text style={styles.chartDeltaLabel}>за цикл</Text>
                </View>
              )}
            </View>

            <View
              style={styles.chartArea}
              onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
            >
              {series.length === 0 ? (
                <View style={styles.chartEmpty}>
                  <Text style={styles.chartEmptyText}>
                    Заповніть перший тижневий чек-ін
                  </Text>
                </View>
              ) : (
                chartWidth > 0 && (
                  <LineChart points={series} goal={goalValue} width={chartWidth} />
                )
              )}
            </View>

            {series.length > 0 && (
              <View style={styles.xLabels}>
                {series.map((p, i) => (
                  <Text key={`${p.label}-${i}`} style={styles.xLabel}>
                    {p.label}
                  </Text>
                ))}
              </View>
            )}
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Старт</Text>
              <Text style={[styles.statValue, styles.navyText]}>
                {startValue !== null ? formatKg(startValue) : "—"}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Зараз</Text>
              <Text style={[styles.statValue, styles.blueText]}>
                {currentValue !== null ? formatKg(currentValue) : "—"}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Ціль</Text>
              <Text style={[styles.statValue, styles.navyText]}>
                {goalValue !== null ? formatKg(goalValue) : "—"}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Зміна</Text>
              <Text style={[styles.statValue, styles.tealText]}>
                {change !== null ? formatSigned(change) : "—"}
              </Text>
            </View>
          </View>

          {firstPhoto !== null && (
            <View testID="photo-comparison">
              <Text style={styles.sectionLabel}>ФОТО ДО / ПІСЛЯ</Text>
              <View style={styles.photoCompareRow}>
                <View style={styles.photoCompareCol}>
                  <View style={styles.photoFrame}>
                    <Image
                      source={{ uri: firstPhoto.file_url }}
                      style={styles.photoImage}
                      resizeMode="cover"
                    />
                    <View style={[styles.photoTag, styles.photoTagGrey]}>
                      <Text style={styles.photoTagTextGrey}>ДО</Text>
                    </View>
                  </View>
                  <Text style={styles.photoDate}>
                    {firstPhoto.photo_date !== null
                      ? formatDateShort(firstPhoto.photo_date)
                      : ""}
                  </Text>
                </View>
                <View style={styles.photoCompareCol}>
                  {lastPhoto !== null ? (
                    <>
                      <View style={styles.photoFrame}>
                        <Image
                          source={{ uri: lastPhoto.file_url }}
                          style={styles.photoImage}
                          resizeMode="cover"
                        />
                        <View style={[styles.photoTag, styles.photoTagTeal]}>
                          <Text style={styles.photoTagTextTeal}>ЗАРАЗ</Text>
                        </View>
                      </View>
                      <Text style={styles.photoDate}>
                        {lastPhoto.photo_date !== null
                          ? formatDateShort(lastPhoto.photo_date)
                          : ""}
                      </Text>
                    </>
                  ) : (
                    <View style={[styles.photoFrame, styles.photoFrameEmpty]}>
                      <Text style={styles.photoEmptyText}>
                        Наступне фото — у тижневому чек-іні
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}

          {allPhotos.length > 0 && (
            <View testID="photo-gallery">
              <Text style={styles.sectionLabel}>УСІ ФОТО</Text>
              <View style={styles.photoGrid}>
                {allPhotos.map((photo, index) => (
                  <Pressable
                    key={photo.id}
                    testID={`gallery-photo-${photo.id}`}
                    onPress={() => setViewerIndex(index)}
                    style={styles.photoGridItem}
                  >
                    <Image
                      source={{ uri: photo.file_url }}
                      style={styles.photoGridImage}
                      resizeMode="cover"
                    />
                    <Text style={styles.photoGridCaption}>
                      {ANGLE_LABELS[photo.angle] ?? photo.angle}
                      {photo.photo_date !== null
                        ? ` · ${formatDateShort(photo.photo_date)}`
                        : ""}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <Modal
            visible={viewerIndex !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setViewerIndex(null)}
          >
            <View style={styles.viewerOverlay}>
              <Pressable
                testID="photo-viewer-close"
                style={styles.viewerClose}
                onPress={() => setViewerIndex(null)}
                hitSlop={12}
              >
                <X size={26} color="#FFFFFF" strokeWidth={2} />
              </Pressable>
              {viewerIndex !== null && allPhotos[viewerIndex] !== undefined && (
                <>
                  <Image
                    source={{ uri: allPhotos[viewerIndex].file_url }}
                    style={styles.viewerImage}
                    resizeMode="contain"
                  />
                  <Text style={styles.viewerCaption}>
                    {ANGLE_LABELS[allPhotos[viewerIndex].angle] ??
                      allPhotos[viewerIndex].angle}
                    {allPhotos[viewerIndex].photo_date !== null
                      ? ` · ${formatDateShort(allPhotos[viewerIndex].photo_date as string)}`
                      : ""}
                  </Text>
                  <View style={styles.viewerNav}>
                    <Pressable
                      testID="photo-viewer-prev"
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
                      testID="photo-viewer-next"
                      onPress={() =>
                        setViewerIndex((prev) =>
                          prev !== null && prev < allPhotos.length - 1
                            ? prev + 1
                            : prev,
                        )
                      }
                      disabled={viewerIndex === allPhotos.length - 1}
                      style={[
                        styles.viewerNavButton,
                        viewerIndex === allPhotos.length - 1 &&
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

          {milestones.length > 0 && (
            <View testID="milestones">
              <Text style={styles.sectionLabel}>ВІХИ ЦИКЛУ</Text>
              <View style={styles.milestoneCard}>
                {milestones.map((m, i) => (
                  <View
                    key={m.label}
                    style={[
                      styles.milestoneRow,
                      i > 0 && styles.milestoneRowBorder,
                    ]}
                  >
                    {m.done ? (
                      <View style={styles.milestoneDone}>
                        <Check size={13} color="#FFFFFF" strokeWidth={3} />
                      </View>
                    ) : (
                      <View style={styles.milestonePending} />
                    )}
                    <Text
                      style={[
                        styles.milestoneLabel,
                        !m.done && styles.milestoneLabelPending,
                      ]}
                    >
                      {m.label}
                    </Text>
                    <Text style={styles.milestoneDate}>
                      {m.done && m.date !== null ? formatDateShort(m.date) : "—"}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </>
      )}
    </ScrollView>
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
  content: {
    paddingHorizontal: 20,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 24,
    color: colors.navyDeep,
  },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.sub,
    marginTop: 4,
    marginBottom: 16,
  },
  chipScroll: {
    marginHorizontal: -20,
    marginBottom: 16,
  },
  chipRow: {
    paddingHorizontal: 20,
    gap: 10,
    flexDirection: "row",
  },
  metricChip: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    ...softShadow,
  },
  metricChipActive: {
    backgroundColor: colors.navy,
  },
  metricChipText: {
    fontFamily: fonts.semibold,
    fontSize: 13.5,
    color: colors.sub,
  },
  metricChipTextActive: {
    fontFamily: fonts.bold,
    color: "#FFFFFF",
  },
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    ...cardShadow,
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  chartMetricLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.sub,
  },
  chartCurrent: {
    fontFamily: fonts.serif,
    fontSize: 30,
    color: colors.navyDeep,
    marginTop: 2,
  },
  chartDeltaWrap: {
    alignItems: "flex-end",
  },
  chartDelta: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.teal,
  },
  chartDeltaLabel: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: colors.sub,
  },
  chartArea: {
    width: "100%",
  },
  chartEmpty: {
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  chartEmptyText: {
    fontFamily: fonts.medium,
    fontSize: 13.5,
    color: colors.sub,
  },
  xLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  xLabel: {
    fontFamily: fonts.medium,
    fontSize: 9.5,
    color: colors.sub,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    ...softShadow,
  },
  statLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.sub,
  },
  statValue: {
    fontFamily: fonts.serif,
    fontSize: 17,
    marginTop: 3,
  },
  navyText: {
    color: colors.navy,
  },
  blueText: {
    color: colors.blue,
  },
  tealText: {
    color: colors.tealDeep,
  },
  sectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.sub,
    marginBottom: 10,
  },
  photoCompareRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  photoCompareCol: {
    flex: 1,
  },
  photoFrame: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 14,
    backgroundColor: colors.card,
    overflow: "hidden",
    ...softShadow,
  },
  photoFrameEmpty: {
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  photoEmptyText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.sub,
    textAlign: "center",
  },
  photoImage: {
    ...StyleSheet.absoluteFillObject,
  },
  photoTag: {
    position: "absolute",
    top: 8,
    left: 8,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  photoTagGrey: {
    backgroundColor: "rgba(243,246,248,0.92)",
  },
  photoTagTeal: {
    backgroundColor: colors.teal,
  },
  photoTagTextGrey: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.sub,
  },
  photoTagTextTeal: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: "#FFFFFF",
  },
  photoDate: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: colors.sub,
    marginTop: 6,
    textAlign: "center",
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 24,
  },
  photoGridItem: {
    width: "31%",
  },
  photoGridImage: {
    width: "100%",
    aspectRatio: 0.8,
    borderRadius: radius.card,
    backgroundColor: colors.hairline,
  },
  photoGridCaption: {
    fontFamily: fonts.medium,
    fontSize: 10.5,
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
  milestoneCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingHorizontal: 16,
    marginBottom: 24,
    ...cardShadow,
  },
  milestoneRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    gap: 12,
  },
  milestoneRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  milestoneDone: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  milestonePending: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.6,
    borderStyle: "dashed",
    borderColor: colors.hairline,
  },
  milestoneLabel: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 14.5,
    color: colors.ink,
  },
  milestoneLabelPending: {
    color: colors.sub,
  },
  milestoneDate: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.sub,
  },
});
