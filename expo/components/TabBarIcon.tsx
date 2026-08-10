import React from "react";
import { StyleSheet, View } from "react-native";

import { colors } from "@/constants/theme";

interface TabBarIconProps {
  focused: boolean;
  children: React.ReactNode;
}

/** Wraps a tab icon and shows a small teal indicator when the tab is active. */
export default function TabBarIcon({ focused, children }: TabBarIconProps) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.indicator, focused && styles.indicatorActive]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  indicator: {
    width: 16,
    height: 3,
    borderRadius: 2,
    backgroundColor: "transparent",
    marginBottom: 4,
  },
  indicatorActive: {
    backgroundColor: colors.teal,
  },
});
