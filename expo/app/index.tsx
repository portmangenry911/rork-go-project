import { useQuery } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import PrimaryButton from "@/components/PrimaryButton";
import { colors, fonts } from "@/constants/theme";
import { CONSENT_VERSION } from "@/hooks/usePatientConsent";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

export default function Index() {
  const { session, isAuthReady, role, isRoleLoading, signOut, userId } =
    useAuth();

  // Founding Doctor Program is the only onboarding path in v1 — every
  // doctor must sign the agreement before reaching their tabs.
  const foundingQuery = useQuery({
    queryKey: ["founding-gate", userId],
    enabled: role === "doctor" && userId !== null,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("doctor_profiles")
        .select("is_founding_doctor")
        .eq("user_id", userId as string)
        .maybeSingle();
      if (error) throw error;
      return (data?.is_founding_doctor as boolean | null) ?? false;
    },
  });

  // Every patient must record consent (current text version) before
  // reaching their tabs — same gating pattern as the founding doctor flow.
  const consentQuery = useQuery({
    queryKey: ["patient-consent-gate", userId],
    enabled: role === "patient" && userId !== null,
    queryFn: async (): Promise<boolean> => {
      const { data: profileRow, error: profileError } = await supabase
        .from("patient_profiles")
        .select("id")
        .eq("user_id", userId as string)
        .maybeSingle();
      if (profileError) throw profileError;
      const patientId = profileRow?.id as string | undefined;
      if (patientId === undefined) return false;

      const { data, error } = await supabase
        .from("patient_consents")
        .select("id")
        .eq("patient_id", patientId)
        .eq("consent_version", CONSENT_VERSION)
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },
  });

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.center} testID="config-missing">
        <Text style={styles.title}>GLP One</Text>
        <Text style={styles.message}>
          Додайте EXPO_PUBLIC_SUPABASE_URL та EXPO_PUBLIC_SUPABASE_ANON_KEY у
          змінні середовища, щоб продовжити.
        </Text>
      </View>
    );
  }

  if (!isAuthReady || (session !== null && isRoleLoading)) {
    return (
      <View style={styles.center} testID="auth-loading">
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  if (session === null) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (role === "doctor") {
    if (foundingQuery.isPending) {
      return (
        <View style={styles.center} testID="founding-gate-loading">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      );
    }
    if (foundingQuery.data === false) {
      return <Redirect href="/founding-agreement" />;
    }
    return <Redirect href="/(doctor)/home" />;
  }

  if (role === "patient") {
    if (consentQuery.isPending) {
      return (
        <View style={styles.center} testID="consent-gate-loading">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      );
    }
    if (consentQuery.data === false) {
      return <Redirect href="/patient-consent" />;
    }
    return <Redirect href="/(patient)/home" />;
  }

  return (
    <View style={styles.center} testID="role-fallback">
      <Text style={styles.title}>Скоро</Text>
      <Text style={styles.message}>
        Кабінет для вашої ролі ще в розробці.
      </Text>
      <View style={styles.buttonWrap}>
        <PrimaryButton
          label="Вийти"
          onPress={() => {
            signOut();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
    padding: 32,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
    marginBottom: 12,
  },
  message: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.sub,
    textAlign: "center",
    lineHeight: 22,
  },
  buttonWrap: {
    marginTop: 24,
    alignSelf: "stretch",
  },
});
