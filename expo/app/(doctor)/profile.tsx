import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { LogOut, Pencil } from "lucide-react-native";
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
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

interface DoctorProfileRow {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  specialization: string | null;
  city: string | null;
  is_founding_doctor: boolean | null;
  bio?: string | null;
  work_format?: string | null;
}

type WorkFormat = "online" | "offline" | "both";

const WORK_FORMATS: { key: WorkFormat; label: string }[] = [
  { key: "online", label: "Онлайн" },
  { key: "offline", label: "Офлайн" },
  { key: "both", label: "Обидва" },
];

export default function DoctorProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { userId, signOut } = useAuth();

  const profileQuery = useQuery({
    queryKey: ["doctor-profile-full", userId],
    enabled: userId !== null,
    queryFn: async (): Promise<DoctorProfileRow | null> => {
      const { data, error } = await supabase
        .from("doctor_profiles")
        .select("*")
        .eq("user_id", userId as string)
        .maybeSingle();
      if (error) throw error;
      return data as DoctorProfileRow | null;
    },
  });

  const profile = profileQuery.data ?? null;
  const doctorId = profile?.id ?? null;

  const statsQuery = useQuery({
    queryKey: ["doctor-profile-stats", doctorId],
    enabled: doctorId !== null,
    queryFn: async (): Promise<{ active: number; completed: number }> => {
      const [relationsRes, cyclesRes] = await Promise.all([
        supabase
          .from("doctor_patient_relations")
          .select("id", { count: "exact", head: true })
          .eq("doctor_id", doctorId as string)
          .eq("status", "active"),
        supabase
          .from("therapy_cycles")
          .select("id", { count: "exact", head: true })
          .eq("doctor_id", doctorId as string)
          .eq("status", "completed"),
      ]);
      return {
        active: relationsRes.count ?? 0,
        completed: cyclesRes.count ?? 0,
      };
    },
  });

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [specialization, setSpecialization] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [bio, setBio] = useState<string>("");
  const [workFormat, setWorkFormat] = useState<WorkFormat>("both");
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState<boolean>(false);

  const startEditing = () => {
    if (profile === null) return;
    setFirstName(profile.first_name);
    setLastName(profile.last_name);
    setSpecialization(profile.specialization ?? "");
    setCity(profile.city ?? "");
    setBio(profile.bio ?? "");
    const wf = profile.work_format;
    setWorkFormat(wf === "online" || wf === "offline" || wf === "both" ? wf : "both");
    setError(null);
    setIsEditing(true);
  };

  const saveProfile = useMutation({
    mutationFn: async (): Promise<void> => {
      if (userId === null) throw new Error("Немає сесії.");
      const payload: Record<string, string> = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        specialization: specialization.trim(),
        city: city.trim(),
      };
      if (profile !== null && "bio" in profile) {
        payload.bio = bio.trim();
      }
      if (profile !== null && "work_format" in profile) {
        payload.work_format = workFormat;
      }
      const { error: updateError } = await supabase
        .from("doctor_profiles")
        .update(payload)
        .eq("user_id", userId);
      if (updateError) throw new Error(updateError.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctor-profile-full"] });
      queryClient.invalidateQueries({ queryKey: ["doctor-profile"] });
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
      console.error("[doctor-profile] sign out failed", err);
    } finally {
      setIsSigningOut(false);
    }
  };

  if (profileQuery.isPending) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

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
        testID="doctor-profile-screen"
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
          <View testID="doctor-profile-edit">
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
            <Text style={styles.fieldLabel}>Спеціалізація</Text>
            <TextInput
              testID="edit-specialization"
              style={styles.input}
              value={specialization}
              onChangeText={setSpecialization}
              placeholder="Ендокринолог"
              placeholderTextColor={colors.sub}
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
            <Text style={styles.fieldLabel}>Біо</Text>
            <TextInput
              testID="edit-bio"
              style={[styles.input, styles.bioInput]}
              value={bio}
              onChangeText={setBio}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              placeholder="Кілька слів про вас…"
              placeholderTextColor={colors.sub}
            />
            <Text style={styles.fieldLabel}>Формат роботи</Text>
            <View style={styles.segmentCard}>
              {WORK_FORMATS.map((wf) => {
                const active = wf.key === workFormat;
                return (
                  <Pressable
                    key={wf.key}
                    testID={`work-format-${wf.key}`}
                    onPress={() => setWorkFormat(wf.key)}
                    style={[styles.segment, active && styles.segmentActive]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        active && styles.segmentTextActive,
                      ]}
                    >
                      {wf.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

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
          <View testID="doctor-profile-view">
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
                {[profile?.specialization, profile?.city]
                  .filter((v) => v !== null && v !== undefined && v.length > 0)
                  .join(" · ") || "—"}
              </Text>
              {profile?.is_founding_doctor === true && (
                <View style={styles.foundingBadge} testID="founding-badge">
                  <Text style={styles.foundingText}>Founding Doctor</Text>
                </View>
              )}
              {profile?.bio !== null &&
                profile?.bio !== undefined &&
                profile.bio.length > 0 && (
                  <Text style={styles.bioText}>{profile.bio}</Text>
                )}
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {statsQuery.data?.active ?? "—"}
                </Text>
                <Text style={styles.statLabel}>Активні пацієнти</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statValue, styles.tealText]}>
                  {statsQuery.data?.completed ?? "—"}
                </Text>
                <Text style={styles.statLabel}>Успішних випадків</Text>
              </View>
            </View>

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
  foundingBadge: {
    backgroundColor: colors.goldTint,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 12,
  },
  foundingText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.gold,
  },
  bioText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.sub,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 14,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 18,
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
    fontSize: 12.5,
    color: colors.sub,
    marginTop: 4,
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
  bioInput: {
    minHeight: 96,
    paddingTop: 13,
  },
  segmentCard: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: 13,
    padding: 4,
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
