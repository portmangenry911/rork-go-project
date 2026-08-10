import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
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
import { colors, fonts, softShadow } from "@/constants/theme";
import { getOrCreateConversation } from "@/hooks/useChat";
import { useDoctorHome } from "@/hooks/useDoctorHome";
import { useAuth } from "@/providers/AuthProvider";

/** Doctor-side conversation screen, pushed with a patientId param. */
export default function ChatThreadScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const { patientId, name } = useLocalSearchParams<{
    patientId: string;
    name?: string;
  }>();
  const { profile } = useDoctorHome();
  const doctorProfileId = profile?.id ?? null;

  const conversationQuery = useQuery({
    queryKey: ["conversation", doctorProfileId, patientId],
    enabled:
      doctorProfileId !== null &&
      typeof patientId === "string" &&
      patientId.length > 0,
    queryFn: async (): Promise<string> =>
      getOrCreateConversation(doctorProfileId as string, patientId as string),
  });

  const conversationId = conversationQuery.data ?? null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        <View style={styles.header}>
          <Pressable
            testID="chat-thread-back"
            onPress={() => router.back()}
            style={styles.back}
            hitSlop={12}
          >
            <ArrowLeft size={22} color={colors.ink} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerName} numberOfLines={1}>
              {name ?? "Чат"}
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
          <ChatThread
            conversationId={conversationId}
            myUserId={userId}
            bottomPadding={insets.bottom}
          />
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
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: colors.paper,
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
  headerCenter: {
    flex: 1,
  },
  headerName: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: colors.navyDeep,
  },
  onlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 1,
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
});
