import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import PrimaryButton from "@/components/PrimaryButton";
import { colors, fonts, radius, softShadow } from "@/constants/theme";
import { useAuth } from "@/providers/AuthProvider";

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async () => {
    if (email.trim().length === 0 || password.length === 0) {
      setError("Заповніть усі поля.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await signIn(email, password);
      router.replace("/");
    } catch (err: unknown) {
      console.error("[sign-in] failed", err);
      setError("Невірна пошта або пароль.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          testID="back-button"
          onPress={() => router.back()}
          style={styles.back}
          hitSlop={12}
        >
          <ArrowLeft size={22} color={colors.ink} />
        </Pressable>

        <Text style={styles.title}>Вхід</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Ел. пошта</Text>
          <TextInput
            testID="sign-in-email"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@email.com"
            placeholderTextColor={colors.sub}
          />

          <Text style={styles.label}>Пароль</Text>
          <TextInput
            testID="sign-in-password"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholder="••••••••"
            placeholderTextColor={colors.sub}
          />

          {error !== null && (
            <Text style={styles.error} testID="sign-in-error">
              {error}
            </Text>
          )}

          <View style={styles.submitWrap}>
            <PrimaryButton
              testID="sign-in-submit"
              label="Увійти"
              onPress={handleSubmit}
              loading={isSubmitting}
            />
          </View>

          <Pressable
            style={styles.forgot}
            onPress={() => {
              console.log("[sign-in] forgot password — coming soon");
            }}
          >
            <Text style={styles.forgotText}>Забули пароль?</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  container: {
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
  form: {
    gap: 8,
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.sub,
    marginTop: 8,
  },
  input: {
    height: 54,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.ink,
    ...softShadow,
  },
  error: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.amber,
    marginTop: 8,
  },
  submitWrap: {
    marginTop: 20,
  },
  forgot: {
    alignSelf: "center",
    marginTop: 20,
    padding: 8,
  },
  forgotText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.blue,
  },
});
