import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
} from "react-native";

import { colors, fonts, radius } from "@/constants/theme";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: "navy" | "teal" | "outline";
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
}

export default function PrimaryButton({
  label,
  onPress,
  variant = "navy",
  loading = false,
  disabled = false,
  testID,
}: PrimaryButtonProps) {
  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  const isOutline = variant === "outline";
  const bg =
    variant === "navy" ? colors.navy : variant === "teal" ? colors.teal : colors.card;

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg },
        isOutline && styles.outline,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isOutline ? colors.navy : "#FFFFFF"} />
      ) : (
        <Text style={[styles.label, isOutline && styles.labelOutline]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 54,
    borderRadius: radius.button,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  outline: {
    borderWidth: 1.5,
    borderColor: colors.navy,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
  disabled: {
    opacity: 0.55,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#FFFFFF",
  },
  labelOutline: {
    color: colors.navy,
  },
});
