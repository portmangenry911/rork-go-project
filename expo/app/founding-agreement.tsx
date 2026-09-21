import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Check, Sparkles } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import PrimaryButton from "@/components/PrimaryButton";
import { colors, cardShadow, fonts, radius, softShadow } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

/** One-time consent screen for the Founding Doctor Program (PRD 5.5). */
export default function FoundingAgreementScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  const [agreed, setAgreed] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: ["founding-agreement-profile", userId],
    enabled: userId !== null,
    queryFn: async (): Promise<{ id: string; isFounding: boolean } | null> => {
      const { data, error: qError } = await supabase
        .from("doctor_profiles")
        .select("id, is_founding_doctor")
        .eq("user_id", userId as string)
        .maybeSingle();
      if (qError) throw qError;
      if (data === null) return null;
      return {
        id: data.id as string,
        isFounding: (data.is_founding_doctor as boolean | null) ?? false,
      };
    },
  });

  const signAgreement = useMutation({
    mutationFn: async (): Promise<void> => {
      const doctorId = profileQuery.data?.id;
      if (doctorId === undefined) {
        throw new Error("Профіль лікаря не знайдено.");
      }
      const { error: updateError } = await supabase
        .from("doctor_profiles")
        .update({
          is_founding_doctor: true,
          founding_joined_at: new Date().toISOString(),
        })
        .eq("id", doctorId);
      if (updateError) throw new Error(updateError.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["doctor-profile"] });
      void queryClient.invalidateQueries({
        queryKey: ["doctor-profile-full"],
      });
      router.replace("/(doctor)/home");
    },
    onError: (err: unknown) => {
      setError(
        err instanceof Error ? err.message : "Не вдалося підписати угоду.",
      );
    },
  });

  if (profileQuery.isPending) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  // Already signed (e.g. re-entered this route) — nothing to do here.
  if (profileQuery.data?.isFounding === true) {
    router.replace("/(doctor)/home");
    return null;
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        testID="founding-agreement-screen"
      >
        <View style={styles.iconWrap}>
          <Sparkles size={28} color={colors.gold} strokeWidth={1.8} />
        </View>
        <Text style={styles.title}>Founding Doctor Program</Text>
        <Text style={styles.subtitle}>
          Ви приєднуєтесь як лікар-засновник GLP One
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardHeading}>Умови програми</Text>
          <Text style={styles.paragraph}>
            Як лікар-засновник ви отримуєте тариф Professional безкоштовно
            протягом 6 місяців з моменту підписання цієї угоди.
          </Text>
          <Text style={styles.paragraph}>
            Верифікацію вашого профілю проводить команда GLP One вручну.
            До завершення верифікації статус профілю відображається як «На
            верифікації».
          </Text>
          <Text style={styles.paragraph}>
            Підписуючи цю угоду, ви підтверджуєте, що ознайомлені з умовами
            участі у програмі Founding Doctor та погоджуєтесь з ними.
          </Text>
        </View>

        <Pressable
          testID="founding-agreement-checkbox"
          onPress={() => {
            setError(null);
            setAgreed((prev) => !prev);
          }}
          style={styles.checkboxRow}
        >
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
          </View>
          <Text style={styles.checkboxLabel}>
            Я ознайомлений і погоджуюсь
          </Text>
        </Pressable>

        {error !== null && (
          <Text style={styles.error} testID="founding-agreement-error">
            {error}
          </Text>
        )}

        <View style={styles.submitWrap}>
          <PrimaryButton
            testID="founding-agreement-submit"
            label="Підписати"
            disabled={!agreed}
            loading={signAgreement.isPending}
            onPress={() => signAgreement.mutate()}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
  },
  content: { paddingHorizontal: 24 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.goldTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: 14.5,
    color: colors.sub,
    marginBottom: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 18,
    marginBottom: 20,
    ...cardShadow,
  },
  cardHeading: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.navy,
    marginBottom: 10,
  },
  paragraph: {
    fontFamily: fonts.regular,
    fontSize: 14.5,
    lineHeight: 22,
    color: colors.ink,
    marginBottom: 12,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.6,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    ...softShadow,
  },
  checkboxChecked: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  checkboxLabel: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  error: {
    fontFamily: fonts.medium,
    fontSize: 13.5,
    color: colors.amber,
    marginTop: 10,
  },
  submitWrap: {
    marginTop: 24,
  },
});
