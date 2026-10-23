import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Modal, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LIMITS, type PostType } from "../../../shared/constants";
import { CrisisNotice } from "@/components/crisis-notice";
import { PostCard } from "@/components/post-card";
import { ContentActionsSheet, type ContentTarget } from "@/components/report-sheet";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { Button, Card, Chip, EmptyState, ErrorState, Field, IconButton, LoadingState, Row, Text } from "@/components/ui";
import { errorMessage, trpc } from "@/lib/api";
import { spacing, useTheme } from "@/lib/theme";

export default function Community() {
  const router = useRouter();
  const { colors } = useTheme();
  const utils = trpc.useUtils();
  const [type, setType] = useState<PostType | undefined>();
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState<{ type: PostType; content: string; reference: string }>({ type: "verse_reaction", content: "", reference: "" });
  const [actions, setActions] = useState<ContentTarget | null>(null);
  const [crisis, setCrisis] = useState(false);
  const verse = trpc.devotional.dailyVerse.useQuery();

  const feed = trpc.community.feed.useInfiniteQuery({ limit: 20, type }, { getNextPageParam: (last) => last.nextCursor ?? undefined });
  const posts = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const canPost = feed.data?.pages[0]?.canPost ?? false;

  const create = trpc.community.createPost.useMutation({
    onSuccess: async (r) => {
      setComposing(false);
      setDraft({ type: "verse_reaction", content: "", reference: "" });
      setCrisis(r.crisis);
      await utils.community.feed.invalidate();
    },
  });

  function startCompose(t: PostType) {
    setDraft({ type: t, content: "", reference: t === "verse_reaction" ? (verse.data?.reference ?? "") : "" });
    setComposing(true);
  }

  const header = (
    <View style={{ gap: spacing.lg, paddingBottom: spacing.md }}>
      <Text variant="title">Community</Text>
      <Text muted variant="caption">
        Share what God is teaching you and lift each other up in prayer. Be kind — posts that break our guidelines are removed.
      </Text>
      {crisis ? <CrisisNotice onDismiss={() => setCrisis(false)} /> : null}
      {canPost ? (
        <Row>
          <Button title="Share a reflection" icon="book-outline" style={{ flex: 1 }} onPress={() => startCompose("verse_reaction")} />
          <Button title="Ask for prayer" icon="hand-left-outline" variant="secondary" style={{ flex: 1 }} onPress={() => startCompose("prayer_request")} />
        </Row>
      ) : feed.data ? (
        <UpgradePrompt title="Join the conversation" message="Grace Pro members can post and comment. Everyone can read, like, and pray along." />
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        <Chip label="All" selected={!type} onPress={() => setType(undefined)} />
        <Chip label="Reflections" selected={type === "verse_reaction"} onPress={() => setType("verse_reaction")} />
        <Chip label="Prayer requests" selected={type === "prayer_request"} onPress={() => setType("prayer_request")} />
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={posts}
        keyExtractor={(p) => String(p.id)}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={feed.isRefetching && !feed.isFetchingNextPage} onRefresh={() => void feed.refetch()} />}
        onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          feed.isLoading ? (
            <LoadingState />
          ) : feed.error ? (
            <ErrorState message={errorMessage(feed.error)} onRetry={() => feed.refetch()} />
          ) : (
            <EmptyState icon="people-outline" title="No posts yet" message="Be the first to share a reflection on today's verse." />
          )
        }
        ListFooterComponent={feed.isFetchingNextPage ? <LoadingState /> : undefined}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onOpen={() => router.push({ pathname: "/post/[id]", params: { id: String(item.id) } })}
            onMore={() => setActions({ targetType: "post", targetId: item.id, authorId: item.authorId, authorName: item.authorName, isMine: item.isMine })}
          />
        )}
      />

      <Modal visible={composing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setComposing(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
            <Row style={{ justifyContent: "space-between" }}>
              <Text variant="heading">{draft.type === "prayer_request" ? "Ask for prayer" : "Share a reflection"}</Text>
              <IconButton icon="close" label="Close" onPress={() => setComposing(false)} />
            </Row>
            {draft.type === "verse_reaction" ? (
              <Field label="Verse (optional)" value={draft.reference} onChangeText={(reference) => setDraft((d) => ({ ...d, reference }))} maxLength={60} />
            ) : (
              <Card>
                <Text variant="caption" muted>
                  Your first name is shown with your request. Avoid sharing details that could identify others.
                </Text>
              </Card>
            )}
            <Field
              placeholder={draft.type === "prayer_request" ? "How can the community pray for you?" : "What stood out to you?"}
              value={draft.content}
              onChangeText={(content) => setDraft((d) => ({ ...d, content }))}
              multiline
              autoFocus
              maxLength={LIMITS.postContent}
            />
            {create.error ? <Text color={colors.error}>{errorMessage(create.error)}</Text> : null}
            <Button
              title="Post"
              loading={create.isPending}
              disabled={!draft.content.trim()}
              onPress={() => create.mutate({ type: draft.type, content: draft.content, reference: draft.reference.trim() || undefined })}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {actions ? <ContentActionsSheet target={actions} onClose={() => setActions(null)} /> : null}
    </SafeAreaView>
  );
}
