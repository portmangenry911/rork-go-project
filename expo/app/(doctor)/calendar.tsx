import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Users } from "lucide-react-native";
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
import { useDoctorPatients } from "@/hooks/useDoctorPatients";
import { supabase } from "@/lib/supabase";
import { todayISO } from "@/utils/dates";

const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"] as const;

interface WeekCheckin {
  therapy_cycle_id: string;
  checkin_date: string;
  kind: "daily" | "weekly";
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday of the week `offset` weeks from the current one. */
function mondayOf(offset: number): Date {
  const now = new Date();
  const dayIndex = (now.getDay() + 6) % 7;
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - dayIndex + offset * 7,
  );
}

export default function DoctorCalendarScreen() {
  const insets = useSafeAreaInsets();
  const { patients, isLoading } = useDoctorPatients();
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [selectedDay, setSelectedDay] = useState<string>(todayISO());

  const weekDays: string[] = useMemo(() => {
    const monday = mondayOf(weekOffset);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(
        monday.getFullYear(),
        monday.getMonth(),
        monday.getDate() + i,
      );
      return toISO(d);
    });
  }, [weekOffset]);

  const cyclePatients = useMemo(
    () => patients.filter((p) => p.cycle !== null),
    [patients],
  );
  const cycleIds = useMemo(
    () => cyclePatients.map((p) => (p.cycle as { id: string }).id),
    [cyclePatients],
  );

  const checkinsQuery = useQuery({
    queryKey: ["calendar-checkins", weekDays[0], cycleIds.join(",")],
    enabled: cycleIds.length > 0,
    queryFn: async (): Promise<WeekCheckin[]> => {
      const from = weekDays[0];
      const to = weekDays[6];
      const [dailyRes, weeklyRes] = await Promise.all([
        supabase
          .from("daily_checkins")
          .select("therapy_cycle_id, checkin_date")
          .in("therapy_cycle_id", cycleIds)
          .gte("checkin_date", from)
          .lte("checkin_date", to),
        supabase
          .from("weekly_checkins")
          .select("therapy_cycle_id, checkin_date")
          .in("therapy_cycle_id", cycleIds)
          .gte("checkin_date", from)
          .lte("checkin_date", to),
      ]);
      if (dailyRes.error) throw new Error(dailyRes.error.message);
      if (weeklyRes.error) throw new Error(weeklyRes.error.message);
      const daily = (dailyRes.data ?? []).map((r) => ({
        therapy_cycle_id: r.therapy_cycle_id as string,
        checkin_date: (r.checkin_date as string | null) ?? "",
        kind: "daily" as const,
      }));
      const weekly = (weeklyRes.data ?? []).map((r) => ({
        therapy_cycle_id: r.therapy_cycle_id as string,
        checkin_date: (r.checkin_date as string | null) ?? "",
        kind: "weekly" as const,
      }));
      return [...daily, ...weekly];
    },
  });

  if (isLoading || (cycleIds.length > 0 && checkinsQuery.isPending)) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  const checkins = checkinsQuery.data ?? [];
  const today = todayISO();

  const dayHasCheckin = (day: string): boolean =>
    checkins.some((c) => c.checkin_date === day);
  const dayHasMissing = (day: string): boolean =>
    day <= today &&
    cyclePatients.some(
      (p) =>
        !checkins.some(
          (c) =>
            c.checkin_date === day &&
            c.therapy_cycle_id === (p.cycle as { id: string }).id,
        ),
    );

  const weekCheckinsCount = checkins.length;

  const selectedDayItems = cyclePatients.map((p) => {
    const cycleId = (p.cycle as { id: string }).id;
    const kinds = checkins
      .filter((c) => c.checkin_date === selectedDay && c.therapy_cycle_id === cycleId)
      .map((c) => (c.kind === "daily" ? "Daily" : "Weekly"));
    return {
      patientId: p.patientId,
      name: `${p.firstName} ${p.lastName}`,
      kinds,
    };
  });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: 32 },
      ]}
      showsVerticalScrollIndicator={false}
      testID="doctor-calendar-screen"
    >
      <Text style={styles.title}>Календар</Text>

      {cyclePatients.length === 0 ? (
        <View style={styles.emptyWrap} testID="calendar-empty">
          <View style={styles.emptyIcon}>
            <Users size={26} color={colors.sub} strokeWidth={1.6} />
          </View>
          <Text style={styles.emptyText}>
            Додайте пацієнтів, щоб бачити активність
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.weekCard}>
            <View style={styles.weekNav}>
              <Pressable
                testID="calendar-prev-week"
                onPress={() => setWeekOffset((o) => o - 1)}
                style={styles.navButton}
                hitSlop={8}
              >
                <ChevronLeft size={20} color={colors.navy} strokeWidth={2} />
              </Pressable>
              <Text style={styles.weekLabel}>
                {weekOffset === 0
                  ? "Цей тиждень"
                  : weekOffset === -1
                    ? "Минулий тиждень"
                    : weekOffset === 1
                      ? "Наступний тиждень"
                      : `${weekDays[0].slice(8)}.${weekDays[0].slice(5, 7)} – ${weekDays[6].slice(8)}.${weekDays[6].slice(5, 7)}`}
              </Text>
              <Pressable
                testID="calendar-next-week"
                onPress={() => setWeekOffset((o) => o + 1)}
                style={styles.navButton}
                hitSlop={8}
              >
                <ChevronRight size={20} color={colors.navy} strokeWidth={2} />
              </Pressable>
            </View>

            <View style={styles.daysRow}>
              {weekDays.map((day, i) => {
                const isToday = day === today;
                const isSelected = day === selectedDay;
                return (
                  <Pressable
                    key={day}
                    testID={`calendar-day-${day}`}
                    onPress={() => setSelectedDay(day)}
                    style={[
                      styles.dayCell,
                      isToday && styles.dayCellToday,
                      isSelected && !isToday && styles.dayCellSelected,
                    ]}
                  >
                    <Text
                      style={[styles.dayAbbrev, isToday && styles.dayTextToday]}
                    >
                      {DAY_LABELS[i]}
                    </Text>
                    <Text
                      style={[styles.dayNumber, isToday && styles.dayTextToday]}
                    >
                      {parseInt(day.slice(8), 10)}
                    </Text>
                    <View style={styles.dotsRow}>
                      {dayHasCheckin(day) && <View style={styles.dotTeal} />}
                      {dayHasMissing(day) && <View style={styles.dotAmber} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Text style={styles.sectionLabel}>
            АКТИВНІСТЬ · {parseInt(selectedDay.slice(8), 10)}.
            {selectedDay.slice(5, 7)}
          </Text>
          <View style={styles.dayListCard} testID="calendar-day-list">
            {selectedDayItems.map((item, i) => (
              <View
                key={item.patientId}
                style={[styles.dayListRow, i > 0 && styles.dayListRowBorder]}
              >
                <View
                  style={[
                    styles.statusDot,
                    item.kinds.length > 0 ? styles.dotTealBig : styles.dotAmberBig,
                  ]}
                />
                <Text style={styles.dayListName}>{item.name}</Text>
                <Text
                  style={[
                    styles.dayListStatus,
                    item.kinds.length > 0
                      ? styles.statusTeal
                      : styles.statusAmber,
                  ]}
                >
                  {item.kinds.length > 0 ? item.kinds.join(" + ") : "Без чек-іну"}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{cyclePatients.length}</Text>
              <Text style={styles.statLabel}>Активні пацієнти цього тижня</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, styles.tealText]}>
                {weekCheckinsCount}
              </Text>
              <Text style={styles.statLabel}>Чек-інів отримано</Text>
            </View>
          </View>
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
    marginBottom: 16,
  },
  weekCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 14,
    marginBottom: 20,
    ...cardShadow,
  },
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  weekLabel: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
  },
  daysRow: {
    flexDirection: "row",
    gap: 4,
  },
  dayCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
  },
  dayCellToday: {
    backgroundColor: colors.navy,
  },
  dayCellSelected: {
    backgroundColor: colors.mint,
  },
  dayAbbrev: {
    fontFamily: fonts.semibold,
    fontSize: 10.5,
    color: colors.sub,
  },
  dayNumber: {
    fontFamily: fonts.serif,
    fontSize: 17,
    color: colors.ink,
    marginTop: 3,
  },
  dayTextToday: {
    color: "#FFFFFF",
  },
  dotsRow: {
    flexDirection: "row",
    gap: 3,
    marginTop: 5,
    height: 6,
  },
  dotTeal: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.teal,
  },
  dotAmber: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.amber,
  },
  sectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.sub,
    marginBottom: 10,
  },
  dayListCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingHorizontal: 16,
    marginBottom: 20,
    ...cardShadow,
  },
  dayListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
  },
  dayListRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotTealBig: {
    backgroundColor: colors.teal,
  },
  dotAmberBig: {
    backgroundColor: colors.amber,
  },
  dayListName: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 14.5,
    color: colors.ink,
  },
  dayListStatus: {
    fontFamily: fonts.bold,
    fontSize: 12.5,
  },
  statusTeal: {
    color: colors.tealDeep,
  },
  statusAmber: {
    color: colors.amber,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: "center",
    ...softShadow,
  },
  statValue: {
    fontFamily: fonts.serif,
    fontSize: 24,
    color: colors.navy,
  },
  tealText: {
    color: colors.tealDeep,
  },
  statLabel: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: colors.sub,
    marginTop: 4,
    textAlign: "center",
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
    marginBottom: 16,
  },
  emptyText: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: colors.sub,
    textAlign: "center",
  },
});
