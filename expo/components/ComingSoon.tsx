import { Hourglass } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/constants/theme";

/** Placeholder screen for tabs that are out of scope in this build. */
export default function ComingSoon() {
  return (
    <View style={styles.container} testID="coming-soon">
      <View style={styles.iconTile}>
        <Hourglass size={26} color={colors.teal} strokeWidth={1.6} />
      </View>
      <Text style={styles.title}>Скоро</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
  },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 24,
    color: colors.sub,
  },
});
