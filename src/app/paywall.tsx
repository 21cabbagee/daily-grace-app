import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Platform, View } from "react-native";
import { PLANS, tierRank } from "../../shared/constants";
import { Button, Card, LoadingState, Row, Screen, Text } from "@/components/ui";
import { errorMessage, trpc } from "@/lib/api";
import { purchases, type PlanPackage } from "@/lib/purchases";
import { useSession, useUser } from "@/lib/session";
import { spacing, useTheme } from "@/lib/theme";

const MANAGE_URL = Platform.select({
  ios: "https://apps.apple.com/account/subscriptions",
  android: "https://play.google.com/store/account/subscriptions",
});

export default function Paywall() {
  const router = useRouter();
  const { colors } = useTheme();
  const user = useUser();
  const { refresh } = useSession();
  const available = purchases.isAvailable();
  const [packages, setPackages] = useState<PlanPackage[] | null>(available ? null : []);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const sync = trpc.subscription.refresh.useMutation();

  useEffect(() => {
    if (!available) return;
    purchases
      .getPackages()
      .then(setPackages)
      .catch(() => {
        setPackages([]);
        setMessage("We couldn't load plans from the store. Please try again later.");
      });
  }, [available]);

  async function confirmWithServer() {
    const result = await sync.mutateAsync();
    await refresh();
    return result;
  }

  async function buy(p: PlanPackage) {
    setBusy(p.tier);
    setMessage(null);
    try {
      const completed = await purchases.purchase(p.pkg);
      if (!completed) return;
      const result = await confirmWithServer();
      setMessage(
        tierRank[result.tier] >= tierRank[p.tier]
          ? "Thank you! Your subscription is active."
          : "Purchase received. It can take a minute to activate — pull to refresh on Home.",
      );
    } catch (err) {
      setMessage(err instanceof Error && !("data" in err) ? err.message : errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    setBusy("restore");
    setMessage(null);
    try {
      await purchases.restore();
      const result = await confirmWithServer();
      setMessage(result.tier === "free" ? "No active subscription was found for this store account." : "Your subscription has been restored.");
    } catch (err) {
      setMessage(err instanceof Error && !("data" in err) ? err.message : errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen edges={["bottom"]}>
      <Text variant="title">Grow deeper every day</Text>
      <Text muted>Choose the plan that fits your walk. Cancel anytime.</Text>

      {PLANS.map((plan) => {
        const current = plan.tier === user.tier;
        const pkg = packages?.find((p) => p.tier === plan.tier);
        return (
          <Card key={plan.tier} style={current ? { borderColor: colors.primary, borderWidth: 2 } : undefined}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text variant="heading">{plan.name}</Text>
              <Text variant="subheading">{pkg?.priceString ?? plan.priceLabel}</Text>
            </Row>
            {plan.features.map((f) => (
              <Row key={f}>
                <Ionicons name="checkmark" size={18} color={colors.success} />
                <Text style={{ flex: 1 }}>{f}</Text>
              </Row>
            ))}
            {current ? (
              <Text variant="label" color={colors.primary}>
                Your current plan
              </Text>
            ) : plan.tier !== "free" && tierRank[plan.tier] > tierRank[user.tier] ? (
              pkg ? (
                <Button title={`Choose ${plan.name}`} loading={busy === plan.tier} disabled={!!busy} onPress={() => buy(pkg)} />
              ) : packages === null ? (
                <LoadingState />
              ) : null
            ) : null}
          </Card>
        );
      })}

      {!available ? (
        <Card>
          <Text muted>
            Subscriptions are purchased in the Daily Grace app for iPhone and Android. Download it from the App Store or Google Play to upgrade.
          </Text>
        </Card>
      ) : null}

      {message ? <Text color={colors.primary}>{message}</Text> : null}

      {available ? <Button title="Restore purchases" variant="ghost" loading={busy === "restore"} disabled={!!busy} onPress={restore} /> : null}
      {user.tier !== "free" && MANAGE_URL ? <Button title="Manage or cancel subscription" variant="ghost" onPress={() => Linking.openURL(MANAGE_URL)} /> : null}

      <View style={{ gap: spacing.sm }}>
        <Text variant="caption" muted>
          Subscriptions renew automatically each month at the price shown unless cancelled at least 24 hours before the end of the current period. Payment is
          charged to your {Platform.OS === "android" ? "Google Play" : "Apple ID"} account. Manage or cancel anytime in your store account settings.
        </Text>
        <Row style={{ justifyContent: "center", gap: spacing.lg }}>
          <Text variant="caption" color={colors.primary} onPress={() => router.push("/legal/terms" as Href)}>
            Terms of Use
          </Text>
          <Text variant="caption" color={colors.primary} onPress={() => router.push("/legal/privacy" as Href)}>
            Privacy Policy
          </Text>
        </Row>
      </View>
    </Screen>
  );
}
