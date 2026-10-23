import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { useState, type ReactNode } from "react";
import { Linking, Pressable, Switch, View } from "react-native";
import { DENOMINATIONS, PLANS } from "../../shared/constants";
import { Button, Card, Chip, Field, Row, Screen, Text, type IconName } from "@/components/ui";
import { errorMessage, trpc } from "@/lib/api";
import { cancelDailyReminder, formatTime, scheduleDailyReminder } from "@/lib/notifications";
import { useSession, useUser } from "@/lib/session";
import { spacing, useTheme, type ThemePreference } from "@/lib/theme";

const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
const REMINDER_TIMES = [5, 6, 7, 8, 12, 20, 21].map((h) => ({ hour: h, minute: 0 }));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="caption" muted>
        {title.toUpperCase()}
      </Text>
      <Card style={{ gap: spacing.md }}>{children}</Card>
    </View>
  );
}

function LinkRow({ icon, label, onPress, danger }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 44 }}>
      <Ionicons name={icon} size={20} color={danger ? colors.error : colors.primary} />
      <Text style={{ flex: 1 }} color={danger ? colors.error : undefined}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

function ToggleRow({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <Row style={{ justifyContent: "space-between", minHeight: 44 }}>
      <View style={{ flex: 1 }}>
        <Text>{label}</Text>
        {hint ? (
          <Text variant="caption" muted>
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </Row>
  );
}

export default function Settings() {
  const router = useRouter();
  const { colors, preference, setPreference, largeText, setLargeText } = useTheme();
  const { signOut, refresh } = useSession();
  const user = useUser();
  const [name, setName] = useState(user.name);
  const [notice, setNotice] = useState<string | null>(null);
  const plan = PLANS.find((p) => p.tier === user.tier)!;

  const profile = trpc.user.updateProfile.useMutation({ onSuccess: refresh });
  const prefs = trpc.user.updatePreferences.useMutation({ onSuccess: refresh });
  const signOutAll = trpc.auth.signOutEverywhere.useMutation({ onSuccess: signOut });
  const error = profile.error ?? prefs.error ?? signOutAll.error;

  async function setReminder(enabled: boolean, hour = user.reminderHour, minute = user.reminderMinute) {
    setNotice(null);
    if (enabled) {
      const ok = await scheduleDailyReminder(hour, minute);
      if (!ok) setNotice("Notifications are turned off for Daily Grace. You can allow them in your phone's Settings.");
    } else {
      await cancelDailyReminder();
    }
    prefs.mutate({ remindersEnabled: enabled, reminderHour: hour, reminderMinute: minute });
  }

  return (
    <Screen edges={[]}>
      <Section title="Profile">
        <Field label="First name" value={name} onChangeText={setName} onEndEditing={() => name.trim() && name !== user.name && profile.mutate({ name })} />
        <Text variant="caption" muted>
          {user.email}
        </Text>
        <Text variant="label">Church tradition</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {DENOMINATIONS.map((d) => (
            <Chip key={d} label={d} selected={user.denomination === d} onPress={() => profile.mutate({ denomination: d })} />
          ))}
        </View>
      </Section>

      <Section title="Subscription">
        <Row style={{ justifyContent: "space-between" }}>
          <View>
            <Text variant="subheading">{plan.name}</Text>
            {user.subscriptionExpiresAt ? (
              <Text variant="caption" muted>
                Renews or ends {new Date(user.subscriptionExpiresAt).toLocaleDateString()}
              </Text>
            ) : null}
          </View>
          <Button title={user.tier === "pro" ? "Manage" : "Upgrade"} variant={user.tier === "free" ? "primary" : "secondary"} onPress={() => router.push("/paywall")} />
        </Row>
      </Section>

      <Section title="Reminders">
        <ToggleRow label="Daily devotional reminder" value={user.remindersEnabled} onChange={(v) => setReminder(v)} hint={formatTime(user.reminderHour, user.reminderMinute)} />
        {user.remindersEnabled ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {REMINDER_TIMES.map((t) => (
              <Chip
                key={t.hour}
                label={formatTime(t.hour, t.minute)}
                selected={user.reminderHour === t.hour && user.reminderMinute === t.minute}
                onPress={() => setReminder(true, t.hour, t.minute)}
              />
            ))}
          </View>
        ) : null}
        {notice ? (
          <Text variant="caption" color={colors.warning}>
            {notice}
          </Text>
        ) : null}
      </Section>

      <Section title="Appearance">
        <Row>
          {(["system", "light", "dark"] as ThemePreference[]).map((p) => (
            <Chip key={p} label={p === "system" ? "Automatic" : p === "light" ? "Light" : "Dark"} selected={preference === p} onPress={() => setPreference(p)} />
          ))}
        </Row>
        <ToggleRow label="Larger text" value={largeText} onChange={setLargeText} />
      </Section>

      <Section title="Community">
        <LinkRow icon="ban-outline" label="Blocked people" onPress={() => router.push("/blocked")} />
        {user.role === "admin" ? <LinkRow icon="shield-checkmark-outline" label="Moderation queue" onPress={() => router.push("/moderation")} /> : null}
      </Section>

      <Section title="Support">
        {SUPPORT_EMAIL ? <LinkRow icon="mail-outline" label="Contact support" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} /> : null}
        <LinkRow icon="document-text-outline" label="Terms of Use" onPress={() => router.push("/legal/terms" as Href)} />
        <LinkRow icon="lock-closed-outline" label="Privacy Policy" onPress={() => router.push("/legal/privacy" as Href)} />
        <LinkRow icon="people-outline" label="Community Guidelines" onPress={() => router.push("/legal/guidelines" as Href)} />
      </Section>

      <Section title="Account">
        <LinkRow icon="log-out-outline" label="Sign out" onPress={signOut} />
        <LinkRow icon="phone-portrait-outline" label="Sign out on all devices" onPress={() => signOutAll.mutate()} />
        <LinkRow icon="trash-outline" label="Delete account" danger onPress={() => router.push("/delete-account")} />
      </Section>

      {error ? <Text color={colors.error}>{errorMessage(error)}</Text> : null}
    </Screen>
  );
}
