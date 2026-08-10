import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, MessageCircle } from "lucide-react-native";
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
import { colors, cardShadow, fonts, radius, softShadow } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

interface DoctorViewRow {
  id: string;
  first_name: string;
  last_name: string;
  specialization: string | null;
  city: string | null;
  is_founding_doctor: boolean | null;
  bio?: string | null;
  work_format?: string | null;
}

function workFormatLabel(format: string | null | undefined): string | null {
  if (format === "online") return "Онлайн";
  if (format === "offline") return "Офлайн";
  if (format === "both") return "Онлайн та офлайн";
  return null;
}

/** Doctor public profile as seen by the patient. */
export default function DoctorViewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const query = useQuery({
    queryKey: ["doctor-view", id],
    enabled: typeof id === "string" && id.length > 0,
    queryFn: async (): Promise<DoctorViewRow | null> => {
      const { data, error } = await supabase
        .from("doctor_profiles")
        .select("*")
        .eq("id", id as string)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as DoctorViewRow | null;
    },
  });

  if (query.isPending) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  const doctor = query.data ?? null;
  const formatLabel = workFormatLabel(doctor?.work_format);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Pressable
          testID="doctor-view-back"
          onPress={() => router.back()}
          style={styles.back}
          hitSlop={12}
        >
          <ArrowLeft size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Ваш лікар</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        testID="doctor-view-screen"
      >
        {doctor === null ? (
          <Text style={styles.notFound}>Лікаря не знайдено.</Text>
        ) : (
          <>
            <View style={styles.heroCard}>
              <AvatarInitials
                firstName={doctor.first_name}
                lastName={doctor.last_name}
                size={88}
              />
              <Text style={styles.name}>
                {doctor.first_name} {doctor.last_name}
              </Text>
              <Text style={styles.meta}>
                {[doctor.specialization, doctor.city]
                  .filter((v): v is string => v !== null && v.length > 0)
                  .join(" · ") || "—"}
              </Text>

              <View style={styles.badgesRow}>
                {formatLabel !== null && (
                  <View style={styles.formatBadge} testID="work-format-badge">
                    <Text style={styles.formatText}>{formatLabel}</Text>
                  </View>
                )}
                {doctor.is_founding_doctor === true && (
                  <View style={styles.foundingBadge} testID="founding-badge">
                    <Text style={styles.foundingText}>Founding Doctor</Text>
                  </View>
                )}
              </View>

              {doctor.bio !== null &&
                doctor.bio !== undefined &&
                doctor.bio.length > 0 && (
                  <Text style={styles.bioText}>{doctor.bio}</Text>
                )}
            </View>

            <Pressable
              testID="doctor-view-write"
              onPress={() => router.push("/(patient)/chat")}
              style={({ pressed }) => [styles.writeButton, pressed && styles.pressed]}
            >
              <MessageCircle size={18} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.writeButtonText}>Написати</Text>
            </Pressable>
          </>
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
    marginBottom: 14,
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
  headerTitle: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: 19,
    color: colors.navyDeep,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: 30,
    paddingHorizontal: 22,
    alignItems: "center",
    marginBottom: 16,
    ...cardShadow,
  },
  name: {
    fontFamily: fonts.serif,
    fontSize: 25,
    color: colors.ink,
    marginTop: 14,
    textAlign: "center",
  },
  meta: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.sub,
    marginTop: 4,
    textAlign: "center",
  },
  badgesRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  formatBadge: {
    backgroundColor: colors.mint,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  formatText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.tealDeep,
  },
  foundingBadge: {
    backgroundColor: colors.goldTint,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
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
    marginTop: 16,
  },
  writeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.navy,
  },
  writeButtonText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#FFFFFF",
  },
  notFound: {
    fontFamily: fonts.medium,
    fontSize: 14.5,
    color: colors.sub,
    textAlign: "center",
    marginTop: 40,
  },
  pressed: {
    opacity: 0.85,
  },
});
