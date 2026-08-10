import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import PrimaryButton from "@/components/PrimaryButton";
import { colors, fonts } from "@/constants/theme";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

export default function Index() {
  const { session, isAuthReady, role, isRoleLoading, signOut } = useAuth();

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
    return <Redirect href="/(doctor)/home" />;
  }

  if (role === "patient") {
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
