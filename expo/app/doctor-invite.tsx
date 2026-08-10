import { useMutation } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { ArrowLeft, Check, Copy } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, cardShadow, fonts, radius, softShadow } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

/** Generates an 8-char invite code like GLP-4827. */
function generateInviteCode(): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `GLP-${digits}`;
}

/** Rejects after `ms` milliseconds with a connection error. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Помилка підключення"));
    }, ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function createInviteRequest(): Promise<string> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    throw new Error(userError.message);
  }
  const userId = userData.user?.id;
  if (!userId) {
    throw new Error("Користувача не знайдено. Увійдіть повторно.");
  }

  const { data: doctorProfile, error: profileError } = await supabase
    .from("doctor_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) {
    throw new Error(profileError.message);
  }
  if (!doctorProfile) {
    throw new Error("Профіль лікаря не знайдено.");
  }

  const code = generateInviteCode();
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error: insertError } = await supabase
    .from("doctor_patient_relations")
    .insert({
      doctor_id: doctorProfile.id as string,
      patient_id: null,
      status: "pending",
      invite_code: code,
      expires_at: expiresAt,
    });
  if (insertError) {
    throw new Error(insertError.message);
  }
  return code;
}

export default function DoctorInviteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const hasCreatedRef = useRef<boolean>(false);

  const createInvite = useMutation({
    mutationFn: async (): Promise<string> => {
      console.log("[doctor-invite] creating invite");
      return withTimeout(createInviteRequest(), 10000);
    },
    onSuccess: (code: string) => {
      setInviteCode(code);
    },
    onError: (err: unknown) => {
      console.log(
        "[doctor-invite] failed:",
        err instanceof Error ? err.message : err,
      );
    },
  });

  useEffect(() => {
    if (!hasCreatedRef.current) {
      hasCreatedRef.current = true;
      createInvite.mutate();
    }
  }, [createInvite]);

  const handleCopy = async () => {
    if (inviteCode === null) return;
    await Clipboard.setStringAsync(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
      ]}
      testID="doctor-invite-screen"
    >
      <Pressable
        testID="invite-back-button"
        onPress={() => router.back()}
        style={styles.back}
        hitSlop={12}
      >
        <ArrowLeft size={22} color={colors.ink} />
      </Pressable>

      <Text style={styles.title}>Запросити пацієнта</Text>

      <View style={styles.codeCard}>
        {createInvite.isPending || inviteCode === null ? (
          createInvite.isError ? (
            <Text style={styles.error} testID="invite-error">
              {createInvite.error instanceof Error
                ? createInvite.error.message
                : "Не вдалося створити запрошення."}
            </Text>
          ) : (
            <ActivityIndicator size="large" color={colors.navy} />
          )
        ) : (
          <>
            <Text style={styles.code} testID="invite-code">
              {inviteCode}
            </Text>
            <Text style={styles.codeLabel}>
              Код запрошення · дійсний 7 днів
            </Text>
          </>
        )}
      </View>

      {inviteCode !== null && (
        <Pressable
          testID="copy-code-button"
          onPress={handleCopy}
          style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}
        >
          {copied ? (
            <>
              <Check size={18} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={styles.copyText}>Скопійовано!</Text>
            </>
          ) : (
            <>
              <Copy size={18} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.copyText}>Скопіювати код</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
    paddingHorizontal: 24,
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
  title: {
    fontFamily: fonts.serif,
    fontSize: 32,
    color: colors.ink,
    marginTop: 28,
    marginBottom: 24,
  },
  codeCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: 44,
    paddingHorizontal: 24,
    alignItems: "center",
    marginBottom: 20,
    ...cardShadow,
  },
  code: {
    fontFamily: fonts.serif,
    fontSize: 44,
    color: colors.navy,
    letterSpacing: 2,
  },
  codeLabel: {
    fontFamily: fonts.medium,
    fontSize: 13.5,
    color: colors.sub,
    marginTop: 10,
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 54,
    borderRadius: radius.button,
    backgroundColor: colors.navy,
  },
  copyText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
  },
  error: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.amber,
    textAlign: "center",
  },
  pressed: {
    opacity: 0.85,
  },
});
