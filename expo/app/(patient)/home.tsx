import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  Bell,
  CalendarClock,
  Camera,
  Clock,
  KeyRound,
  SlidersHorizontal,
  MessageCircle,
} from "lucide-react-native";
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

import AvatarInitials from "@/components/AvatarInitials";
import ProgressRing from "@/components/ProgressRing";
import { colors, cardShadow, fonts, radius, softShadow } from "@/constants/theme";
import { usePatientHome } from "@/hooks/usePatientHome";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import type { RelationWithDoctor } from "@/types/db";
import { formatKg } from "@/utils/format";

export default function PatientHomeScreen() {
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const { profile, cycle, latestCheckin, isLoading } = usePatientHome();

  // Direct, independent lookup of the doctor relation — same fix as in
  // chat.tsx / profile.tsx. Not routed through usePatientHome's own
  // relationQuery, which was returning stale/empty results here.
  const relationQuery = useQuery({
    queryKey: ["direct-relation", userId],
    enabled: !!userId,
    queryFn: async (): Promise<RelationWithDoctor | null> => {
      const profileResult = await supabase
        .from("patient_profiles")
        .select("id")
        .eq("user_id", userId as string)
        .single();
      const patientId = profileResult.data?.id;
      if (!patientId) return null;
      const { data } = await supabase
        .from("doctor_patient_relations")
        .select("id, status, doctor:doctor_profiles(id, first_name, last_name)")
        .eq("patient_id", patientId)
        .eq("status", "active")
        .maybeSingle();
      return data as unknown as RelationWithDoctor | null;
    },
  });

  // Checks whether a "before" baseline photo already exists for the active
  // cycle, so we know whether to show the onboarding prompt.
  const beforePhotoQuery = useQuery({
    queryKey: ["has-before-photo", cycle?.id ?? null],
    enabled: cycle !== null,
    queryFn: async (): Promise<boolean> => {
      const { count } = await supabase
        .from("progress_photos")
        .select("id", { count: "exact", head: true })
        .eq("therapy_cycle_id", cycle?.id as string);
      return (count ?? 0) > 0;
    },
  });

  if (isLoading || relationQuery.isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  const doctorName =
    relationQuery.data?.doctor !== null &&
    relationQuery.data?.doctor !== undefined
      ? `${relationQuery.data.doctor.first_name} ${relationQuery.data.doctor.last_name}`
      : null;

  const hasActiveCycle = cycle !== null;
  const showBeforePhotoPrompt =
    hasActiveCycle &&
    beforePhotoQuery.isSuccess &&
    beforePhotoQuery.data === false;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: 32 },
      ]}
      showsVerticalScrollIndicator={false}
      testID="patient-home"
    >
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>Доброго ранку,</Text>
          <Text style={styles.name}>{profile?.first_name ?? ""}</Text>
        </View>
        <View style={styles.topRight}>
          <Pressable style={styles.bell} hitSlop={8}>
            <Bell size={20} color={colors.ink} strokeWidth={1.8} />
          </Pressable>
          <AvatarInitials
            firstName={profile?.first_name}
            lastName={profile?.last_name}
            size={42}
          />
        </View>
      </View>

      {showBeforePhotoPrompt && <BeforePhotoBanner />}

      {hasActiveCycle ? <CurrentDoseCard cycleId={cycle.id} /> : null}

      {hasActiveCycle ? (
        <ActiveCycleContent
          doctorName={doctorName}
          goalStart={cycle.goal_start ?? 0}
          goalTarget={cycle.goal_target ?? 0}
          goalUnit={cycle.goal_unit ?? "кг"}
          currentWeight={latestCheckin?.weight_kg ?? null}
        />
      ) : (
        <WaitingState doctorName={doctorName} />
      )}
    </ScrollView>
  );
}

interface DoseRow {
  dose_value: number;
  dose_unit: string;
  frequency: string;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  step_order: number;
}

