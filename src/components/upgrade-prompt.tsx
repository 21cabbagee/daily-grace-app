import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { Button, Card, Row, Text } from "./ui";

/** Inline card shown when the server says a feature needs a higher plan. */
export function UpgradePrompt({ message, title = "Upgrade to continue" }: { message: string; title?: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Card style={{ borderColor: colors.accent, borderWidth: 1 }}>
      <Row>
        <Ionicons name="sparkles" size={18} color={colors.accent} />
        <Text variant="subheading">{title}</Text>
      </Row>
      <Text muted>{message}</Text>
      <Button title="See plans" onPress={() => router.push("/paywall")} />
    </Card>
  );
}
