import { useRouter } from "expo-router";
import { useState } from "react";
import { formatReference } from "../../../shared/bible";
import { LIMITS } from "../../../shared/constants";
import { DevotionalView } from "@/components/devotional-view";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { Button, Card, ErrorState, Field, LoadingState, Row, Screen, Text } from "@/components/ui";
import { errorMessage, isUpgradeError, trpc } from "@/lib/api";
import { useTheme } from "@/lib/theme";

export default function TodayDevotional() {
  const router = useRouter();
  const { colors } = useTheme();
  const utils = trpc.useUtils();
  const today = trpc.devotional.today.useQuery();
  const [situation, setSituation] = useState("");
  const generate = trpc.devotional.generate.useMutation({
    onSuccess: () => utils.devotional.today.invalidate(),
  });

  return (
    <Screen>
      <Row style={{ justifyContent: "space-between" }}>
        <Text variant="title">Today</Text>
        <Button title="History" variant="ghost" icon="time-outline" onPress={() => router.push("/devotional/history")} />
      </Row>

      {today.isLoading ? (
        <LoadingState label="Preparing today…" />
      ) : today.error ? (
        <ErrorState message={errorMessage(today.error)} onRetry={() => today.refetch()} />
      ) : today.data?.devotional ? (
        <DevotionalView devotional={today.data.devotional} />
      ) : today.data ? (
        <>
          <Card>
            <Text variant="caption" muted>
              TODAY&apos;S PASSAGE
            </Text>
            <Text variant="heading">{formatReference(today.data.reference)}</Text>
            <Text muted>
              We&apos;ll write a short devotional on this passage: an opening reflection, three insights, and a closing prayer.
            </Text>
          </Card>

          <Field
            label="Anything on your heart today? (optional)"
            placeholder="e.g. a new job, a hard conversation, feeling tired"
            value={situation}
            onChangeText={setSituation}
            maxLength={LIMITS.situation}
            multiline
          />
          <Text variant="caption" muted>
            This is used only to shape today&apos;s devotional and isn&apos;t saved.
          </Text>

          {today.data.quota.remaining != null ? (
            <Text variant="caption" muted>
              {today.data.quota.remaining} of {today.data.quota.limit} free devotionals left this week
            </Text>
          ) : null}

          {generate.error && isUpgradeError(generate.error) ? (
            <UpgradePrompt message={generate.error.message} />
          ) : (
            <>
              {generate.error ? <Text color={colors.error}>{errorMessage(generate.error)}</Text> : null}
              <Button
                title={generate.isPending ? "Writing your devotional…" : "Begin today's devotional"}
                icon="sunny-outline"
                loading={generate.isPending}
                disabled={today.data.quota.remaining === 0}
                onPress={() => generate.mutate({ situation: situation.trim() || undefined })}
              />
              {today.data.quota.remaining === 0 ? (
                <UpgradePrompt message="You've used your free devotionals this week. Grace Plus gives you a fresh devotional every day." />
              ) : null}
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}
