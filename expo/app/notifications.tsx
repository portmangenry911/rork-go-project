import { useRouter } from "expo-router";
import {
  ArrowLeft,
  BellRing,
  CalendarClock,
  CheckCheck,
  MessageCircle,
  Settings2,
  SlidersHorizontal,
} from "lucide-react-native";
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

import { cardShadow, colors, fonts, radius } from "@/constants/theme";
import {
  useNotifications,
  type AppNotification,
  type NotificationKind,
} from "@/hooks/useNotifications";
import { useAuth } from "@/providers/AuthProvider";

function iconFor(kind: NotificationKind): React.ReactNode {
  const size = 18;
  switch (kind) {
    case "message":
      return <MessageCircle size={size} color={colors.navy} strokeWidth={2} />;
    case "dose":
      return (
        <SlidersHorizontal size={size} color={colors.navy} strokeWidth={2} />
      );
    case "cycle":
      return <CalendarClock size={size} color={colors.navy} strokeWidth={2} />;
    default:
      return <BellRing size={size} color={colors.navy} strokeWidth={2} />;
  }
}

/** "2026-08-14T09:00:00Z" → "сьогодні 09:00" / "14 серп 09:00" */
function whenLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return `сьогодні ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) return `вчора ${time}`;

  const months = [
    "січ", "лют", "бер", "кві", "тра", "чер",
    "лип", "серп", "вер", "жов", "лис", "гру",
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${time}`;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { role } = useAuth();
  const { items, unreadCount, isLoading, markRead, markAllRead } =
    useNotifications();

  const openItem = (item: AppNotification): void => {
    if (!item.is_read) markRead.mutate(item.id);
    if (item.link !== null && item.link.length > 0) {
      router.push(item.link as never);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.iconBtn}
          testID="notifications-back"
        >
          <ArrowLeft size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Сповіщення</Text>

        {role === "patient" && (
          <Pressable
            onPress={() => router.push("/reminders")}
            style={styles.iconBtn}
            testID="notifications-settings"
          >
            <Settings2 size={19} color={colors.ink} strokeWidth={1.9} />
          </Pressable>
        )}
      </View>

      {unreadCount > 0 && (
        <Pressable
          onPress={() => markAllRead.mutate()}
          style={styles.markAll}
          testID="mark-all-read"
        >
          <CheckCheck size={15} color={colors.navy} strokeWidth={2} />
          <Text style={styles.markAllText}>Позначити всі прочитаними</Text>
        </Pressable>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.teal} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <BellRing size={26} color={colors.teal} strokeWidth={1.6} />
          </View>
          <Text style={styles.emptyTitle}>Сповіщень немає</Text>
          <Text style={styles.emptyText}>
            Тут зʼявляться нагадування про чек-іни, повідомлення лікаря та зміни
            в терапії.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 30 },
          ]}
        >
          {items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => openItem(item)}
              style={({ pressed }) => [
                styles.row,
                !item.is_read && styles.rowUnread,
                pressed && styles.pressed,
              ]}
              testID={`notification-${item.id}`}
            >
              <View style={styles.rowIcon}>{iconFor(item.kind)}</View>
              <View style={styles.rowBody}>
                <Text
                  style={[styles.rowTitle, !item.is_read && styles.rowTitleBold]}
                >
                  {item.title}
                </Text>
                {item.body !== null && item.body.length > 0 && (
                  <Text style={styles.rowText}>{item.body}</Text>
                )}
                <Text style={styles.rowWhen}>{whenLabel(item.created_at)}</Text>
              </View>
              {!item.is_read && <View style={styles.dot} />}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, fontFamily: fonts.serif, fontSize: 22, color: colors.ink },
  markAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginLeft: 20,
    marginBottom: 10,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
  },
  markAllText: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.navy },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 15,
    marginBottom: 10,
    ...cardShadow,
  },
  rowUnread: { borderLeftWidth: 3, borderLeftColor: colors.teal },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1 },
  rowTitle: { fontFamily: fonts.medium, fontSize: 14.5, color: colors.ink },
  rowTitleBold: { fontFamily: fonts.semibold },
  rowText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.sub,
    marginTop: 2,
  },
  rowWhen: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: colors.sub,
    marginTop: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.teal,
    marginTop: 6,
  },
  pressed: { opacity: 0.7 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.sub,
    textAlign: "center",
    marginTop: 7,
  },
});
