import { useRouter } from "expo-router";
import { Bell } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/constants/theme";
import { useNotifications } from "@/hooks/useNotifications";

/** Bell button with an unread badge; opens the notification feed. */
export default function NotificationBell() {
  const router = useRouter();
  const { unreadCount } = useNotifications();

  return (
    <Pressable
      style={styles.bell}
      hitSlop={8}
      onPress={() => router.push("/notifications")}
      testID="notification-bell"
    >
      <Bell size={20} color={colors.ink} strokeWidth={1.8} />
      {unreadCount > 0 && (
        <View style={styles.badge} testID="notification-badge">
          <Text style={styles.badgeText}>
            {unreadCount > 9 ? "9+" : String(unreadCount)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.card,
  },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: "#FFFFFF",
    lineHeight: 13,
  },
});