/** Shows only the titration step whose date range covers today. */
function CurrentDoseCard({ cycleId }: { cycleId: string }) {
  const doseQuery = useQuery({
    queryKey: ["current-dose", cycleId],
    queryFn: async (): Promise<DoseRow[]> => {
      const { data, error } = await supabase
        .from("titration_steps")
        .select(
          "dose_value, dose_unit, frequency, start_date, end_date, notes, step_order",
        )
        .eq("therapy_cycle_id", cycleId)
        .order("step_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DoseRow[];
    },
  });

  const rows = doseQuery.data ?? [];
  if (rows.length === 0) return null;

  const now = new Date();
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const active =
    rows.find((r) => {
      const afterStart = r.start_date === null || r.start_date <= todayISO;
      const beforeEnd = r.end_date === null || r.end_date >= todayISO;
      return afterStart && beforeEnd;
    }) ?? null;

  if (active === null) return null;

  const doseText = String(active.dose_value).replace(".", ",");

  return (
    <View style={styles.doseCard} testID="current-dose-card">
      <View style={styles.doseIcon}>
        <SlidersHorizontal size={19} color={colors.tealDeep} strokeWidth={2} />
      </View>
      <View style={styles.doseBody}>
        <Text style={styles.doseLabel}>ПОТОЧНЕ ДОЗУВАННЯ</Text>
        <Text style={styles.doseValue}>
          {doseText}
          <Text style={styles.doseUnit}> {active.dose_unit}</Text>
        </Text>
        <Text style={styles.doseFreq}>{active.frequency}</Text>
        {active.notes !== null && active.notes.length > 0 ? (
          <Text style={styles.doseNote}>{active.notes}</Text>
        ) : null}
      </View>
    </View>
  );
}

function BeforePhotoBanner() {
  const router = useRouter();
  return (
    <Pressable
      testID="before-photo-banner"
      onPress={() => router.push("/before-photo")}
      style={({ pressed }) => [styles.beforeBanner, pressed && styles.pressed]}
    >
      <View style={styles.beforeBannerIcon}>
        <Camera size={20} color={colors.tealDeep} strokeWidth={1.8} />
      </View>
      <View style={styles.beforeBannerText}>
        <Text style={styles.beforeBannerTitle}>Додайте фото «до»</Text>
        <Text style={styles.beforeBannerSubtitle}>
          Зафіксуйте старт, щоб бачити прогрес
        </Text>
      </View>
    </Pressable>
  );
}

interface ActiveCycleContentProps {
  doctorName: string | null;
  goalStart: number;
  goalTarget: number;
  goalUnit: string;
  currentWeight: number | null;
}

function ActiveCycleContent({
  doctorName,
  goalStart,
  goalTarget,
  goalUnit,
  currentWeight,
}: ActiveCycleContentProps) {
  const router = useRouter();
  const current = currentWeight ?? goalStart;
  const span = goalTarget - goalStart;
  const progress =
    span !== 0 ? Math.min(Math.max((current - goalStart) / span, 0), 1) : 0;
  const lostThisCycle = goalStart - current;
  const toGoal = current - goalTarget;

  return (
    <View>
      {doctorName !== null && (
        <View style={styles.doctorCard} testID="doctor-strip">
          <View style={styles.doctorInfo}>
            <Text style={styles.doctorLabel}>Ваш лікар</Text>
            <Text style={styles.doctorName}>{doctorName}</Text>
          </View>
          <Pressable style={styles.chatIcon} hitSlop={8}>
            <MessageCircle size={19} color={colors.tealDeep} strokeWidth={1.8} />
          </Pressable>
        </View>
      )}

      <View style={styles.heroCard} testID="progress-hero">
        <ProgressRing size={216} strokeWidth={16} progress={progress}>
          <Text style={styles.heroWeight}>{formatKg(current)}</Text>
          <Text style={styles.heroUnit}>кг зараз</Text>
          <Text style={styles.heroGoal}>
            мета — {formatKg(goalTarget)} {goalUnit}
          </Text>
        </ProgressRing>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={[styles.heroStatNumber, styles.tealText]}>
              {formatKg(lostThisCycle)}
            </Text>
            <Text style={styles.heroStatLabel}>кг за цикл</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={[styles.heroStatNumber, styles.navyText]}>
              {formatKg(toGoal)}
            </Text>
            <Text style={styles.heroStatLabel}>кг до мети</Text>
          </View>
        </View>
      </View>

      <LinearGradient
        colors={[colors.navy, colors.navyDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.ctaCard}
        testID="checkin-cta"
      >
        <Text style={styles.ctaTitle}>Час зафіксувати тиждень</Text>
        <Text style={styles.ctaSubtitle}>
          Вага, заміри, фото та самопочуття · 5 кроків
        </Text>
        <Pressable
          style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
          testID="start-checkin-button"
          onPress={() => router.push("/daily-checkin")}
        >
          <Text style={styles.ctaButtonText}>Почати чек-ін</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.ctaButton,
            styles.weeklyButton,
            pressed && styles.pressed,
          ]}
          testID="start-weekly-checkin-button"
          onPress={() => router.push("/weekly-checkin")}
        >
          <Text style={styles.ctaButtonText}>Тижневий чек-ін</Text>
        </Pressable>
      </LinearGradient>

      <Text style={styles.sectionTitle}>Найближче</Text>
      <View style={styles.nearestCard}>
        <View style={styles.nearestIcon}>
          <CalendarClock size={20} color={colors.teal} strokeWidth={1.8} />
        </View>
        <Text style={styles.nearestText}>Немає запланованих консультацій</Text>
      </View>
    </View>
  );
}

