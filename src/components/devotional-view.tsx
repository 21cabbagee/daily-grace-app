import { Ionicons } from "@expo/vector-icons";
import { Share, View } from "react-native";
import { errorMessage, trpc, type RouterOutputs } from "@/lib/api";
import { useSession } from "@/lib/session";
import { spacing, useTheme } from "@/lib/theme";
import { Button, Card, IconButton, Row, Text } from "./ui";

export type DevotionalData = RouterOutputs["devotional"]["byId"];

export function DevotionalView({ devotional }: { devotional: DevotionalData }) {
  const { colors } = useTheme();
  const { refresh } = useSession();
  const utils = trpc.useUtils();

  const markRead = trpc.devotional.markRead.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.devotional.invalidate(), refresh()]);
    },
  });
  const favorite = trpc.devotional.setFavorite.useMutation({
    onSuccess: () => utils.devotional.invalidate(),
  });

  async function share() {
    await Share.share({
      title: devotional.title,
      message: `${devotional.title}\n\n“${devotional.verseText}” — ${devotional.reference}\n\n${devotional.openingReflection}\n\nShared from Daily Grace`,
    });
  }

  const isFavorite = favorite.variables?.isFavorite ?? devotional.isFavorite;

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="caption" muted>
          {new Date(`${devotional.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}
        </Text>
        <Text variant="title">{devotional.title}</Text>
      </View>

      <Card style={{ borderLeftWidth: 4, borderLeftColor: colors.accent }}>
        <Text variant="scripture">“{devotional.verseText}”</Text>
        <Text variant="label" color={colors.primary}>
          {devotional.reference}
        </Text>
      </Card>

      <View style={{ gap: spacing.sm }}>
        <Text variant="subheading">Opening reflection</Text>
        <Text>{devotional.openingReflection}</Text>
      </View>

      {devotional.insights.map((insight, i) => (
        <View key={i} style={{ gap: spacing.sm }}>
          <Text variant="subheading">
            {i + 1}. {insight.heading}
          </Text>
          <Text>{insight.body}</Text>
        </View>
      ))}

      <Card>
        <Row>
          <Ionicons name="hand-left-outline" size={18} color={colors.primary} />
          <Text variant="subheading">Closing prayer</Text>
        </Row>
        <Text style={{ fontStyle: "italic" }}>{devotional.closingPrayer}</Text>
      </Card>

      <Row style={{ justifyContent: "center", gap: spacing.xl }}>
        <IconButton
          icon={isFavorite ? "star" : "star-outline"}
          label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          color={isFavorite ? colors.accent : colors.foreground}
          onPress={() => favorite.mutate({ id: devotional.id, isFavorite: !isFavorite })}
        />
        <IconButton icon="share-outline" label="Share devotional" onPress={share} />
      </Row>

      {devotional.readAt || markRead.isSuccess ? (
        <Row style={{ justifyContent: "center" }}>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <Text color={colors.success} variant="label">
            {markRead.data ? `Completed · ${markRead.data.streakCount}-day streak` : "Completed"}
          </Text>
        </Row>
      ) : (
        <Button title="Mark as read" icon="checkmark" loading={markRead.isPending} onPress={() => markRead.mutate({ id: devotional.id })} />
      )}
      {markRead.error ? <Text color={colors.error}>{errorMessage(markRead.error)}</Text> : null}

      <Text variant="caption" muted style={{ textAlign: "center" }}>
        Written with AI from today&apos;s Scripture. Always test what you read against the Bible itself.
      </Text>
    </View>
  );
}
