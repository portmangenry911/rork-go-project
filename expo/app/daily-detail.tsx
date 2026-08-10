import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, softShadow } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import type { DailyCheckin } from "@/types/db";
import { formatDateLong } from "@/utils/dates";

export default function DailyDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const query = useQuery({
    queryKey: ["daily-checkin-detail", id],
    enabled: typeof id === "string" && id.length > 0,
    queryFn: async (): Promise<DailyCheckin | null> => {
      const { data, error } = await supabase
        .from("daily_checkins")
        .select(
          "id, therapy_cycle_id, patient_id, checkin_date, wellbeing, appetite, food_noise, energy, sleep, nausea, weakness, notes",
        )
        .eq("id", id as string)
        .maybeSingle();
      if (error) throw error;
      return data as DailyCheckin | null;
    },
  });

  if (query.isPending) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  const row = query.data ?? null;

  const symptomList: string[] = [];
  if (row?.nausea === true) symptomList.push("Нудота");
  if (row?.weakness === true) symptomList.push("Втома");

  const scoreValue = (v: number | null): string =>
    v !== null ? `${v} / 10` : "—";

  const rows: { label: string; value: string }[] =
    row !== null
      ? [
          { label: "Самопочуття", value: scoreValue(row.wellbeing) },
          { label: "Апетит", value: scoreValue(row.appetite) },
          { label: "Харчовий шум", value: scoreValue(row.food_noise) },
          { label: "Енергія", value: scoreValue(row.energy) },
          { label: "Якість сну", value: scoreValue(row.sleep) },
          {
            label: "Симптоми",
            value: symptomList.length > 0 ? symptomList.join(", ") : "Немає",
          },
          { label: "Нотатка", value: row.notes ?? "—" },
        ]
      : [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Pressable
          testID="daily-detail-back"
          onPress={() => router.back()}
          style={styles.back}
          hitSlop={12}
        >
          <ArrowLeft size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          Daily ·{" "}
          {row?.checkin_date !== null && row?.checkin_date !== undefined
            ? formatDateLong(row.checkin_date)
            : "—"}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        testID="daily-detail-screen"
      >
        {row === null ? (
          <Text style={styles.notFound}>Запис не знайдено.</Text>
        ) : (
          rows.map((r) => (
            <View key={r.label} style={styles.row}>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Text style={styles.rowValue}>{r.value}</Text>
            </View>
          ))
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
    marginBottom: 16,
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
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: 19,
    color: colors.navyDeep,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 15,
    marginBottom: 10,
    gap: 12,
    ...softShadow,
  },
  rowLabel: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.sub,
  },
  rowValue: {
    flexShrink: 1,
    fontFamily: fonts.semibold,
    fontSize: 14.5,
    color: colors.ink,
    textAlign: "right",
  },
  notFound: {
    fontFamily: fonts.medium,
    fontSize: 14.5,
    color: colors.sub,
    textAlign: "center",
    marginTop: 40,
  },
});
