import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  Bell,
  CalendarClock,
  Clock,
  KeyRound,
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
import { formatKg } from "@/utils/format";

export default function PatientHomeScreen() {
  const insets = useSafeAreaInsets();
  const { profile, relation, cycle, latestCheckin, isLoading } = usePatientHome();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  const doctorName =
    relation?.doctor !== null && relation?.doctor !== undefined
      ? `${relation.doctor.first_name} ${relation.doctor.last_name}`
      : null;

  const hasActiveCycle = cycle !== null;

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
