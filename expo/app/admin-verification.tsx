import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, cardShadow, fonts, radius } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Founding-pilot operator gate: this screen exists only for manual
 * verification_status review, no admin role in the schema. Single hardcoded
 * operator email — see task history for why (no admin table in v1 scope).
 */
const OPERATOR_EMAIL = "zavrus@gmail.com";

type VerificationStatus = "pending" | "verified" | "rejected" | "suspended";

interface DoctorRow {
  id: string;
  first_name: string;
  last_name: string;
  specialization: string | null;
  verification_status: VerificationStatus;
  email: string | null;
}

const STATUS_LABELS: Record<VerificationStatus, string> = {
  pending: "На верифікації",
  verified: "Верифіковано",
  rejected: "Відхилено",
  suspended: "Призупинено",
};

// pending first, then the other non-final states, verified last.
const STATUS_ORDER: Record<VerificationStatus, number> = {
  pending: 0,
  suspended: 1,
  rejected: 2,
  verified: 3,
};

export default function AdminVerificationScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { session, isAuthReady, role } = useAuth();

  const email = session?.user?.email ?? null;
  const isOperator = email === OPERATOR_EMAIL;

  const doctorsQuery = useQuery({
    queryKey: ["admin-doctor-verification"],
    enabled: isOperator,
    queryFn: async (): Promise<DoctorRow[]> => {
      const { data, error } = await supabase
        .from("doctor_profiles")
        .select(
          "id, first_name, last_name, specialization, verification_status, user:users(email)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => {
        const r = row as unknown as {
          id: string;
          first_name: string;
          last_name: string;
          specialization: string | null;
          verification_status: VerificationStatus;
          user: { email: string } | null;
        };
        return {
          id: r.id,
          first_name: r.first_name,
          last_name: r.last_name,
          specialization: r.specialization,
          verification_status: r.verification_status,
          email: r.user?.email ?? null,
        };
      });
    },
  });

  const setStatus = useMutation({
    mutationFn: async (input: {
      doctorId: string;
      status: VerificationStatus;
    }): Promise<void> => {
      const { error } = await supabase
        .from("doctor_profiles")
        .update({ verification_status: input.status })
        .eq("id", input.doctorId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-doctor-verification"],
      });
    },
  });

  if (!isAuthReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  // Not the operator — silently send them to their normal home, no
  // indication this screen exists.
  if (!isOperator) {
    if (role === "doctor") return <Redirect href="/(doctor)/home" />;
    if (role === "patient") return <Redirect href="/(patient)/home" />;
    return <Redirect href="/(auth)/welcome" />;
  }

  const doctors = [...(doctorsQuery.data ?? [])].sort(
    (a, b) => STATUS_ORDER[a.verification_status] - STATUS_ORDER[b.verification_status],
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Верифікація лікарів</Text>
        <Text style={styles.subtitle}>Оператор · {OPERATOR_EMAIL}</Text>
      </View>

      {doctorsQuery.isPending ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : doctorsQuery.isError ? (
        <View style={styles.loading}>
          <Text style={styles.errorText} testID="admin-verification-error">
            {doctorsQuery.error instanceof Error
              ? doctorsQuery.error.message
              : "Не вдалося завантажити список."}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          testID="admin-verification-list"
        >
          {doctors.length === 0 ? (
            <Text style={styles.empty}>Лікарів ще немає.</Text>
          ) : (
            doctors.map((doctor) => {
              const pending = setStatus.isPending;
              return (
                <View
                  key={doctor.id}
                  style={styles.card}
                  testID={`doctor-row-${doctor.id}`}
                >
                  <View style={styles.cardHead}>
                    <Text style={styles.name}>
                      {doctor.first_name} {doctor.last_name}
                    </Text>
                    <View
                      style={[
                        styles.statusPill,
                        doctor.verification_status === "verified" &&
                          styles.statusPillVerified,
                        (doctor.verification_status === "rejected" ||
                          doctor.verification_status === "suspended") &&
                          styles.statusPillNegative,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          doctor.verification_status === "verified" &&
                            styles.statusPillTextVerified,
                          (doctor.verification_status === "rejected" ||
                            doctor.verification_status === "suspended") &&
                            styles.statusPillTextNegative,
                        ]}
                      >
                        {STATUS_LABELS[doctor.verification_status]}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.email}>{doctor.email ?? "—"}</Text>
                  {doctor.specialization !== null &&
                    doctor.specialization.length > 0 && (
                      <Text style={styles.specialization}>
                        {doctor.specialization}
                      </Text>
                    )}

                  <View style={styles.actionsRow}>
                    <Pressable
                      testID={`verify-${doctor.id}`}
                      disabled={
                        pending || doctor.verification_status === "verified"
                      }
                      onPress={() =>
                        setStatus.mutate({
                          doctorId: doctor.id,
                          status: "verified",
                        })
                      }
                      style={({ pressed }) => [
                        styles.verifyButton,
                        doctor.verification_status === "verified" &&
                          styles.actionDisabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.verifyButtonText}>Верифікувати</Text>
                    </Pressable>
                    <Pressable
                      testID={`reject-${doctor.id}`}
                      disabled={
                        pending || doctor.verification_status === "rejected"
                      }
                      onPress={() =>
                        setStatus.mutate({
                          doctorId: doctor.id,
                          status: "rejected",
                        })
                      }
                      style={({ pressed }) => [
                        styles.rejectButton,
                        doctor.verification_status === "rejected" &&
                          styles.actionDisabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.rejectButtonText}>Відхилити</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
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
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.amber,
    paddingHorizontal: 24,
    textAlign: "center",
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 24,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.sub,
    marginTop: 2,
  },
  content: { paddingHorizontal: 20 },
  empty: {
    fontFamily: fonts.regular,
    fontSize: 14.5,
    color: colors.sub,
    textAlign: "center",
    marginTop: 40,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 16,
    marginBottom: 12,
    ...cardShadow,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  name: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
  },
  statusPill: {
    backgroundColor: colors.hairline,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillVerified: {
    backgroundColor: colors.mint,
  },
  statusPillNegative: {
    backgroundColor: "#FDE2E1",
  },
  statusPillText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.sub,
  },
  statusPillTextVerified: {
    color: colors.tealDeep,
  },
  statusPillTextNegative: {
    color: "#C0392B",
  },
  email: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.sub,
    marginTop: 4,
  },
  specialization: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.sub,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  verifyButton: {
    flex: 1,
    height: 40,
    borderRadius: radius.button,
    backgroundColor: colors.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  verifyButtonText: {
    fontFamily: fonts.bold,
    fontSize: 13.5,
    color: "#FFFFFF",
  },
  rejectButton: {
    flex: 1,
    height: 40,
    borderRadius: radius.button,
    backgroundColor: colors.paper,
    borderWidth: 1.2,
    borderColor: "#C0392B",
    alignItems: "center",
    justifyContent: "center",
  },
  rejectButtonText: {
    fontFamily: fonts.bold,
    fontSize: 13.5,
    color: "#C0392B",
  },
  actionDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
});
