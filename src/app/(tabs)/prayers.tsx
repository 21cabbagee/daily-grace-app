import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, FlatList, Modal, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { hasTier, LIMITS, PRAYER_CATEGORIES, PRAYER_CATEGORY_LABELS, PRAYER_SUGGESTION_TIER, type PrayerCategory } from "../../../shared/constants";
import { CrisisNotice } from "@/components/crisis-notice";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { Button, Card, Chip, EmptyState, ErrorState, Field, IconButton, LoadingState, Row, Text } from "@/components/ui";
import { errorMessage, trpc, type RouterOutputs } from "@/lib/api";
import { useUser } from "@/lib/session";
import { spacing, useTheme } from "@/lib/theme";

type Prayer = RouterOutputs["prayers"]["list"][number];
type StatusFilter = "all" | "open" | "answered";

function confirm(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onConfirm },
  ]);
}

export default function Prayers() {
  const { colors } = useTheme();
  const user = useUser();
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState<PrayerCategory | undefined>();
  const [editing, setEditing] = useState<Prayer | "new" | null>(null);
  const [draft, setDraft] = useState<{ content: string; category: PrayerCategory }>({ content: "", category: "petition" });
  const [crisis, setCrisis] = useState(false);

  const list = trpc.prayers.list.useQuery({ status, category });
  const stats = trpc.prayers.stats.useQuery();
  const canSuggest = hasTier(user.tier, PRAYER_SUGGESTION_TIER);
  const suggestions = trpc.prayers.suggestions.useQuery(undefined, { enabled: canSuggest, staleTime: 60 * 60 * 1000 });

  const invalidate = () => Promise.all([utils.prayers.list.invalidate(), utils.prayers.stats.invalidate()]);
  const create = trpc.prayers.create.useMutation({
    onSuccess: async (r) => {
      setCrisis(r.crisis);
      setEditing(null);
      await invalidate();
    },
  });
  const update = trpc.prayers.update.useMutation({
    onSuccess: async () => {
      setEditing(null);
      await invalidate();
    },
  });
  const setAnswered = trpc.prayers.setAnswered.useMutation({
    // Optimistic toggle so the checkmark responds instantly.
    onMutate: async (vars) => {
      const key = { status, category };
      await utils.prayers.list.cancel(key);
      const prev = utils.prayers.list.getData(key);
      utils.prayers.list.setData(key, (old) => old?.map((p) => (p.id === vars.id ? { ...p, isAnswered: vars.isAnswered } : p)));
      return { prev, key };
    },
    onError: (_e, _v, ctx) => ctx && utils.prayers.list.setData(ctx.key, ctx.prev),
    onSettled: invalidate,
  });
  const remove = trpc.prayers.delete.useMutation({ onSuccess: invalidate });

  function openEditor(p: Prayer | "new", seed?: string) {
    setDraft(p === "new" ? { content: seed ?? "", category: "petition" } : { content: p.content, category: p.category });
    setEditing(p);
  }

  function save() {
    if (editing === "new") create.mutate(draft);
    else if (editing) update.mutate({ id: editing.id, ...draft });
  }

  const saveError = create.error ?? update.error;

  const header = (
    <View style={{ gap: spacing.lg, paddingBottom: spacing.md }}>
      <Row style={{ justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Text variant="title">Prayer journal</Text>
          {stats.data ? (
            <Text muted variant="caption">
              {stats.data.total} prayers · {stats.data.answered} answered
            </Text>
          ) : null}
        </View>
        <Button title="New" icon="add" onPress={() => openEditor("new")} />
      </Row>

      {crisis ? <CrisisNotice onDismiss={() => setCrisis(false)} /> : null}

      {canSuggest ? (
        <Card>
          <Row>
            <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
            <Text variant="subheading">Ideas for your {suggestions.data?.period ?? "prayer"} time</Text>
          </Row>
          {suggestions.isLoading ? (
            <LoadingState />
          ) : suggestions.error ? (
            <Text muted>{errorMessage(suggestions.error)}</Text>
          ) : (
            suggestions.data?.suggestions.map((s) => (
              <Card key={s.topic} onPress={() => openEditor("new", `${s.topic}: `)} accessibilityLabel={`Pray about ${s.topic}`} style={{ backgroundColor: colors.background }}>
                <Text variant="label">{s.topic}</Text>
                <Text muted variant="caption">
                  {s.prompt}
                </Text>
              </Card>
            ))
          )}
        </Card>
      ) : (
        <UpgradePrompt title="Prayer ideas" message="Grace Plus suggests gentle prayer topics for your morning, afternoon, and evening." />
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {(["all", "open", "answered"] as const).map((s) => (
          <Chip key={s} label={s === "all" ? "All" : s === "open" ? "Still praying" : "Answered"} selected={status === s} onPress={() => setStatus(s)} />
        ))}
        <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: spacing.xs }} />
        {PRAYER_CATEGORIES.map((c) => (
          <Chip key={c} label={PRAYER_CATEGORY_LABELS[c]} selected={category === c} onPress={() => setCategory(category === c ? undefined : c)} />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(p) => String(p.id)}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
        ListEmptyComponent={
          list.isLoading ? (
            <LoadingState />
          ) : list.error ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
          ) : (
            <EmptyState
              icon="heart-outline"
              title={status === "answered" ? "No answered prayers yet" : "Your journal is empty"}
              message="Write down what's on your heart. Only you can see your prayers."
              action={<Button title="Write a prayer" onPress={() => openEditor("new")} />}
            />
          )
        }
        renderItem={({ item }) => (
          <Card>
            <Row style={{ justifyContent: "space-between" }}>
              <Text variant="caption" muted>
                {PRAYER_CATEGORY_LABELS[item.category].toUpperCase()} · {new Date(item.createdAt).toLocaleDateString()}
              </Text>
              <Row gap={0}>
                <IconButton icon="create-outline" label="Edit prayer" size={20} onPress={() => openEditor(item)} />
                <IconButton
                  icon="trash-outline"
                  label="Delete prayer"
                  size={20}
                  color={colors.error}
                  onPress={() => confirm("Delete prayer?", "This can't be undone.", () => remove.mutate({ id: item.id }))}
                />
              </Row>
            </Row>
            <Text>{item.content}</Text>
            {item.isAnswered && item.answerNote ? (
              <Text muted variant="caption">
                Answer: {item.answerNote}
              </Text>
            ) : null}
            <Button
              title={item.isAnswered ? "Answered — praise God!" : "Mark as answered"}
              icon={item.isAnswered ? "checkmark-circle" : "ellipse-outline"}
              variant={item.isAnswered ? "secondary" : "ghost"}
              onPress={() => setAnswered.mutate({ id: item.id, isAnswered: !item.isAnswered })}
            />
          </Card>
        )}
      />

      <Modal visible={editing !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
            <Row style={{ justifyContent: "space-between" }}>
              <Text variant="heading">{editing === "new" ? "New prayer" : "Edit prayer"}</Text>
              <IconButton icon="close" label="Close" onPress={() => setEditing(null)} />
            </Row>
            <Row style={{ flexWrap: "wrap" }}>
              {PRAYER_CATEGORIES.map((c) => (
                <Chip key={c} label={PRAYER_CATEGORY_LABELS[c]} selected={draft.category === c} onPress={() => setDraft((d) => ({ ...d, category: c }))} />
              ))}
            </Row>
            <Field
              placeholder="Lord, today I bring to you…"
              value={draft.content}
              onChangeText={(content) => setDraft((d) => ({ ...d, content }))}
              multiline
              autoFocus
              maxLength={LIMITS.prayerContent}
            />
            <Text variant="caption" muted>
              Your prayers are private. Daily Grace never shares them or sends them to AI.
            </Text>
            {saveError ? <Text color={colors.error}>{errorMessage(saveError)}</Text> : null}
            <Button title="Save" loading={create.isPending || update.isPending} disabled={!draft.content.trim()} onPress={save} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
