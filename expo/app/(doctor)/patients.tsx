import { File, Paths } from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { Download, Search, UserPlus } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AvatarInitials from "@/components/AvatarInitials";
import { colors, cardShadow, fonts, radius, softShadow } from "@/constants/theme";
import { useDoctorPatients } from "@/hooks/useDoctorPatients";
import type { DoctorPatientItem } from "@/hooks/useDoctorPatients";
import { daysSince, todayISO } from "@/utils/dates";
import { formatKg } from "@/utils/format";

type Filter = "all" | "active" | "attention";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Усі" },
  { key: "active", label: "Активні" },
  { key: "attention", label: "Потребують уваги" },
];

function updatedLabel(date: string | null): string {
  if (date === null) return "немає чек-інів";
  const days = daysSince(date);
  if (days === 0) return "оновлено сьогодні";
  if (days === 1) return "оновлено вчора";
  return `оновлено ${days} дн. тому`;
}

/** Wraps a CSV field in quotes when it contains a comma, quote or newline. */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildPatientsCsv(rows: DoctorPatientItem[]): string {
  const header = ["Ім'я", "Дата підключення", "Статус циклу", "Останній чек-ін"];
  const lines = [header.map(csvField).join(",")];
  for (const p of rows) {
    lines.push(
      [
        `${p.firstName} ${p.lastName}`,
        p.connectedAt !== null ? p.connectedAt.slice(0, 10) : "",
        p.cycle !== null ? "Активний цикл" : "Немає циклу",
        p.lastCheckinDate ?? "",
      ]
        .map(csvField)
        .join(","),
    );
  }
  return lines.join("\n");
}

export default function DoctorPatientsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { patients, isLoading } = useDoctorPatients();
  const [search, setSearch] = useState<string>("");
  const [filter, setFilter] = useState<Filter>("all");
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const filtered: DoctorPatientItem[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return patients.filter((p) => {
      if (
        q.length > 0 &&
        !`${p.firstName} ${p.lastName}`.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (filter === "active") return p.cycle !== null;
      if (filter === "attention") return p.needsAttention;
      return true;
    });
  }, [patients, search, filter]);

  const handleExportCsv = async (): Promise<void> => {
    setExportError(null);
    setIsExporting(true);
    try {
      const csv = buildPatientsCsv(filtered);
      const filename = `pacienty-${todayISO()}.csv`;

      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        return;
      }

      const file = new File(Paths.cache, filename);
      file.create({ overwrite: true });
      file.write(csv);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, { mimeType: "text/csv" });
      }
    } catch (err) {
      console.log("[patients] csv export failed:", err);
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
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
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      testID="doctor-patients-screen"
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>Пацієнти</Text>
        <Pressable
          testID="export-patients-csv"
          onPress={handleExportCsv}
          disabled={isExporting || filtered.length === 0}
          style={({ pressed }) => [
            styles.exportButton,
            pressed && styles.pressed,
          ]}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color={colors.navy} />
          ) : (
            <Download size={18} color={colors.navy} strokeWidth={2} />
          )}
        </Pressable>
      </View>

      {exportError !== null && (
        <Text style={styles.exportError} testID="export-error">
          {exportError}
        </Text>
      )}

      <View style={styles.searchBar}>
        <Search size={18} color={colors.sub} strokeWidth={1.8} />
        <TextInput
          testID="patient-search-input"
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Пошук пацієнта…"
          placeholderTextColor={colors.sub}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipRow}
      >
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <Pressable
              key={f.key}
              testID={`patient-filter-${f.key}`}
              onPress={() => setFilter(f.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  active && styles.filterChipTextActive,
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {patients.length === 0 ? (
        <View style={styles.emptyWrap} testID="patients-empty">
          <View style={styles.emptyIcon}>
            <UserPlus size={26} color={colors.sub} strokeWidth={1.6} />
          </View>
          <Text style={styles.emptyTitle}>Ще немає пацієнтів</Text>
          <Pressable
            testID="invite-patient-button"
            onPress={() => router.push("/doctor-invite")}
            style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}
          >
            <Text style={styles.emptyButtonText}>Запросити пацієнта</Text>
          </Pressable>
        </View>
      ) : filtered.length === 0 ? (
        <Text style={styles.noResults}>Нічого не знайдено.</Text>
      ) : (
        <View style={styles.listCard}>
          {filtered.map((p, i) => (
            <Pressable
              key={p.patientId}
              testID={`patient-row-${p.patientId}`}
              onPress={() =>
                router.push({
                  pathname: "/patient-detail",
                  params: { id: p.patientId },
                })
              }
              style={({ pressed }) => [
                styles.row,
                i > 0 && styles.rowBorder,
                pressed && styles.pressed,
              ]}
            >
              <View>
                <AvatarInitials
                  firstName={p.firstName}
                  lastName={p.lastName}
                  size={44}
                />
                <View
                  style={[
                    styles.statusDot,
                    p.needsAttention ? styles.dotAmber : styles.dotTeal,
                  ]}
                />
              </View>
              <View style={styles.rowCenter}>
                <Text style={styles.rowName}>
                  {p.firstName} {p.lastName}
                </Text>
                <Text style={styles.rowSub}>
                  {p.cycle !== null
                    ? `Цикл · день ${p.cycleDay ?? "?"}${p.cycleTotalDays !== null ? ` / ${p.cycleTotalDays}` : ""}`
                    : "Немає активного циклу"}
                </Text>
                {p.attentionLabel !== null && (
                  <Text style={styles.rowAttention}>{p.attentionLabel}</Text>
                )}
              </View>
              <View style={styles.rowRight}>
                {p.weightDelta !== null && (
                  <Text style={styles.deltaText}>
                    {p.weightDelta > 0 ? "+" : p.weightDelta < 0 ? "−" : ""}
                    {formatKg(Math.abs(p.weightDelta))} кг
                  </Text>
                )}
                <Text style={styles.updatedText}>
                  {updatedLabel(p.lastCheckinDate)}
                </Text>
              </View>
            </Pressable>
          ))}
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
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 24,
    color: colors.navyDeep,
  },
  exportButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    ...softShadow,
  },
  exportError: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.amber,
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius.button,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 14,
    ...softShadow,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
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
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    ...softShadow,
  },
  filterChipActive: {
    backgroundColor: colors.navy,
  },
  filterChipText: {
    fontFamily: fonts.semibold,
    fontSize: 13.5,
    color: colors.sub,
  },
  filterChipTextActive: {
    fontFamily: fonts.bold,
    color: "#FFFFFF",
  },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingHorizontal: 16,
    ...cardShadow,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  statusDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.card,
  },
  dotTeal: {
    backgroundColor: colors.teal,
  },
  dotAmber: {
    backgroundColor: colors.amber,
  },
  rowCenter: {
    flex: 1,
  },
  rowName: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  rowAttention: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.gold,
    marginTop: 2,
  },
  rowSub: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.sub,
    marginTop: 2,
  },
  rowRight: {
    alignItems: "flex-end",
  },
  deltaText: {
    fontFamily: fonts.serif,
    fontSize: 16,
    color: colors.tealDeep,
  },
  updatedText: {
    fontFamily: fonts.medium,
    fontSize: 10.5,
    color: colors.sub,
    marginTop: 2,
  },
  noResults: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.sub,
    textAlign: "center",
    marginTop: 32,
  },
  emptyWrap: {
    alignItems: "center",
    paddingTop: 48,
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
    marginBottom: 20,
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
