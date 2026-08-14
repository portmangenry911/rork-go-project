import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Plus, Send } from "lucide-react-native";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, fonts, softShadow } from "@/constants/theme";
import { useConversationMessages } from "@/hooks/useChat";
import type { ChatMessage } from "@/hooks/useChat";
import { supabase } from "@/lib/supabase";
import { pushNotification } from "@/hooks/useNotifications";

interface ChatThreadProps {
  conversationId: string;
  myUserId: string;
  /** Extra bottom padding under the input bar (safe area / tab bar). */
  bottomPadding?: number;
}

function timeLabel(createdAt: string): string {
  const d = new Date(createdAt);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** Shared doctor↔patient message thread with input bar. */
export default function ChatThread({
  conversationId,
  myUserId,
  bottomPadding = 0,
}: ChatThreadProps) {
  const queryClient = useQueryClient();
  const messagesQuery = useConversationMessages(conversationId);
  const [text, setText] = useState<string>("");
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  const sendMessage = useMutation({
    mutationFn: async (body: string): Promise<void> => {
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: myUserId,
        body,
      });
      if (error) throw new Error(error.message);

      // Notify the other side of the conversation.
      const { data: convo, error: convoError } = await supabase
        .from("conversations")
        .select("doctor_id, patient_id")
        .eq("id", conversationId)
        .maybeSingle();
      console.log("[notify] convo", conversationId, convo, convoError?.message);
      if (convo === null || convo === undefined) return;

      const [doctorRes, patientRes] = await Promise.all([
        supabase
          .from("doctor_profiles")
          .select("user_id, first_name, last_name")
          .eq("id", convo.doctor_id as string)
          .maybeSingle(),
        supabase
          .from("patient_profiles")
          .select("user_id, first_name, last_name")
          .eq("id", convo.patient_id as string)
          .maybeSingle(),
      ]);

      const doctorUser = doctorRes.data?.user_id ?? null;
      const patientUser = patientRes.data?.user_id ?? null;
      const iAmDoctor = myUserId === doctorUser;
      const recipient = iAmDoctor ? patientUser : doctorUser;
      console.log("[notify] me", myUserId, "doctor", doctorUser, "patient", patientUser, "recipient", recipient);
      console.log("[notify] errors", doctorRes.error?.message, patientRes.error?.message);
      if (recipient === null) return;

      const sender = iAmDoctor ? doctorRes.data : patientRes.data;
      const senderName =
        sender === null || sender === undefined
          ? "Нове повідомлення"
          : `${sender.first_name ?? ""} ${sender.last_name ?? ""}`.trim();

      console.log("[notify] inserting for", recipient);
      await pushNotification({
        recipientUserId: recipient as string,
        kind: "message",
        title: senderName.length > 0 ? senderName : "Нове повідомлення",
        body: body.length > 80 ? `${body.slice(0, 80)}…` : body,
        link: iAmDoctor ? "/(patient)/chat" : "/(doctor)/chat",
      });
    },
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({
        queryKey: ["chat-messages", conversationId],
      });
      queryClient.invalidateQueries({ queryKey: ["chat-previews"] });
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    },
    onError: (err: unknown) => {
      setSendError(err instanceof Error ? err.message : String(err));
    },
  });

  const handleSend = () => {
    const body = text.trim();
    if (body.length === 0 || sendMessage.isPending) return;
    setSendError(null);
    sendMessage.mutate(body);
  };

  const messages: ChatMessage[] = messagesQuery.data ?? [];

  return (
    <View style={styles.flex} testID="chat-thread">
      {messagesQuery.isPending ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: false })
          }
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 && (
            <Text style={styles.emptyText}>Почніть розмову 👋</Text>
          )}
          {messages.map((msg) => {
            const mine = msg.sender_id === myUserId;
            return (
              <View
                key={msg.id}
                style={[styles.bubbleWrap, mine ? styles.wrapMine : styles.wrapTheirs]}
              >
                {mine ? (
                  <LinearGradient
                    colors={[colors.navyDeep, colors.navy]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.bubble, styles.bubbleMine]}
                  >
                    <Text style={styles.bubbleTextMine}>{msg.body}</Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.bubble, styles.bubbleTheirs]}>
                    <Text style={styles.bubbleTextTheirs}>{msg.body}</Text>
                  </View>
                )}
                <Text
                  style={[
                    styles.timestamp,
                    mine ? styles.timestampMine : styles.timestampTheirs,
                  ]}
                >
                  {timeLabel(msg.created_at)}
                </Text>
              </View>
            );
          })}
          {sendError !== null && (
            <Text style={styles.errorText} testID="chat-send-error">
              {sendError}
            </Text>
          )}
        </ScrollView>
      )}

      <View style={[styles.inputBar, { paddingBottom: 10 + bottomPadding }]}>
        <Pressable style={styles.plusButton} testID="chat-plus-button">
          <Plus size={20} color={colors.navy} strokeWidth={2.2} />
        </Pressable>
        <TextInput
          testID="chat-input"
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Повідомлення…"
          placeholderTextColor={colors.sub}
          multiline
        />
        <Pressable
          testID="chat-send-button"
          onPress={handleSend}
          disabled={sendMessage.isPending || text.trim().length === 0}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <LinearGradient
            colors={[colors.navy, colors.teal]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.sendButton}
          >
            {sendMessage.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Send size={17} color="#FFFFFF" strokeWidth={2} />
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  emptyText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.sub,
    textAlign: "center",
    marginTop: 32,
  },
  bubbleWrap: {
    marginBottom: 10,
    maxWidth: "80%",
  },
  wrapMine: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  wrapTheirs: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMine: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 5,
    borderBottomLeftRadius: 18,
  },
  bubbleTheirs: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 5,
    ...softShadow,
  },
  bubbleTextMine: {
    fontFamily: fonts.medium,
    fontSize: 14.5,
    color: "#FFFFFF",
    lineHeight: 21,
  },
  bubbleTextTheirs: {
    fontFamily: fonts.medium,
    fontSize: 14.5,
    color: colors.ink,
    lineHeight: 21,
  },
  timestamp: {
    fontFamily: fonts.medium,
    fontSize: 9.5,
    color: colors.sub,
    marginTop: 3,
  },
  timestampMine: {
    marginRight: 4,
  },
  timestampTheirs: {
    marginLeft: 4,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.amber,
    textAlign: "center",
    marginTop: 8,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  plusButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 110,
    borderRadius: 22,
    backgroundColor: colors.paper,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontFamily: fonts.medium,
    fontSize: 14.5,
    color: colors.ink,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.85,
  },
});
