import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { BellRing, ChevronRight, LogOut, MessageCircle, Pencil } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
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

import AvatarInitials from "@/components/AvatarInitials";
import PrimaryButton from "@/components/PrimaryButton";
import { colors, cardShadow, fonts, radius, softShadow } from "@/constants/theme";
import { usePatientHome } from "@/hooks/usePatientHome";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import type { RelationWithDoctor } from "@/types/db";
import { daysSince, formatDateLong } from "@/utils/dates";

export default function PatientProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { userId, signOut } = useAuth();
  const { profile, cycle, latestCheckin, isLoading } = usePatientHome();

  // Direct, independent lookup of the doctor relation — deliberately not
  // routed through usePatientHome's relationQuery, which depends on that
  // hook's own patientId resolution/cache and was returning stale/empty
  // results here even when the DB relation was active.
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
      // No PostgREST embed here — the nested join was silently erroring and
      // returning null. Two plain queries are resolved instead.
      const { data: relRow, error: relError } = await supabase
        .from("doctor_patient_relations")
        .select("id, status, doctor_id")
        .eq("patient_id", patientId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (relError) {
        console.log("[relation] relation query failed:", relError.message);
        throw relError;
      }
      if (relRow === null || relRow.doctor_id === null) return null;

      const { data: docRow, error: docError } = await supabase
        .from("doctor_profiles")
        .select("id, first_name, last_name")
        .eq("id", relRow.doctor_id as string)
        .maybeSingle();
      if (docError) {
        console.log("[relation] doctor query failed:", docError.message);
        throw docError;
      }

      return {
        id: relRow.id as string,
        status: relRow.status as RelationWithDoctor["status"],
        doctor: docRow as RelationWithDoctor["doctor"],
      };
    },
  });

  const doctor = relationQuery.data?.doctor ?? null;

  const doctorInfoQuery = useQuery({
    queryKey: ["profile-doctor-info", doctor?.id ?? null],
    enabled: doctor !== null,
    queryFn: async (): Promise<{ specialization: string | null } | null> => {
      const { data, error: qError } = await supabase
        .from("doctor_profiles")
        .select("specialization")
        .eq("id", (doctor as { id: string }).id)
        .maybeSingle();
      if (qError) throw qError;
      return data as { specialization: string | null } | null;
    },
  });

  const statsQuery = useQuery({
    queryKey: ["patient-profile-stats", cycle?.id ?? null],
    enabled: cycle !== null,
    queryFn: async (): Promise<{ daily: number; weekly: number }> => {
      const [dailyRes, weeklyRes] = await Promise.all([
        supabase
          .from("daily_checkins")
          .select("id", { count: "exact", head: true })
          .eq("therapy_cycle_id", (cycle as { id: string }).id),
        supabase
          .from("weekly_checkins")
          .select("id", { count: "exact", head: true })
          .eq("therapy_cycle_id", (cycle as { id: string }).id),
      ]);
      return {
        daily: dailyRes.count ?? 0,
        weekly: weeklyRes.count ?? 0,
      };
    },
  });

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState<boolean>(false);

  const startEditing = () => {
    if (profile === null) return;
    setFirstName(profile.first_name);
    setLastName(profile.last_name);
    setCity(profile.city ?? "");
    setError(null);
    setIsEditing(true);
  };

  const saveProfile = useMutation({
    mutationFn: async (): Promise<void> => {
      if (userId === null) throw new Error("Немає сесії.");
      const { error: updateError } = await supabase
        .from("patient_profiles")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          city: city.trim(),
        })
        .eq("user_id", userId);
      if (updateError) throw new Error(updateError.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-profile"] });
      setIsEditing(false);
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    },
  });

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace("/");
    } catch (err: unknown) {
      console.error("[patient-profile] sign out failed", err);
    } finally {
      setIsSigningOut(false);
    }
  };

  if (isLoading || relationQuery.isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  const cycleDay =
    cycle?.start_date != null ? daysSince(cycle.start_date) + 1 : null;
  const cycleTotalDays =
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
    cycleDay !== null && cycleTotalDays !== null
      ? Math.min(Math.max(cycleDay / cycleTotalDays, 0), 1)
      : 0;

  const totalCheckins =
    (statsQuery.data?.daily ?? 0) + (statsQuery.data?.weekly ?? 0);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: 40 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        testID="patient-profile-screen"
      >
        <View style={styles.headerRow}>
          <Text style={styles.screenTitle}>Профіль</Text>
          {!isEditing && (
            <Pressable
              testID="edit-profile-button"
              onPress={startEditing}
              style={styles.editButton}
              hitSlop={8}
            >
              <Pencil size={18} color={colors.navy} strokeWidth={2} />
            </Pressable>
          )}
        </View>

        {isEditing ? (
          <View testID="patient-profile-edit">
            <Text style={styles.fieldLabel}>Імʼя</Text>
            <TextInput
              testID="edit-first-name"
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
            />
            <Text style={styles.fieldLabel}>Прізвище</Text>
            <TextInput
              testID="edit-last-name"
              style={styles.input}
              value={lastName}
              onChangeText={setLastName}
            />
            <Text style={styles.fieldLabel}>Місто</Text>
            <TextInput
              testID="edit-city"
              style={styles.input}
              value={city}
              onChangeText={setCity}
              placeholder="Київ"
              placeholderTextColor={colors.sub}
            />

            {error !== null && (
              <Text style={styles.error} testID="profile-error">
                {error}
              </Text>
            )}

            <View style={styles.editActions}>
              <Pressable
                testID="cancel-edit-button"
                onPress={() => setIsEditing(false)}
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.cancelText}>Скасувати</Text>
              </Pressable>
              <View style={styles.flex2}>
                <PrimaryButton
                  label="Зберегти"
                  variant="navy"
                  loading={saveProfile.isPending}
                  onPress={() => saveProfile.mutate()}
                  testID="save-profile-button"
                />
              </View>
            </View>
          </View>
        ) : (
          <View testID="patient-profile-view">
            <View style={styles.heroCard}>
              <AvatarInitials
                firstName={profile?.first_name}
                lastName={profile?.last_name}
                size={84}
              />
              <Text style={styles.name}>
                {profile?.first_name} {profile?.last_name}
              </Text>
              <Text style={styles.meta}>
                {[
                  profile?.city !== null &&
                  profile?.city !== undefined &&
                  profile.city.length > 0
                    ? profile.city
                    : null,
                  profile?.date_of_birth != null
                    ? formatDateLong(profile.date_of_birth)
                    : null,
                ]
                  .filter((v): v is string => v !== null)
                  .join(" · ") || "—"}
              </Text>
            </View>

            {cycle !== null && (
              <View style={styles.cycleCard} testID="profile-cycle-card">
                <Text style={styles.cycleLabel}>Активний цикл</Text>
                <Text style={styles.cycleName}>
                  {cycle.protocol_name ?? "Без назви"}
                </Text>
                {cycleDay !== null && (
                  <Text style={styles.cycleDayText}>
                    День {cycleDay}
                    {cycleTotalDays !== null ? ` з ${cycleTotalDays}` : ""}
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
                <Text style={styles.goalLine}>
                  {cycle.goal_start ?? "—"} → {cycle.goal_target ?? "—"}{" "}
                  {cycle.goal_unit ?? "кг"}
                  {latestCheckin?.weight_kg != null
                    ? ` · зараз ${latestCheckin.weight_kg}`
                    : ""}
                </Text>
              </View>
            )}

            {doctor !== null ? (
              <Pressable
                testID="profile-doctor-card"
                onPress={() =>
                  router.push({
                    pathname: "/doctor-view",
                    params: { id: doctor.id },
                  })
                }
                style={({ pressed }) => [
                  styles.doctorCard,
                  pressed && styles.pressed,
                ]}
              >
                <AvatarInitials
                  firstName={doctor.first_name}
                  lastName={doctor.last_name}
                  size={46}
                />
                <View style={styles.doctorInfo}>
                  <Text style={styles.doctorName}>
                    {doctor.first_name} {doctor.last_name}
                  </Text>
                  <Text style={styles.doctorSpec}>
                    {doctorInfoQuery.data?.specialization != null &&
                    doctorInfoQuery.data.specialization.length > 0
                      ? doctorInfoQuery.data.specialization
                      : "Ваш лікар"}
                  </Text>
                </View>
                <Pressable
                  testID="profile-write-doctor"
                  onPress={() => router.push("/(patient)/chat")}
                  style={styles.writeChip}
                  hitSlop={6}
                >
                  <MessageCircle size={15} color="#FFFFFF" strokeWidth={2} />
                  <Text style={styles.writeChipText}>Написати</Text>
                </Pressable>
                <ChevronRight size={18} color={colors.sub} strokeWidth={2} />
              </Pressable>
            ) : (
              <View style={styles.noDoctorCard} testID="profile-no-doctor">
                <Text style={styles.noDoctorText}>
                  Ви не підключені до лікаря
                </Text>
                <Pressable
                  testID="profile-connect-doctor"
                  onPress={() => router.push("/patient-join")}
                  style={({ pressed }) => [
                    styles.connectButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.connectButtonText}>Підключитися</Text>
                </Pressable>
              </View>
            )}

            {cycle !== null && (
              <View style={styles.statsRow} testID="profile-quick-stats">
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{totalCheckins}</Text>
                  <Text style={styles.statLabel}>Чек-інів</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={[styles.statValue, styles.tealStat]}>
                    {statsQuery.data?.weekly ?? 0}
                  </Text>
                  <Text style={styles.statLabel}>Тижнів</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>
                    {cycleDay ?? "—"}
                  </Text>
                  <Text style={styles.statLabel}>Днів у циклі</Text>
                </View>
              </View>
            )}

            <Pressable
              testID="reminders-link"
              onPress={() => router.push("/reminders")}
              style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
            >
              <View style={styles.menuIcon}>
                <BellRing size={18} color={colors.tealDeep} strokeWidth={2} />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.menuTitle}>Нагадування</Text>
                <Text style={styles.menuSub}>Час і частота чек-інів</Text>
              </View>
              <ChevronRight size={18} color={colors.sub} strokeWidth={1.8} />
            </Pressable>

            <Pressable
              testID="sign-out-button"
              onPress={handleSignOut}
              disabled={isSigningOut}
              style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
            >
              <LogOut size={18} color={colors.amber} strokeWidth={2} />
              <Text style={styles.signOutText}>Вийти</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 16,
    marginTop: 14,
  },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  menuText: { flex: 1 },
  menuTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  menuSub: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.sub,
    marginTop: 1,
  },
  flex: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  flex2: {
    flex: 2,
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
  content: {
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  screenTitle: {
    fontFamily: fonts.serif,
    fontSize: 24,
    color: colors.navyDeep,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    ...softShadow,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    marginBottom: 14,
    ...cardShadow,
  },
  name: {
    fontFamily: fonts.serif,
    fontSize: 24,
    color: colors.ink,
    marginTop: 14,
  },
  meta: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.sub,
    marginTop: 4,
    textAlign: "center",
  },
  cycleCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 14,
    ...cardShadow,
  },
  cycleLabel: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.sub,
  },
  cycleName: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: colors.navyDeep,
    marginTop: 3,
  },
  cycleDayText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.sub,
    marginTop: 3,
    marginBottom: 10,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.hairline,
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
  },
  goalLine: {
    fontFamily: fonts.semibold,
    fontSize: 13.5,
    color: colors.navy,
    marginTop: 10,
  },
  doctorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
    ...cardShadow,
  },
  doctorInfo: {
    flex: 1,
  },
  doctorName: {
    fontFamily: fonts.bold,
    fontSize: 14.5,
    color: colors.ink,
  },
  doctorSpec: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.sub,
    marginTop: 2,
  },
  writeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.navy,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  writeChipText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: "#FFFFFF",
  },
  noDoctorCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 18,
    alignItems: "center",
    marginBottom: 14,
    ...cardShadow,
  },
  noDoctorText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.sub,
    marginBottom: 12,
  },
  connectButton: {
    height: 42,
    paddingHorizontal: 26,
    borderRadius: radius.button,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  connectButtonText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    ...softShadow,
  },
  statValue: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.navy,
  },
  tealStat: {
    color: colors.tealDeep,
  },
  statLabel: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: colors.sub,
    marginTop: 3,
  },
  fieldLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13.5,
    color: colors.sub,
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.button,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
    ...softShadow,
  },
  editActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
    alignItems: "center",
  },
  cancelButton: {
    flex: 1,
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    ...softShadow,
  },
  cancelText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.sub,
  },
  error: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.amber,
    marginTop: 14,
  },
  signOut: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    ...softShadow,
  },
  signOutText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.amber,
  },
  pressed: {
    opacity: 0.8,
  },
});
