import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { ArrowLeft, Camera, Check } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, cardShadow, fonts, radius, softShadow } from "@/constants/theme";
import { usePatientHome } from "@/hooks/usePatientHome";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import type { PhotoAngle } from "@/types/db";
import { base64ToBytes } from "@/utils/base64";
import { todayISO } from "@/utils/dates";

const ANGLES: { key: PhotoAngle; label: string }[] = [
  { key: "front", label: "Спереду" },
  { key: "side", label: "Збоку" },
  { key: "back", label: "Ззаду" },
];

interface PickedPhoto {
  uri: string;
  base64: string;
}

function lightTap() {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

/**
 * Onboarding "before" photo screen — captures a baseline set of 3 progress
 * photos for the active cycle, independent of any weekly check-in. Rows go
 * into progress_photos with weekly_checkin_id: null.
 */
export default function BeforePhotoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const { profile, cycle, isLoading } = usePatientHome();

  const [photos, setPhotos] = useState<Record<PhotoAngle, PickedPhoto | null>>({
    front: null,
    side: null,
    back: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  const pickPhoto = async (angle: PhotoAngle) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.7,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset?.uri && asset.base64) {
        lightTap();
        setPhotos((prev) => ({
          ...prev,
          [angle]: { uri: asset.uri, base64: asset.base64 as string },
        }));
      }
    } catch (err) {
      console.log("[before-photo] photo pick skipped:", err);
    }
  };

  const hasAnyPhoto = ANGLES.some(({ key }) => photos[key] !== null);

  const savePhotos = useMutation({
    mutationFn: async (): Promise<void> => {
      if (cycle === null) throw new Error("Активний цикл не знайдено.");
      if (profile === null) throw new Error("Профіль пацієнта не знайдено.");
      if (userId === null) throw new Error("Не вдалося визначити користувача.");

      const photoDate = cycle.start_date ?? todayISO();

      for (const { key } of ANGLES) {
        const photo = photos[key];
        if (photo === null) continue;
        try {
          const path = `${userId}/${cycle.id}/before/${key}.jpg`;
          const bytes = base64ToBytes(photo.base64);
          const { error: uploadError } = await supabase.storage
            .from("progress-photos")
            .upload(path, bytes.buffer as ArrayBuffer, {
              contentType: "image/jpeg",
              upsert: true,
            });
          if (uploadError) {
            console.log("[before-photo] upload skipped:", uploadError.message);
            continue;
          }
          const { error: photoRowError } = await supabase
            .from("progress_photos")
            .insert({
              patient_id: profile.id,
              therapy_cycle_id: cycle.id,
              weekly_checkin_id: null,
              file_url: path,
              angle: key,
              photo_date: photoDate,
            });
          if (photoRowError) {
            console.log(
              "[before-photo] photo row skipped:",
              photoRowError.message,
            );
          }
        } catch (err) {
          console.log("[before-photo] photo upload error:", err);
        }
      }
    },
    onSuccess: () => {
      setIsSaved(true);
      queryClient.invalidateQueries({ queryKey: ["progress-photos"] });
      queryClient.invalidateQueries({ queryKey: ["doctor-patient-photos"] });
    },
    onError: (err: unknown) => {
      setError(
        err instanceof Error ? err.message : "Не вдалося зберегти фото.",
      );
    },
  });

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  if (isSaved) {
    return (
      <View
        style={[styles.screen, styles.successWrap, { paddingTop: insets.top }]}
        testID="before-photo-success"
      >
        <View style={styles.successIcon}>
          <Check size={40} color={colors.tealDeep} strokeWidth={2.4} />
        </View>
        <Text style={styles.successTitle}>Фото «до» збережено!</Text>
        <Text style={styles.successText}>
          Ви завжди зможете порівняти прогрес на екрані «Прогрес».
        </Text>
        <Pressable
          testID="before-photo-done-button"
          onPress={() => router.replace("/(patient)/home")}
          style={({ pressed }) => [styles.fullWidth, pressed && styles.pressed]}
        >
          <LinearGradient
            colors={[colors.tealDeep, colors.teal]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientButton}
          >
            <Text style={styles.gradientButtonText}>На головну</Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Pressable
          testID="before-photo-close"
          onPress={() => router.back()}
          style={styles.back}
          hitSlop={12}
        >
          <ArrowLeft size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Фото «до»</Text>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Зафіксуйте старт</Text>
        <Text style={styles.subtitle}>
          Це фото стане точкою відліку для порівняння прогресу. Можна
          завантажити зараз або пропустити й додати пізніше в тижневому
          чек-іні.
        </Text>

        <View style={styles.photoRow}>
          {ANGLES.map(({ key, label }) => {
            const picked = photos[key];
            return (
              <Pressable
                key={key}
                testID={`before-photo-slot-${key}`}
                onPress={() => pickPhoto(key)}
                style={styles.photoSlotWrap}
              >
                <View
                  style={[
                    styles.photoSlot,
                    picked !== null && styles.photoSlotFilled,
                  ]}
                >
                  {picked !== null ? (
                    <>
                      <Image
                        source={{ uri: picked.uri }}
                        style={styles.photoImage}
                        resizeMode="cover"
                      />
                      <View style={styles.photoCheck}>
                        <Check size={12} color="#FFFFFF" strokeWidth={3} />
                      </View>
                    </>
                  ) : (
                    <Camera size={26} color={colors.sub} strokeWidth={1.6} />
                  )}
                </View>
                <Text style={styles.photoLabel}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {error !== null && (
          <Text style={styles.error} testID="before-photo-error">
            {error}
          </Text>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          testID="before-photo-skip-button"
          onPress={() => router.replace("/(patient)/home")}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Text style={styles.backButtonText}>Пропустити</Text>
        </Pressable>
        <Pressable
          testID="before-photo-save-button"
          onPress={() => {
            setError(null);
            savePhotos.mutate();
          }}
          disabled={!hasAnyPhoto || savePhotos.isPending}
          style={({ pressed }) => [
            styles.flex2,
            (!hasAnyPhoto || savePhotos.isPending) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <LinearGradient
            colors={[colors.tealDeep, colors.teal]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientButton}
          >
            {savePhotos.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.gradientButtonText}>Зберегти</Text>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  flex2: {
    flex: 2,
  },
  fullWidth: {
    alignSelf: "stretch",
  },
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 24,
    marginBottom: 12,
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
  headerTitle: {
    fontFamily: fonts.serif,
    fontSize: 19,
    color: colors.navyDeep,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.navyDeep,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.sub,
    lineHeight: 21,
    marginBottom: 20,
  },
  photoRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  photoSlotWrap: {
    flex: 1,
    alignItems: "center",
  },
  photoSlot: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 14,
    borderWidth: 1.6,
    borderStyle: "dashed",
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...cardShadow,
  },
  photoSlotFilled: {
    borderStyle: "solid",
    borderColor: colors.teal,
  },
  photoImage: {
    ...StyleSheet.absoluteFillObject,
  },
  photoCheck: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  photoLabel: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.sub,
    marginTop: 8,
  },
  error: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.amber,
    marginTop: 16,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  gradientButton: {
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  gradientButtonText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
  },
  backButton: {
    flex: 1,
    height: 48,
    borderRadius: 15,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    ...softShadow,
  },
  backButtonText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.sub,
  },
  disabled: {
    opacity: 0.5,
  },
  successWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  successIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  successTitle: {
    fontFamily: fonts.serif,
    fontSize: 26,
    color: colors.ink,
    marginBottom: 10,
    textAlign: "center",
  },
  successText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.sub,
    textAlign: "center",
    lineHeight: 23,
    marginBottom: 24,
  },
  pressed: {
    opacity: 0.85,
  },
});
