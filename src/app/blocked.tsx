import { FlatList } from "react-native";
import { Button, Card, EmptyState, ErrorState, LoadingState, Row, Text } from "@/components/ui";
import { errorMessage, trpc } from "@/lib/api";
import { spacing, useTheme } from "@/lib/theme";

export default function Blocked() {
  const { colors } = useTheme();
  const utils = trpc.useUtils();
  const list = trpc.community.blockedUsers.useQuery();
  const unblock = trpc.community.unblock.useMutation({ onSuccess: () => utils.community.invalidate() });

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={list.data ?? []}
      keyExtractor={(b) => String(b.userId)}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      ListEmptyComponent={
        list.isLoading ? (
          <LoadingState />
        ) : list.error ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : (
          <EmptyState icon="ban-outline" title="You haven't blocked anyone" />
        )
      }
      renderItem={({ item }) => (
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <Text variant="subheading">{item.name}</Text>
            <Button title="Unblock" variant="secondary" loading={unblock.isPending && unblock.variables?.userId === item.userId} onPress={() => unblock.mutate({ userId: item.userId })} />
          </Row>
        </Card>
      )}
    />
  );
}
