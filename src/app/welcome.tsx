import { Image } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, Screen, Text } from "@/components/ui";
import { trpc } from "@/lib/api";
import { spacing, useTheme } from "@/lib/theme";

export default function Welcome() {
  const router = useRouter();
  const { colors } = useTheme();
  const verse = trpc.devotional.dailyVerse.useQuery();

  return (
    <Screen>
      <Image
        source={require("../../assets/icon.png")}
        style={{ width: 88, height: 88, borderRadius: 20, alignSelf: "center", marginTop: spacing.xl }}
        accessibilityIgnoresInvertColors
        accessibilityLabel="Daily Grace logo"
      />
      <Text variant="title" style={{ textAlign: "center" }}>
        Daily Grace
      </Text>
      <Text muted style={{ textAlign: "center" }}>
        A personal devotional every morning, the Bible in your pocket, and a quiet place to pray.
      </Text>

      {verse.data ? (
        <Card>
          <Text variant="caption" muted>
            TODAY&apos;S VERSE
          </Text>
          <Text variant="scripture">“{verse.data.text}”</Text>
          <Text variant="label">{verse.data.reference}</Text>
        </Card>
      ) : null}

      <Button title="Create a free account" onPress={() => router.push("/sign-up")} />
      <Button title="I already have an account" variant="secondary" onPress={() => router.push("/sign-in")} />
      <Text variant="caption" muted style={{ textAlign: "center" }}>
        By continuing you agree to our{" "}
        <Text variant="caption" color={colors.primary} onPress={() => router.push("/legal/terms")}>
          Terms
        </Text>{" "}
        and{" "}
        <Text variant="caption" color={colors.primary} onPress={() => router.push("/legal/privacy")}>
          Privacy Policy
        </Text>
        .
      </Text>
    </Screen>
  );
}
