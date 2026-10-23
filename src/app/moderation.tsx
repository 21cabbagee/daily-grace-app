import { FlatList } from "react-native";
import { Button, Card, EmptyState, ErrorState, LoadingState, Row, Text } from "@/components/ui";
import { errorMessage, trpc } from "@/lib/api";
import { spacing, useTheme } from "@/lib/theme";

export default function Moderation() {
  const { colors } = useTheme();
  const utils = trpc.useUtils();
  const queue = trpc.admin.reportQueue.useQuery();
  const resolve = trpc.admin.resolve.useMutation({ onSuccess: () => utils.admin.reportQueue.invalidate() });

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={queue.data ?? []}
      keyExtractor={(r) => String(r.id)}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      ListHeaderComponent={resolve.error ? <Text color={colors.error}>{errorMessage(resolve.error)}</Text> : undefined}
      ListEmptyComponent={
        queue.isLoading ? (
          <LoadingState />
        ) : queue.error ? (
          <ErrorState message={errorMessage(queue.error)} onRetry={() => queue.refetch()} />
        ) : (
          <EmptyState icon="shield-checkmark-outline" title="No open reports" />
        )
      }
      renderItem={({ item }) => (
        <Card>
          <Text variant="caption" muted>
            {item.targetType.toUpperCase()} #{item.targetId} · {item.reason.replace("_", " ")} · {item.target?.reportCount ?? 0} reports · {item.target?.status ?? "deleted"}
          </Text>
          <Text>{item.target?.content ?? "(content already deleted)"}</Text>
          {item.reason === "self_harm" ? (
            <Text variant="caption" color={colors.secondary}>
              Possible risk of harm — follow the crisis-response procedure in MODERATION.md.
            </Text>
          ) : null}
          <Row style={{ flexWrap: "wrap" }}>
            <Button title="Remove" variant="danger" onPress={() => resolve.mutate({ reportId: item.id, action: "remove" })} />
            <Button title="Restore" variant="secondary" onPress={() => resolve.mutate({ reportId: item.id, action: "restore" })} />
            <Button title="Dismiss" variant="ghost" onPress={() => resolve.mutate({ reportId: item.id, action: "dismiss" })} />
          </Row>
        </Card>
      )}
    />
  );
}
