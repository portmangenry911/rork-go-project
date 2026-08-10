import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/constants/theme";

interface AvatarInitialsProps {
  firstName?: string | null;
  lastName?: string | null;
  size?: number;
  tint?: "navy" | "mint";
}

/** Round avatar showing a person's initials. */
export default function AvatarInitials({
  firstName,
  lastName,
  size = 40,
  tint = "navy",
}: AvatarInitialsProps) {
  const initials = `${(firstName ?? "").trim().charAt(0)}${(lastName ?? "")
    .trim()
    .charAt(0)}`.toUpperCase();

  const isMint = tint === "mint";

  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: isMint ? colors.mint : colors.navy,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          { fontSize: size * 0.38, color: isMint ? colors.tealDeep : "#FFFFFF" },
        ]}
      >
        {initials.length > 0 ? initials : "•"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontFamily: fonts.bold,
  },
});
