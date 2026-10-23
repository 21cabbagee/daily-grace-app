import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { Platform } from "react-native";

// Daily reminders are scheduled locally on the device, so they fire at the user's chosen
// local time (default 6:00 a.m.) in whatever timezone the phone is in, even offline.

const REMINDER_ID = "daily-devotional-reminder";

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === "web" || !Device.isDevice) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

export async function scheduleDailyReminder(hour: number, minute: number): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (!(await ensurePermission())) return false;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("reminders", {
      name: "Daily reminders",
      importance: AndroidImportance.DEFAULT,
    });
  }
  await cancelDailyReminder();
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: "Your daily devotional is ready",
      body: "Take a quiet moment with today's verse and prayer.",
      data: { url: "/devotional" },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: "reminders" },
  });
  return true;
}

export async function cancelDailyReminder(): Promise<void> {
  if (Platform.OS === "web") return;
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
}

export function formatTime(hour: number, minute: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}
