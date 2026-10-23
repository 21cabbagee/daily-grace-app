import { Ionicons } from "@expo/vector-icons";
import { getCalendars } from "expo-localization";
import { useState } from "react";
import { View } from "react-native";
import { DENOMINATIONS, type Denomination } from "../../shared/constants";
import { Button, Card, Chip, Row, Screen, Text, type IconName } from "@/components/ui";
import { errorMessage, trpc } from "@/lib/api";
import { scheduleDailyReminder } from "@/lib/notifications";
import { useSession } from "@/lib/session";
import { spacing, useTheme } from "@/lib/theme";

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: "sunny-outline", title: "Daily devotional", body: "A short reflection, three insights, and a prayer on today's verse." },
  { icon: "book-outline", title: "Bible reader", body: "Read any chapter, highlight, bookmark, and keep notes." },
  { icon: "heart-outline", title: "Prayer journal", body: "Record prayers and celebrate the ones God answers." },
  { icon: "people-outline", title: "Community", body: "Share verse reflections and pray for one another." },
];

export default function Onboarding() {
  const { colors } = useTheme();
  const { user, refresh } = useSession();
  const [step, setStep] = useState(0);
  const [denomination, setDenomination] = useState<Denomination | null>(null);
  const update = trpc.user.updateProfile.useMutation();
  const prefs = trpc.user.updatePreferences.useMutation();

  async function finish(withReminder: boolean) {
    await update.mutateAsync({
      denomination: denomination ?? "Prefer not to say",
      timezone: getCalendars()[0]?.timeZone ?? undefined,
      onboardingCompleted: true,
    });
    const scheduled = withReminder && (await scheduleDailyReminder(user?.reminderHour ?? 6, user?.reminderMinute ?? 0).catch(() => false));
    // Keep the server preference in sync with what is actually scheduled on this device.
    await prefs.mutateAsync({ remindersEnabled: scheduled });
    await refresh();
  }

  return (
    <Screen>
      <Row style={{ justifyContent: "center", marginTop: spacing.md }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: 28, height: 4, borderRadius: 2, backgroundColor: i <= step ? colors.primary : colors.border }} />
        ))}
      </Row>

      {step === 0 && (
        <>
          <Text variant="title">Welcome{user?.name ? `, ${user.name}` : ""}</Text>
          <Text>
            Daily Grace helps you build a daily rhythm with God: a few quiet minutes in Scripture and prayer each morning.
          </Text>
          <Button title="Continue" onPress={() => setStep(1)} />
        </>
      )}

      {step === 1 && (
        <>
          <Text variant="title">What&apos;s inside</Text>
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <Row>
                <Ionicons name={f.icon} size={22} color={colors.primary} />
                <Text variant="subheading">{f.title}</Text>
              </Row>
              <Text muted>{f.body}</Text>
            </Card>
          ))}
          <Button title="Continue" onPress={() => setStep(2)} />
        </>
      )}

      {step === 2 && (
        <>
          <Text variant="title">Your church tradition</Text>
          <Text muted>This helps us write devotionals that feel at home for you. You can change it anytime.</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {DENOMINATIONS.map((d) => (
              <Chip key={d} label={d} selected={denomination === d} onPress={() => setDenomination(d)} />
            ))}
          </View>
          <Button title="Continue" onPress={() => setStep(3)} />
        </>
      )}

      {step === 3 && (
        <>
          <Text variant="title">Morning reminder</Text>
          <Text muted>We&apos;ll send a gentle reminder at 6:00 AM when your devotional is ready. You can change the time in Settings.</Text>
          {update.error || prefs.error ? <Text color={colors.error}>{errorMessage(update.error ?? prefs.error)}</Text> : null}
          <Button title="Turn on reminders" icon="notifications-outline" loading={update.isPending || prefs.isPending} onPress={() => finish(true)} />
          <Button title="Not now" variant="ghost" disabled={update.isPending || prefs.isPending} onPress={() => finish(false)} />
        </>
      )}
    </Screen>
  );
}
