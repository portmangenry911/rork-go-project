import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/lib/supabase";

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface ConversationRow {
  id: string;
  doctor_id: string;
  patient_id: string;
}

/** Finds an existing doctor↔patient conversation or creates one. */
export async function getOrCreateConversation(
  doctorProfileId: string,
  patientProfileId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("doctor_id", doctorProfileId)
    .eq("patient_id", patientProfileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data !== null) return (data as { id: string }).id;

  const { data: inserted, error: insertError } = await supabase
    .from("conversations")
    .insert({ doctor_id: doctorProfileId, patient_id: patientProfileId })
    .select("id")
    .single();
  if (insertError) {
    const retry = await supabase
      .from("conversations")
      .select("id")
      .eq("doctor_id", doctorProfileId)
      .eq("patient_id", patientProfileId)
      .maybeSingle();
    if (retry.data !== null) return (retry.data as { id: string }).id;
    throw new Error(insertError.message);
  }
  return (inserted as { id: string }).id;
}

/**
 * Messages for a conversation, ascending by created_at.
 * Uses Supabase Realtime when available, plus a 10s polling fallback.
 */
export function useConversationMessages(conversationId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["chat-messages", conversationId],
    enabled: conversationId !== null,
    refetchInterval: 10000,
    queryFn: async (): Promise<ChatMessage[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, body, created_at")
        .eq("conversation_id", conversationId as string)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ChatMessage[];
    },
  });

  useEffect(() => {
    if (conversationId === null) return;
    // Unique channel name per mount — reusing "messages-{conversationId}"
    // across quick navigations can hand back an already-subscribed channel
    // object from the client's internal registry, and calling .on() on an
    // already-subscribed channel throws "cannot add postgres_changes
    // callbacks ... after subscribe()". A unique suffix avoids that clash.
    const channelId = `messages-${conversationId}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["chat-messages", conversationId],
          });
        },
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  return query;
}
