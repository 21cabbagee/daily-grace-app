import { useLocalSearchParams } from "expo-router";
import { DevotionalView } from "@/components/devotional-view";
import { ErrorState, LoadingState, Screen } from "@/components/ui";
import { errorMessage, trpc } from "@/lib/api";

export default function DevotionalDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = trpc.devotional.byId.useQuery({ id: Number(id) }, { enabled: Number.isInteger(Number(id)) });
  return (
    <Screen edges={[]}>
      {query.isLoading ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : query.data ? (
        <DevotionalView devotional={query.data} />
      ) : null}
    </Screen>
  );
}
