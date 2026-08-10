import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { KeyRound } from "lucide-react-native";
import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ChatThread from "@/components/ChatThread";
import { colors, fonts, radius, softShadow } from "@/constants/theme";
import { getOrCreateConversation } from "@/hooks/useChat";
import { usePatientHome } from "@/hooks/usePatientHome";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import type { RelationWithDoctor } from "@/types/db";

export default function PatientChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const { profile, isLoading } = usePatientHome();

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
      const { data } = await supabase
        .from("doctor_patient_relations")
        .select("id, status, doctor:doctor_profiles(id, first_name, last_name)")
        .eq("patient_id", patientId)
        .eq("status", "active")
        .maybeSingle();
      return data as unknown as RelationWithDoctor | null;
    },
  });

  const doctor = relationQuery.data?.doctor ?? null;
  const patientProfileId = profile?.id ?? null;

  const conversationQuery = useQuery({
    queryKey: ["conversation", doctor?.id ?? null, patientProfileId],
    enabled: doctor !== null && patientProfileId !== null,
    queryFn: async (): Promise<string> =>
      getOrCreateConversation(
        (doctor as { id: string }).id,
        patientProfileId as string,
      ),
  });

  if (isLoading || relationQuery.isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  if (doctor === null) {
    return (
      <View style={[styles.emptyWrap, { paddingTop: insets.top + 72 }]}>
        <View style={styles.emptyIcon}>
          <KeyRound size={26} color={colors.teal} strokeWidth={1.6} />
        </View>
        <Text style={styles.emptyTitle}>
          Підключіться до лікаря, щоб почати чат
        </Text>
        <Pressable
          testID="chat-join-doctor"
          onPress={() => router.push("/patient-join")}
          style={({ pressed }) => [styles.joinButton, pressed && styles.pressed]}
        >
          <Text style={styles.joinButtonText}>Підключитися</Text>
        </Pressable>
      </View>
    );
  }

  const conversationId = conversationQuery.data ?? null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
        <View style={styles.header}>
          <View style={styles.headerCenter}>
            <Text style={styles.headerName} numberOfLines={1}>
              {doctor.first_name} {doctor.last_name}
            </Text>
            <View style={styles.onlineRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>у мережі</Text>
            </View>
          </View>
        </View>

        {conversationQuery.isError ? (
          <Text style={styles.errorText} testID="conversation-error">
            {conversationQuery.error instanceof Error
              ? conversationQuery.error.message
              : "Помилка завантаження чату"}
          </Text>
        ) : conversationId === null || userId === null ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.navy} />
          </View>
        ) : (
          <ChatThread conversationId={conversationId} myUserId={userId} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.paper,
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
  header: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerCenter: {
    flexDirection: "column",
  },
  headerName: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.navyDeep,
  },
  onlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.teal,
  },
  onlineText: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: colors.sub,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.amber,
    textAlign: "center",
    marginTop: 32,
    paddingHorizontal: 24,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.paper,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  emptyTitle: {
    fontFamily: fonts.serif,
    fontSize: 19,
    color: colors.ink,
    textAlign: "center",
    marginBottom: 24,
  },
  joinButton: {
    height: 48,
    paddingHorizontal: 32,
    borderRadius: radius.button,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
    ...softShadow,
  },
  joinButtonText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.85,
  },
});
