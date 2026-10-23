import { useRouter } from "expo-router";
import { FlatList } from "react-native";
import { Card, EmptyState, ErrorState, LoadingState, Text } from "@/components/ui";
import { errorMessage, trpc } from "@/lib/api";
import { spacing, useTheme } from "@/lib/theme";

export default function Bookmarks() {
  const router = useRouter();
  const { colors } = useTheme();
  const list = trpc.bible.bookmarks.useQuery();

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={list.data ?? []}
      keyExtractor={(b) => String(b.id)}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      ListEmptyComponent={
        list.isLoading ? (
          <LoadingState />
        ) : list.error ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : (
          <EmptyState icon="bookmark-outline" title="No bookmarks yet" message="Tap any verse in the Bible reader to bookmark it." />
        )
      }
      renderItem={({ item }) => (
        <Card
          onPress={() => router.push({ pathname: "/bible", params: { book: item.bookId, chapter: String(item.chapter), verse: String(item.verse) } })}
          accessibilityLabel={`Open ${item.reference}`}
        >
          <Text variant="subheading">{item.reference}</Text>
          <Text variant="caption" muted>
            Saved {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </Card>
      )}
    />
  );
}
