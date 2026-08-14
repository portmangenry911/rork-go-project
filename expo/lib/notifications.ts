/**
 * Local check-in reminders.
 *
 * Everything here is scheduled on-device: no push credentials, no server.
 * Web is a no-op because expo-notifications has no scheduling API there.
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export interface ReminderSettings {
  daily_enabled: boolean;
  /** "HH:MM" in 24h form. */
  daily_time: string;
  /** 1 = every day, 3 = every third day. */
  daily_interval_days: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekly_weekday: number;
  weekly_time: string;
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  daily_enabled: true,
  daily_time: "09:00",
  daily_interval_days: 1,
  weekly_weekday: 0,
  weekly_time: "10:00",
};

/** Indexed by stored weekday value: 0 = Sunday … 6 = Saturday. */
export const WEEKDAY_LABELS = [
  "Неділя",
  "Понеділок",
  "Вівторок",
  "Середа",
  "Четвер",
  "Пʼятниця",
  "Субота",
] as const;

/** Display order starting on Monday, as expected in UA/RU/KZ. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** Two-letter chips for the weekday picker, aligned with WEEKDAY_ORDER. */
export const WEEKDAY_SHORT: Record<number, string> = {
  1: "Пн",
  2: "Вт",
  3: "Ср",
  4: "Чт",
  5: "Пт",
  6: "Сб",
  0: "Нд",
};

const DAILY_TAG = "glp-daily";
const WEEKLY_TAG = "glp-weekly";

function parseTime(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(":");
  const hour = Number(h);
  const minute = Number(m);
  return {
    hour: Number.isFinite(hour) ? hour : 9,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

/** Formats stored "HH:MM" for display; already display-ready, kept for clarity. */
export function formatTime(value: string): string {
  const { hour, minute } = parseTime(value);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function isSupported(): boolean {
  return Platform.OS !== "web";
}

/** Asks once; returns false when the user declined or on web. */
export async function ensurePermission(): Promise<boolean> {
  if (!isSupported()) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (current.canAskAgain === false) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** Removes every reminder this app scheduled, leaving other apps alone. */
async function clearOurs(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => {
        const tag = n.content.data?.tag;
        return tag === DAILY_TAG || tag === WEEKLY_TAG;
      })
      .map((n) =>
        Notifications.cancelScheduledNotificationAsync(n.identifier),
      ),
  );
}

/**
 * Rewrites all reminders from the given settings.
 *
 * An interval longer than a day cannot use a calendar trigger, so those are
 * scheduled as a rolling set of dated one-shots covering the next 60 days.
 */
export async function rescheduleReminders(
  settings: ReminderSettings,
): Promise<boolean> {
  if (!isSupported()) return false;
  const allowed = await ensurePermission();
  if (!allowed) return false;

  await clearOurs();

  const daily = parseTime(settings.daily_time);
  const weekly = parseTime(settings.weekly_time);

  if (settings.daily_enabled) {
    if (settings.daily_interval_days <= 1) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Час для чек-іну",
          body: "Відмітьте самопочуття — це займе хвилину.",
          data: { tag: DAILY_TAG },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: daily.hour,
          minute: daily.minute,
        },
      });
    } else {
      const step = settings.daily_interval_days;
      const horizonDays = 60;
      const now = new Date();

      for (let offset = step; offset <= horizonDays; offset += step) {
        const when = new Date(now);
        when.setDate(when.getDate() + offset);
        when.setHours(daily.hour, daily.minute, 0, 0);

        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Час для чек-іну",
            body: "Відмітьте самопочуття — це займе хвилину.",
            data: { tag: DAILY_TAG },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: when,
          },
        });
      }
    }
  }

  // expo weekday is 1-based with Sunday = 1; ours is 0-based with Sunday = 0.
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Щотижневий чек-ін",
      body: "Вага, заміри та самопочуття за тиждень.",
      data: { tag: WEEKLY_TAG },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: settings.weekly_weekday + 1,
      hour: weekly.hour,
      minute: weekly.minute,
    },
  });

  return true;
}

/** Drops today's daily reminder after a check-in so it does not nag twice. */
export async function skipTodaysDaily(): Promise<void> {
  if (!isSupported()) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const today = new Date();

  await Promise.all(
    scheduled
      .filter((n) => {
        if (n.content.data?.tag !== DAILY_TAG) return false;
        const trigger = n.trigger as { date?: number } | null;
        if (trigger?.date === undefined) return false;
        const fires = new Date(trigger.date);
        return (
          fires.getFullYear() === today.getFullYear() &&
          fires.getMonth() === today.getMonth() &&
          fires.getDate() === today.getDate()
        );
      })
      .map((n) =>
        Notifications.cancelScheduledNotificationAsync(n.identifier),
      ),
  );
}

export async function cancelAllReminders(): Promise<void> {
  if (!isSupported()) return;
  await clearOurs();
}
