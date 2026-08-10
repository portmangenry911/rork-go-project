import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowLeft, CheckCircle2 } from "lucide-react-native";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import PrimaryButton from "@/components/PrimaryButton";
import { colors, cardShadow, fonts, radius, softShadow } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

async function joinByCode(rawCode: string): Promise<void> {
  const inviteCode = rawCode.trim().toUpperCase();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    throw new Error(userError.message);
  }
  const userId = userData.user?.id;
  if (!userId) {
    throw new Error("Користувача не знайдено. Увійдіть повторно.");
  }

  const { data: patientProfile, error: profileError } = await supabase
    .from("patient_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) {
    throw new Error(profileError.message);
  }
  if (!patientProfile) {
    throw new Error("Профіль пацієнта не знайдено.");
  }

  console.log("[patient-join] looking up code:", inviteCode);
  const { data: rows, error: findError } = await supabase
    .from("doctor_patient_relations")
    .select("id")
    .ilike("invite_code", inviteCode)
    .eq("status", "pending")
    .limit(1);
  if (findError) {
    throw new Error(findError.message);
  }
  const relation = rows?.[0] ?? null;
  if (relation === null) {
    throw new Error("Код не знайдено або термін дії вичерпано");
  }

  const { data: updated, error: updateError } = await supabase
    .from("doctor_patient_relations")
    .update({ patient_id: patientProfile.id as string, status: "active" })
    .eq("id", relation.id as string)
    .select("id");
  if (updateError) {
    throw new Error(updateError.message);
  }
  if (updated === null || updated.length === 0) {
    throw new Error(
      "Оновлення заблоковано політикою доступу (RLS UPDATE).",
    );
  }
}

export default function PatientJoinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [code, setCode] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const joinMutation = useMutation({
    mutationFn: (inviteCode: string): Promise<void> => joinByCode(inviteCode),
    onSuccess: () => {
      setIsConnected(true);
      queryClient.invalidateQueries({ queryKey: ["patient-doctor-relation"] });
      queryClient.invalidateQueries({ queryKey: ["patient-active-cycle"] });
    },
    onError: (err: unknown) => {
      console.log(
        "[patient-join] failed:",
        err instanceof Error ? err.message : err,
      );
      setError(
        err instanceof Error ? err.message : String(err),
      );
    },
  });

  const handleSubmit = () => {
    setError(null);
    joinMutation.mutate(code);
  };

  if (isConnected) {
    return (
      <View
        style={[styles.screen, styles.successWrap, { paddingTop: insets.top }]}
        testID="join-success"
      >
        <View style={styles.successIcon}>
          <CheckCircle2 size={40} color={colors.teal} strokeWidth={1.5} />
        </View>
        <Text style={styles.successTitle}>Підключено!</Text>
        <Text style={styles.successText}>Лікар готує ваш план</Text>
        <View style={styles.successButton}>
          <PrimaryButton
            testID="join-done-button"
            label="На головну"
            onPress={() => router.back()}
          />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={[
          styles.screen,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
        ]}
        testID="patient-join-screen"
      >
        <Pressable
          testID="join-back-button"
          onPress={() => router.back()}
          style={styles.back}
          hitSlop={12}
        >
          <ArrowLeft size={22} color={colors.ink} />
        </Pressable>

        <Text style={styles.title}>Приєднатися до лікаря</Text>

        <Text style={styles.label}>Введіть код запрошення</Text>
        <TextInput
          testID="join-code-input"
          style={styles.input}
          value={code}
          onChangeText={(text) => setCode(text.toUpperCase())}
          placeholder="GLP-4827"
          placeholderTextColor={colors.sub}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
        />

        {error !== null && (
          <Text style={styles.error} testID="join-error">
            {error}
          </Text>
        )}

        <View style={styles.submitWrap}>
          <PrimaryButton
            testID="join-submit-button"
            label="Приєднатися"
            onPress={handleSubmit}
            disabled={code.trim().length < 8}
            loading={joinMutation.isPending}
          />
        </View>
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
  label: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.sub,
    marginBottom: 8,
  },
  input: {
    height: 60,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    fontFamily: fonts.serif,
    fontSize: 24,
    letterSpacing: 2,
    color: colors.ink,
    textAlign: "center",
    ...cardShadow,
  },
  error: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.amber,
    marginTop: 12,
  },
  submitWrap: {
    marginTop: 24,
  },
  successWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  successIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  successTitle: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
    marginBottom: 6,
  },
  successText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.sub,
    marginBottom: 28,
  },
  successButton: {
    alignSelf: "stretch",
  },
});
