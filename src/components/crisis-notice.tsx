import { Ionicons } from "@expo/vector-icons";
import { Linking, View } from "react-native";
import { CRISIS_RESOURCES } from "../../shared/constants";
import { spacing, useTheme } from "@/lib/theme";
import { Button, Card, Row, Text } from "./ui";

export function CrisisNotice({ onDismiss }: { onDismiss?: () => void }) {
  const { colors } = useTheme();
  return (
    <Card style={{ borderColor: colors.secondary, borderWidth: 1 }}>
      <Row>
        <Ionicons name="heart" size={20} color={colors.secondary} />
        <Text variant="subheading">You are not alone</Text>
      </Row>
      <Text>{CRISIS_RESOURCES}</Text>
      <Text muted variant="caption">
        Daily Grace offers spiritual encouragement and is not a substitute for professional care. Please also consider reaching out to a pastor or someone you trust.
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
        <Button title="Call 988" icon="call" onPress={() => Linking.openURL("tel:988")} />
        <Button title="Text 988" variant="secondary" onPress={() => Linking.openURL("sms:988")} />
        {onDismiss ? <Button title="Close" variant="ghost" onPress={onDismiss} /> : null}
      </View>
    </Card>
  );
}
