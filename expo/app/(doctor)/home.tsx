import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  BellRing,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  MessageCircle,
  Plus,
  RefreshCw,
  UserPlus,
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
import NotificationBell from "@/components/NotificationBell";
import { colors, cardShadow, fonts, radius, softShadow } from "@/constants/theme";
import { useDoctorHome } from "@/hooks/useDoctorHome";
import {
  useDoctorPatients,
  type DoctorPatientItem,
} from "@/hooks/useDoctorPatients";

const PLAN_LIMIT = 15;

export default function DoctorHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, relations, isLoading } = useDoctorHome();
  const { patients } = useDoctorPatients();
  const flagged = patients.filter((p) => p.needsAttention);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  const activeCount = relations.length;
  const hasPatients = activeCount > 0;
  const progress = Math.min(activeCount / PLAN_LIMIT, 1);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: 32 },
      ]}
      showsVerticalScrollIndicator={false}
      testID="doctor-home"
    >
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>Доброго ранку,</Text>
          <Text style={styles.name}>{profile?.last_name ?? ""}</Text>
        </View>
        <View style={styles.topRight}>
          <NotificationBell />
          <AvatarInitials
            firstName={profile?.first_name}
            lastName={profile?.last_name}
            size={42}
          />
        </View>
      </View>

      {profile?.is_founding_doctor === true && (
        <View style={styles.foundingPill} testID="founding-badge">
          <Text style={styles.foundingText}>🏆 Founding Doctor</Text>
        </View>
      )}

      <View style={styles.planCard} testID="plan-strip">
        <View style={styles.planRow}>
          <Text style={styles.planTitle}>
            Professional · {activeCount} / {PLAN_LIMIT} пацієнтів
          </Text>
          <Pressable hitSlop={8}>
            <Text style={styles.planLink}>Керувати</Text>
          </Pressable>
        </View>
        <View style={styles.planTrack}>
          <LinearGradient
            colors={[colors.navy, colors.teal]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.planFill, { width: `${Math.max(progress * 100, 2)}%` }]}
          />
        </View>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{activeCount}</Text>
          <Text style={styles.statLabel}>Активні пацієнти</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Консультації сьогодні</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Нові питання</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>€0</Text>
          <Text style={styles.statLabel}>Дохід за місяць</Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
          testID="add-patient-button"
          onPress={() => router.push("/doctor-invite")}
        >
          <Plus size={18} color="#FFFFFF" strokeWidth={2.4} />
          <Text style={styles.primaryActionText}>Додати пацієнта</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
          testID="cycle-button"
          onPress={() => router.push("/create-cycle")}
        >
          <RefreshCw size={16} color={colors.navy} strokeWidth={2} />
          <Text style={styles.secondaryActionText}>Цикл</Text>
        </Pressable>
      </View>

      {hasPatients ? (
        <View style={styles.section} testID="needs-attention">
          <Text style={styles.sectionTitle}>Потребує уваги</Text>

          {flagged.length === 0 ? (
            <View style={styles.allClearCard} testID="all-clear">
              <CheckCircle2 size={22} color={colors.tealDeep} strokeWidth={2} />
              <View style={styles.allClearText}>
                <Text style={styles.allClearTitle}>Усі пацієнти в нормі</Text>
                <Text style={styles.allClearSub}>
                  Чек-іни свіжі, тривожних сигналів немає.
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.listCard}>
              {flagged.map((item, index) => (
                <View key={item.patientId}>
                  {index > 0 && <View style={styles.divider} />}
                  <AttentionRow item={item} />
                </View>
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={styles.emptyState} testID="doctor-empty-state">
          <View style={styles.emptyIcon}>
            <UserPlus size={30} color={colors.teal} strokeWidth={1.5} />
          </View>
          <Text style={styles.emptyTitle}>Ще немає пацієнтів</Text>
          <Text style={styles.emptyText}>
            Запросіть першого пацієнта — надішліть код чи посилання, і почніть
            вести терапію.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}
            testID="invite-patient-button"
            onPress={() => router.push("/doctor-invite")}
          >
            <Plus size={18} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={styles.emptyButtonText}>Запросити пацієнта</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

interface ActionSpec {
  label: string;
  icon: React.ReactNode;
}

/** Maps an attention reason to the single most useful next action. */
function actionFor(item: DoctorPatientItem): ActionSpec {
  switch (item.attentionReason) {
    case "cycle_ending":
      return {
        label: "Новий цикл",
        icon: <CalendarPlus size={15} color={colors.navy} strokeWidth={2} />,
      };
    case "no_checkin":
      return {
        label: "Нагадати",
        icon: <BellRing size={15} color={colors.navy} strokeWidth={2} />,
      };
    default:
      return {
        label: "Написати",
        icon: <MessageCircle size={15} color={colors.navy} strokeWidth={2} />,
      };
  }
}

/** One flagged patient: reason on the left, one contextual action on the right. */
function AttentionRow({ item }: { item: DoctorPatientItem }) {
  const router = useRouter();
  const action = actionFor(item);
  const fullName = `${item.firstName} ${item.lastName}`;

  const openPatient = (): void => {
    router.push({ pathname: "/patient-detail", params: { id: item.patientId } });
  };

  const runAction = (): void => {
    if (item.attentionReason === "cycle_ending") {
      router.push("/create-cycle");
      return;
    }
    router.push({
      pathname: "/chat-thread",
      params: { patientId: item.patientId, name: fullName },
    });
  };

  return (
    <View style={styles.attentionRow}>
      <Pressable
        onPress={openPatient}
        style={({ pressed }) => [styles.attentionMain, pressed && styles.pressed]}
        testID={`attention-row-${item.patientId}`}
      >
        <AvatarInitials
          firstName={item.firstName}
          lastName={item.lastName}
          size={42}
          tint="mint"
        />
        <View style={styles.patientInfo}>
          <Text style={styles.patientName}>{fullName}</Text>
          <Text style={styles.attentionLabel}>
            {item.attentionLabel ?? "Потребує уваги"}
          </Text>
        </View>
      </Pressable>

      <Pressable
        onPress={runAction}
        style={({ pressed }) => [styles.actionChip, pressed && styles.pressed]}
        testID={`attention-action-${item.patientId}`}
      >
        {action.icon}
        <Text style={styles.actionChipText}>{action.label}</Text>
      </Pressable>
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
    marginBottom: 14,
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
  foundingPill: {
    alignSelf: "flex-start",
    backgroundColor: colors.goldTint,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 14,
  },
  foundingText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.gold,
  },
  planCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 16,
    marginBottom: 16,
    ...cardShadow,
  },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  planTitle: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
  },
  planLink: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.blue,
  },
  planTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.hairline,
    overflow: "hidden",
  },
  planFill: {
    height: 6,
    borderRadius: 3,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 16,
    ...cardShadow,
  },
  statNumber: {
    fontFamily: fonts.serif,
    fontSize: 30,
    color: colors.ink,
  },
  statLabel: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.sub,
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  primaryAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.navy,
  },
  primaryActionText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#FFFFFF",
  },
  secondaryAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 52,
    paddingHorizontal: 20,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    ...softShadow,
  },
  secondaryActionText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.navy,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.ink,
    marginBottom: 12,
  },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingHorizontal: 16,
    ...cardShadow,
  },
  divider: {
    height: 1,
    backgroundColor: colors.hairline,
  },
  attentionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 10,
  },
  attentionMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  attentionLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.gold,
    marginTop: 2,
  },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1.2,
    borderColor: colors.navy,
    backgroundColor: colors.card,
  },
  actionChipText: {
    fontFamily: fonts.semibold,
    fontSize: 12.5,
    color: colors.navy,
  },
  allClearCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 17,
    ...cardShadow,
  },
  allClearText: { flex: 1 },
  allClearTitle: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  allClearSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.sub,
    marginTop: 2,
  },
  patientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  patientInfo: {
    flex: 1,
  },
  patientName: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  patientSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.sub,
    marginTop: 2,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 24,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.teal,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ink,
    marginBottom: 8,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 14.5,
    color: colors.sub,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 52,
    paddingHorizontal: 24,
    borderRadius: radius.button,
    backgroundColor: colors.navy,
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
