import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { MessageCircle } from "lucide-react-native";
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
import { colors, cardShadow, fonts, radius } from "@/constants/theme";
import { useDoctorHome } from "@/hooks/useDoctorHome";
import { supabase } from "@/lib/supabase";

interface PreviewInfo {
  conversationId: string;
  patientId: string;
  lastBody: string | null;
  lastAt: string | null;
}

function previewTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function DoctorChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, relations, isLoading } = useDoctorHome();
  const doctorId = profile?.id ?? null;

  const previewsQuery = useQuery({
    queryKey: ["chat-previews", doctorId],
    enabled: doctorId !== null,
    refetchInterval: 15000,
    queryFn: async (): Promise<PreviewInfo[]> => {
      const { data: convData, error: convError } = await supabase
        .from("conversations")
        .select("id, patient_id")
        .eq("doctor_id", doctorId as string);
      if (convError) throw new Error(convError.message);
      const conversations = (convData ?? []) as {
        id: string;
        patient_id: string;
      }[];
      if (conversations.length === 0) return [];

      const { data: msgData, error: msgError } = await supabase
        .from("messages")
        .select("conversation_id, body, created_at")
        .in(
          "conversation_id",
          conversations.map((c) => c.id),
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (msgError) throw new Error(msgError.message);
      const msgs = (msgData ?? []) as {
        conversation_id: string;
        body: string;
        created_at: string;
      }[];

      return conversations.map((c) => {
        const last = msgs.find((m) => m.conversation_id === c.id) ?? null;
        return {
          conversationId: c.id,
          patientId: c.patient_id,
          lastBody: last?.body ?? null,
          lastAt: last?.created_at ?? null,
        };
      });
    },
  });

  if (isLoading || (doctorId !== null && previewsQuery.isPending)) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  const previews = previewsQuery.data ?? [];
  const patients = relations.filter((r) => r.patient !== null);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: 32 },
      ]}
      showsVerticalScrollIndicator={false}
      testID="doctor-chat-screen"
    >
      <Text style={styles.title}>Чат</Text>

      {patients.length === 0 ? (
        <View style={styles.emptyWrap} testID="chat-empty">
          <View style={styles.emptyIcon}>
            <MessageCircle size={26} color={colors.sub} strokeWidth={1.6} />
          </View>
          <Text style={styles.emptyText}>Немає активних чатів</Text>
        </View>
      ) : (
        <View style={styles.listCard}>
          {patients.map((r, i) => {
            const patient = r.patient as {
              id: string;
              first_name: string;
              last_name: string;
            };
            const preview =
              previews.find((p) => p.patientId === patient.id) ?? null;
            return (
              <Pressable
                key={patient.id}
                testID={`chat-row-${patient.id}`}
                onPress={() =>
                  router.push({
                    pathname: "/chat-thread",
                    params: {
                      patientId: patient.id,
                      name: `${patient.first_name} ${patient.last_name}`,
                    },
                  })
                }
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && styles.rowBorder,
                  pressed && styles.pressed,
                ]}
              >
                <AvatarInitials
                  firstName={patient.first_name}
                  lastName={patient.last_name}
                  size={46}
                />
                <View style={styles.rowCenter}>
                  <Text style={styles.rowName}>
                    {patient.first_name} {patient.last_name}
                  </Text>
                  <Text style={styles.rowPreview} numberOfLines={1}>
                    {preview?.lastBody ?? "Почніть розмову"}
                  </Text>
                </View>
                {preview?.lastAt !== null && preview?.lastAt !== undefined && (
                  <Text style={styles.rowTime}>{previewTime(preview.lastAt)}</Text>
                )}
              </Pressable>
            );
          })}
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
  title: {
    fontFamily: fonts.serif,
    fontSize: 24,
    color: colors.navyDeep,
    marginBottom: 16,
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
  rowCenter: {
    flex: 1,
  },
  rowName: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  rowPreview: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.sub,
    marginTop: 2,
  },
  rowTime: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.sub,
  },
  emptyWrap: {
    alignItems: "center",
    paddingTop: 56,
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
    marginBottom: 16,
  },
  emptyText: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: colors.sub,
  },
  pressed: {
    opacity: 0.85,
  },
});
