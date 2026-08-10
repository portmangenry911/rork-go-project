import { useRouter } from "expo-router";
import { NotebookPen } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, cardShadow, fonts, radius, softShadow } from "@/constants/theme";
import { useDailyCheckins, useWeeklyCheckins } from "@/hooks/useCycleCheckins";
import { usePatientHome } from "@/hooks/usePatientHome";
import { dateParts } from "@/utils/dates";
import { formatKg } from "@/utils/format";

type Filter = "all" | "daily" | "weekly";

interface DiaryItem {
  kind: "daily" | "weekly";
  id: string;
  date: string;
  summary: string;
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Усі" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
];

export default function PatientDiaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cycle, isLoading } = usePatientHome();
  const dailyQuery = useDailyCheckins(cycle?.id ?? null);
  const weeklyQuery = useWeeklyCheckins(cycle?.id ?? null);
  const [filter, setFilter] = useState<Filter>("all");

  const items: DiaryItem[] = useMemo(() => {
    const daily: DiaryItem[] = (dailyQuery.data ?? []).map((d) => ({
      kind: "daily" as const,
      id: d.id,
      date: d.checkin_date ?? "",
      summary: `Самопоч. ${d.wellbeing ?? "—"} · апетит ${d.appetite ?? "—"} · енергія ${d.energy ?? "—"}`,
    }));
    const weekly: DiaryItem[] = (weeklyQuery.data ?? []).map((w) => ({
      kind: "weekly" as const,
      id: w.id,
      date: w.checkin_date ?? "",
      summary: `Вага ${w.weight_kg !== null ? `${formatKg(w.weight_kg)} кг` : "—"} · талія ${w.waist_cm !== null ? `${formatKg(w.waist_cm)} см` : "—"}`,
    }));
    const merged =
      filter === "daily" ? daily : filter === "weekly" ? weekly : [...daily, ...weekly];
    return merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [dailyQuery.data, weeklyQuery.data, filter]);

  const loading =
    isLoading ||
    (cycle !== null && (dailyQuery.isPending || weeklyQuery.isPending));

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: 32 },
      ]}
      showsVerticalScrollIndicator={false}
      testID="diary-screen"
    >
      <Text style={styles.title}>Щоденник</Text>

      <View style={styles.segmentCard}>
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <Pressable
              key={f.key}
              testID={`diary-filter-${f.key}`}
              onPress={() => setFilter(f.key)}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Text
                style={[styles.segmentText, active && styles.segmentTextActive]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyWrap} testID="diary-empty">
          <View style={styles.emptyIcon}>
            <NotebookPen size={26} color={colors.sub} strokeWidth={1.6} />
          </View>
          <Text style={styles.emptyTitle}>Ще немає записів</Text>
          <Text style={styles.emptyText}>Зробіть перший чек-ін!</Text>
          <Pressable
            testID="diary-start-checkin"
            onPress={() => router.push("/daily-checkin")}
            style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}
          >
            <Text style={styles.emptyButtonText}>Почати чек-ін</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.listCard}>
          {items.map((item, i) => {
            const { day, month } = dateParts(item.date);
            return (
              <Pressable
                key={`${item.kind}-${item.id}`}
                testID={`diary-row-${item.kind}-${item.id}`}
                onPress={() =>
                  router.push({
                    pathname:
                      item.kind === "daily" ? "/daily-detail" : "/weekly-detail",
                    params: { id: item.id },
                  })
                }
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && styles.rowBorder,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.dateCol}>
                  <Text style={styles.dateDay}>{day}</Text>
                  <Text style={styles.dateMonth}>{month}</Text>
                </View>
                <View style={styles.rowCenter}>
                  <Text style={styles.rowTitle}>
                    {item.kind === "daily" ? "Daily Check-in" : "Weekly Check-in"}
                  </Text>
                  <Text style={styles.rowSummary} numberOfLines={1}>
                    {item.summary}
                  </Text>
                </View>
                <View
                  style={[
                    styles.badge,
                    item.kind === "daily" ? styles.badgeNavy : styles.badgeTeal,
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
    marginBottom: 16,
  },
  segmentCard: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: 13,
    padding: 4,
    marginBottom: 16,
    ...softShadow,
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: "center",
  },
  segmentActive: {
    backgroundColor: colors.navy,
  },
  segmentText: {
    fontFamily: fonts.semibold,
    fontSize: 13.5,
    color: colors.sub,
  },
  segmentTextActive: {
    color: "#FFFFFF",
    fontFamily: fonts.bold,
  },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 16,
    ...cardShadow,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
  },
  rowBorder: {
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
  rowCenter: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: fonts.bold,
    fontSize: 13.5,
    color: colors.ink,
  },
  rowSummary: {
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
  emptyWrap: {
    alignItems: "center",
    paddingTop: 56,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 18,
    borderWidth: 1.6,
    borderStyle: "dashed",
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  emptyTitle: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.ink,
    marginBottom: 6,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.sub,
    marginBottom: 24,
  },
  emptyButton: {
    height: 48,
    paddingHorizontal: 32,
    borderRadius: radius.button,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyButtonText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.85,
  },
});
