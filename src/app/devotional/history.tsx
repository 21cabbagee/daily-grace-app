import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { Card, Chip, EmptyState, ErrorState, LoadingState, Row, Text } from "@/components/ui";
import { errorMessage, trpc } from "@/lib/api";
import { spacing, useTheme } from "@/lib/theme";

export default function DevotionalHistory() {
  const router = useRouter();
  const { colors } = useTheme();
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const history = trpc.devotional.history.useInfiniteQuery({ limit: 20, favoritesOnly }, { getNextPageParam: (l) => l.nextCursor ?? undefined });
  const items = history.data?.pages.flatMap((p) => p.items) ?? [];
  const limited = history.data?.pages[0]?.limited;

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={items}
      keyExtractor={(d) => String(d.id)}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      onEndReached={() => history.hasNextPage && !history.isFetchingNextPage && history.fetchNextPage()}
      ListHeaderComponent={
        <View style={{ gap: spacing.md, paddingBottom: spacing.sm }}>
          <Row>
            <Chip label="All" selected={!favoritesOnly} onPress={() => setFavoritesOnly(false)} />
            <Chip label="Favorites" selected={favoritesOnly} onPress={() => setFavoritesOnly(true)} />
          </Row>
          {limited ? <UpgradePrompt title="Your full history" message="Free accounts keep the last 7 days. Grace Plus keeps your full devotional history." /> : null}
        </View>
      }
      ListEmptyComponent={
        history.isLoading ? (
          <LoadingState />
        ) : history.error ? (
          <ErrorState message={errorMessage(history.error)} onRetry={() => history.refetch()} />
        ) : (
          <EmptyState icon="time-outline" title={favoritesOnly ? "No favorites yet" : "No devotionals yet"} message="Your devotionals will appear here." />
        )
      }
      renderItem={({ item }) => (
        <Card onPress={() => router.push({ pathname: "/devotional/[id]", params: { id: String(item.id) } })} accessibilityLabel={`${item.title}, ${item.date}`}>
          <Row style={{ justifyContent: "space-between" }}>
            <Text variant="caption" muted>
              {new Date(`${item.date}T12:00:00`).toLocaleDateString()} · {item.reference}
            </Text>
            <Row gap={spacing.xs}>
              {item.isFavorite ? <Ionicons name="star" size={16} color={colors.accent} /> : null}
              {item.readAt ? <Ionicons name="checkmark-circle" size={16} color={colors.success} /> : null}
            </Row>
          </Row>
          <Text variant="subheading">{item.title}</Text>
        </Card>
      )}
    />
  );
}
