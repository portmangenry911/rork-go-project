import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  CalendarDays,
  Stethoscope,
  UserRound,
} from "lucide-react-native";
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

type SignUpRole = "doctor" | "patient";

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}.${m}.${date.getFullYear()}`;
}

function isAdult(isoDate: string): boolean {
  const [y, m, d] = isoDate.split("-").map((part) => Number(part));
  if (!y || !m || !d) return false;
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) {
    age -= 1;
  }
  return age >= 18;
}

export default function SignUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [role, setRole] = useState<SignUpRole>("patient");
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(null);
  const [draftDob, setDraftDob] = useState<Date | null>(null);
  const [dobText, setDobText] = useState<string>("");
  const [showDobPicker, setShowDobPicker] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async () => {
    if (
      email.trim().length === 0 ||
      password.length === 0 ||
      firstName.trim().length === 0 ||
      lastName.trim().length === 0
    ) {
      setError("Заповніть усі поля.");
      return;
    }
    if (password.length < 6) {
      setError("Пароль має містити щонайменше 6 символів.");
      return;
    }
    let dob: string | undefined;
    if (role === "patient") {
      if (dateOfBirth !== null) {
        dob = toISODate(dateOfBirth);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dobText.trim())) {
        dob = dobText.trim();
      }
      if (dob === undefined) {
        setError("Вкажіть дату народження.");
        return;
      }
      if (!isAdult(dob)) {
        setError("Вам має бути не менше 18 років");
        return;
      }
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await signUp({
        email,
        password,
        role,
        firstName,
        lastName,
        dateOfBirth: dob,
      });
      router.replace("/");
    } catch (err: unknown) {
      console.error("[sign-up] failed", err);
      const message =
        err instanceof Error && err.message.length > 0
          ? err.message
          : "Не вдалося створити акаунт. Спробуйте ще раз.";
      setError(message);
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

        <Text style={styles.title}>Реєстрація</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Я — </Text>
          <View style={styles.roleRow}>
            <Pressable
              testID="role-doctor"
              onPress={() => setRole("doctor")}
              style={[styles.roleCard, role === "doctor" && styles.roleActive]}
            >
              <Stethoscope
                size={20}
                color={role === "doctor" ? "#FFFFFF" : colors.tealDeep}
                strokeWidth={1.8}
              />
              <Text
                style={[
                  styles.roleText,
                  role === "doctor" && styles.roleTextActive,
                ]}
              >
                Лікар
              </Text>
            </Pressable>
            <Pressable
              testID="role-patient"
              onPress={() => setRole("patient")}
              style={[styles.roleCard, role === "patient" && styles.roleActive]}
            >
              <UserRound
                size={20}
                color={role === "patient" ? "#FFFFFF" : colors.tealDeep}
                strokeWidth={1.8}
              />
              <Text
                style={[
                  styles.roleText,
                  role === "patient" && styles.roleTextActive,
                ]}
              >
                Пацієнт
              </Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Імʼя</Text>
          <TextInput
            testID="sign-up-first-name"
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Імʼя"
            placeholderTextColor={colors.sub}
          />

          <Text style={styles.label}>Прізвище</Text>
          <TextInput
            testID="sign-up-last-name"
            style={styles.input}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Прізвище"
            placeholderTextColor={colors.sub}
          />

          {role === "patient" && (
            <>
              <Text style={styles.label}>Дата народження</Text>
              {Platform.OS === "web" ? (
                React.createElement("input", {
                  "data-testid": "sign-up-dob",
                  type: "date",
                  value: dobText,
                  max: toISODate(new Date()),
                  onChange: (e: { target: { value: string } }) =>
                    setDobText(e.target.value),
                  style: {
                    height: 54,
                    borderRadius: radius.button,
                    backgroundColor: colors.card,
                    paddingLeft: 16,
                    paddingRight: 16,
                    border: "none",
                    outline: "none",
                    fontSize: 16,
                    fontFamily: fonts.medium,
                    color: colors.ink,
                    width: "100%",
                    boxSizing: "border-box",
                  },
                })
              ) : (
                <Pressable
                  testID="sign-up-dob"
                  style={styles.dateField}
                  onPress={() => {
                    setDraftDob(dateOfBirth);
                    setShowDobPicker((prev) => !prev);
                  }}
                >
                  <Text
                    style={[
                      styles.dateText,
                      dateOfBirth === null && styles.datePlaceholder,
                    ]}
                  >
                    {dateOfBirth !== null
                      ? formatDisplayDate(dateOfBirth)
                      : "Оберіть дату"}
                  </Text>
                  <CalendarDays size={19} color={colors.sub} strokeWidth={1.8} />
                </Pressable>
              )}
              {showDobPicker && Platform.OS !== "web" && (
                <View style={styles.pickerPanel}>
                  <DateTimePicker
                    value={draftDob ?? dateOfBirth ?? new Date(2000, 0, 1)}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    maximumDate={new Date()}
                    onChange={(event: DateTimePickerEvent, selected?: Date) => {
                      if (Platform.OS === "android") {
                        setShowDobPicker(false);
                        if (event.type !== "dismissed" && selected !== undefined) {
                          setDateOfBirth(selected);
                        }
                        return;
                      }
                      if (event.type !== "dismissed" && selected !== undefined) {
                        setDraftDob(selected);
                      }
                    }}
                  />
                  {Platform.OS === "ios" && (
                    <Pressable
                      testID="sign-up-dob-done"
                      style={styles.pickerDoneButton}
                      onPress={() => {
                        if (draftDob !== null) {
                          setDateOfBirth(draftDob);
                        }
                        setDraftDob(null);
                        setShowDobPicker(false);
                      }}
                    >
                      <Text style={styles.pickerDoneText}>Готово</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </>
          )}

          <Text style={styles.label}>Ел. пошта</Text>
          <TextInput
            testID="sign-up-email"
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
            testID="sign-up-password"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password-new"
            placeholder="Мінімум 6 символів"
            placeholderTextColor={colors.sub}
          />

          {error !== null && (
            <Text style={styles.error} testID="sign-up-error">
              {error}
            </Text>
          )}

          <View style={styles.submitWrap}>
            <PrimaryButton
              testID="sign-up-submit"
              label="Створити акаунт"
              onPress={handleSubmit}
              loading={isSubmitting}
            />
          </View>
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
    marginBottom: 20,
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
  roleRow: {
    flexDirection: "row",
    gap: 12,
  },
  roleCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 54,
    borderRadius: radius.button,
    backgroundColor: colors.mint,
  },
  roleActive: {
    backgroundColor: colors.navy,
  },
  roleText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.tealDeep,
  },
  roleTextActive: {
    color: "#FFFFFF",
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
  dateField: {
    height: 54,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    ...softShadow,
  },
  dateText: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.ink,
  },
  datePlaceholder: {
    color: colors.sub,
  },
  pickerPanel: {
    marginTop: 8,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    paddingBottom: 8,
    ...softShadow,
  },
  pickerDoneButton: {
    alignSelf: "center",
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: radius.button,
    backgroundColor: colors.navy,
  },
  pickerDoneText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: "#FFFFFF",
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
});
