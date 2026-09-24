import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react-native";
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
import {
  CONSENT_ITEMS,
  useGiveConsent,
  usePatientConsentStatus,
} from "@/hooks/usePatientConsent";

/** "2026-09-24T10:00:00Z" → "24.09.2026" */
function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${d.getFullYear()}`;
}

/**
 * Patient consent, required once at registration (PRD-adjacent legal
 * requirement — text is a DRAFT pending lawyer sign-off). Also reachable
 * later in read-only mode (?review=1) from wherever "Умовами
 * використання" is referenced, e.g. the lab indicator save form.
 */
export default function PatientConsentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { review } = useLocalSearchParams<{ review?: string }>();
  const isReview = review === "1";

  const { data: consent, isPending, hasCurrentConsent } =
    usePatientConsentStatus();
  const giveConsent = useGiveConsent();

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const allChecked = CONSENT_ITEMS.every((item) => checked[item.key] === true);

  const toggle = (key: string): void => {
    setError(null);
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAll = (): void => {
    setError(null);
    const next = !allChecked;
    const nextChecked: Record<string, boolean> = {};
    for (const item of CONSENT_ITEMS) {
      nextChecked[item.key] = next;
    }
    setChecked(nextChecked);
  };

  const handleSubmit = (): void => {
    if (!allChecked) return;
    giveConsent.mutate(undefined, {
      onSuccess: () => router.replace("/(patient)/home"),
      onError: (err: unknown) =>
        setError(
          err instanceof Error ? err.message : "Не вдалося зберегти згоду.",
        ),
    });
  };

  if (isPending) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  // Registration gate: already agreed to the current text — nothing to do.
  if (!isReview && hasCurrentConsent) {
    router.replace("/(patient)/home");
    return null;
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {isReview && (
          <Pressable
            onPress={() => router.back()}
            style={styles.iconBtn}
            testID="patient-consent-back"
          >
            <ArrowLeft size={20} color={colors.ink} />
          </Pressable>
        )}
        <Text style={styles.headerTitle}>Умови використання</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        testID="patient-consent-screen"
      >
        {!isReview && (
          <View style={styles.iconWrap}>
            <ShieldCheck size={28} color={colors.tealDeep} strokeWidth={1.8} />
          </View>
        )}

        {isReview && consent !== null && consent !== undefined ? (
          <Text style={styles.reviewStatus}>
            Погоджено {formatDate(consent.given_at)} · версія{" "}
            {consent.consent_version}
          </Text>
        ) : (
          !isReview && (
            <Text style={styles.subtitle}>
              Перш ніж почати, підтвердіть, що ознайомлені з умовами
            </Text>
          )
        )}

        <Text style={styles.heading}>Я підтверджую, що:</Text>

        {!isReview && (
          <Pressable
            testID="consent-select-all"
            onPress={toggleAll}
            style={styles.selectAllRow}
          >
            <View
              style={[styles.checkbox, allChecked && styles.checkboxChecked]}
            >
              {allChecked && (
                <Check size={13} color="#FFFFFF" strokeWidth={3} />
              )}
            </View>
            <Text style={styles.selectAllLabel}>Обрати все</Text>
          </Pressable>
        )}

        <View style={styles.card}>
          {CONSENT_ITEMS.map((item, i) => (
            <Pressable
              key={item.key}
              testID={`consent-item-${item.key}`}
              onPress={() => !isReview && toggle(item.key)}
              disabled={isReview}
              style={[styles.itemRow, i > 0 && styles.itemRowBorder]}
            >
              {!isReview && (
                <View
                  style={[
                    styles.checkbox,
                    checked[item.key] === true && styles.checkboxChecked,
                  ]}
                >
                  {checked[item.key] === true && (
                    <Check size={13} color="#FFFFFF" strokeWidth={3} />
                  )}
                </View>
              )}
              <Text style={styles.itemText}>{item.text}</Text>
            </Pressable>
          ))}
        </View>

        {!isReview && (
          <>
            {error !== null && (
              <Text style={styles.error} testID="patient-consent-error">
                {error}
              </Text>
            )}
            <View style={styles.submitWrap}>
              <PrimaryButton
                testID="patient-consent-submit"
                label="Підтверджую"
                disabled={!allChecked}
                loading={giveConsent.isPending}
                onPress={handleSubmit}
              />
            </View>
          </>
        )}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.ink,
  },
  content: { paddingHorizontal: 24, paddingTop: 8 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: 14.5,
    color: colors.sub,
    marginBottom: 8,
  },
  reviewStatus: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.tealDeep,
    marginBottom: 8,
  },
  heading: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ink,
    marginBottom: 14,
  },
  selectAllRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  selectAllLabel: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.navy,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingHorizontal: 16,
    marginBottom: 20,
    ...cardShadow,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 14,
  },
  itemRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.6,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
    marginTop: 1,
    ...softShadow,
  },
  checkboxChecked: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  itemText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20.5,
    color: colors.ink,
  },
  error: {
    fontFamily: fonts.medium,
    fontSize: 13.5,
    color: colors.amber,
    marginBottom: 10,
  },
  submitWrap: {
    marginBottom: 12,
  },
});