function WaitingState({ doctorName }: { doctorName: string | null }) {
  const router = useRouter();
  return (
    <View style={styles.waitingWrap} testID="patient-empty-state">
      <View style={styles.waitingIcon}>
        <Clock size={30} color={colors.teal} strokeWidth={1.5} />
      </View>
      <Text style={styles.waitingTitle}>Лікар готує ваш план</Text>
      <Text style={styles.waitingText}>
        Ви підключені. Щойно лікар розпочне терапевтичний цикл — тут зʼявиться
        щоденник і прогрес.
      </Text>

      {doctorName !== null ? (
        <View style={styles.waitingDoctorCard} testID="waiting-doctor-card">
          <View style={styles.doctorInfo}>
            <Text style={styles.doctorLabel}>Ваш лікар</Text>
            <Text style={styles.doctorName}>{doctorName}</Text>
          </View>
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>Очікування</Text>
          </View>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.joinCard, pressed && styles.pressed]}
          testID="join-doctor-card"
          onPress={() => router.push("/patient-join")}
        >
          <View style={styles.nearestIcon}>
            <KeyRound size={20} color={colors.teal} strokeWidth={1.8} />
          </View>
          <Text style={styles.joinText}>Приєднайтеся до лікаря за кодом</Text>
        </Pressable>
      )}
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
  content: {
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  greeting: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.sub,
  },
  name: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
    marginTop: 2,
  },
  topRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    ...softShadow,
  },
  doseCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 18,
    marginHorizontal: 20,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: colors.teal,
    ...cardShadow,
  },
  doseIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  doseBody: { flex: 1 },
  doseLabel: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    letterSpacing: 1.3,
    color: colors.sub,
  },
  doseValue: {
    fontFamily: fonts.serif,
    fontSize: 26,
    color: colors.navyDeep,
    marginTop: 2,
  },
  doseUnit: { fontFamily: fonts.medium, fontSize: 15, color: colors.sub },
  doseFreq: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.sub,
    marginTop: 1,
  },
  doseNote: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.gold,
    marginTop: 6,
    lineHeight: 17,
  },
  beforeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.mint,
    borderRadius: radius.card,
    padding: 16,
    marginBottom: 16,
  },
  beforeBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  beforeBannerText: {
    flex: 1,
  },
  beforeBannerTitle: {
    fontFamily: fonts.bold,
    fontSize: 14.5,
    color: colors.tealDeep,
  },
  beforeBannerSubtitle: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.sub,
    marginTop: 2,
  },
  doctorCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 16,
    marginBottom: 16,
    ...cardShadow,
  },
  doctorInfo: {
    flex: 1,
  },
  doctorLabel: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.sub,
  },
  doctorName: {
    fontFamily: fonts.serif,
    fontSize: 17,
    color: colors.ink,
    marginTop: 2,
  },
  chatIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: 28,
    alignItems: "center",
    marginBottom: 16,
    ...cardShadow,
  },
  heroWeight: {
    fontFamily: fonts.serif,
    fontSize: 44,
    color: colors.ink,
    lineHeight: 50,
  },
  heroUnit: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.sub,
  },
  heroGoal: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.navy,
    marginTop: 6,
  },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
    gap: 24,
  },
  heroStat: {
    alignItems: "center",
  },
  heroStatNumber: {
    fontFamily: fonts.serif,
    fontSize: 24,
  },
  tealText: {
    color: colors.tealDeep,
  },
  navyText: {
    color: colors.navy,
  },
  heroStatLabel: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.sub,
    marginTop: 2,
  },
  heroDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.hairline,
  },
  ctaCard: {
    borderRadius: radius.card,
    padding: 20,
    marginBottom: 24,
    ...cardShadow,
  },
  ctaTitle: {
    fontFamily: fonts.serif,
    fontSize: 21,
    color: "#FFFFFF",
  },
  ctaSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    color: "rgba(255,255,255,0.75)",
    marginTop: 6,
    marginBottom: 18,
  },
  ctaButton: {
    height: 50,
    borderRadius: radius.button,
    backgroundColor: colors.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaButtonText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#FFFFFF",
  },
  weeklyButton: {
    backgroundColor: colors.tealDeep,
    marginTop: 10,
  },
  sectionTitle: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.ink,
    marginBottom: 12,
  },
  nearestCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 16,
    ...cardShadow,
  },
  nearestIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  nearestText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.sub,
  },
  waitingWrap: {
    alignItems: "center",
    paddingTop: 48,
    paddingHorizontal: 8,
  },
  waitingIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  waitingTitle: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ink,
    marginBottom: 8,
  },
  waitingText: {
    fontFamily: fonts.regular,
    fontSize: 14.5,
    color: colors.sub,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  waitingDoctorCard: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 16,
    ...cardShadow,
  },
  pendingBadge: {
    backgroundColor: colors.mint,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pendingBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.tealDeep,
  },
  joinCard: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 16,
    ...cardShadow,
  },
  joinText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 14.5,
    color: colors.navy,
  },
  pressed: {
    opacity: 0.85,
  },
});
