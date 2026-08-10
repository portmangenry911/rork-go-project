import { useRouter } from "expo-router";
import { Hourglass, LogOut } from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts, radius } from "@/constants/theme";
import { useAuth } from "@/providers/AuthProvider";

/** Placeholder profile tab with a sign-out action so both roles can be tested. */
export default function ProfilePlaceholder() {
  const { signOut } = useAuth();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState<boolean>(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace("/");
    } catch (err: unknown) {
      console.error("[profile] sign out failed", err);
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <View style={styles.container} testID="profile-placeholder">
      <View style={styles.iconTile}>
        <Hourglass size={26} color={colors.teal} strokeWidth={1.6} />
      </View>
      <Text style={styles.title}>Скоро</Text>
      <Pressable
        testID="sign-out-button"
        onPress={handleSignOut}
        disabled={isSigningOut}
        style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
      >
        <LogOut size={18} color={colors.amber} strokeWidth={2} />
        <Text style={styles.signOutText}>Вийти</Text>
      </Pressable>
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
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 40,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radius.button,
    backgroundColor: colors.card,
  },
  pressed: {
    opacity: 0.7,
  },
  signOutText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.amber,
  },
});
