import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LIMITS } from "../../../shared/constants";
import { CrisisNotice } from "@/components/crisis-notice";
import { PostCard, timeAgo } from "@/components/post-card";
import { ContentActionsSheet, type ContentTarget } from "@/components/report-sheet";
import { Button, Card, EmptyState, ErrorState, Field, IconButton, LoadingState, Row, Text } from "@/components/ui";
import { errorMessage, trpc } from "@/lib/api";
import { spacing, useTheme } from "@/lib/theme";

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = Number(id);
  const router = useRouter();
  const { colors } = useTheme();
  const utils = trpc.useUtils();
  const [text, setText] = useState("");
  const [actions, setActions] = useState<ContentTarget | null>(null);
  const [crisis, setCrisis] = useState(false);

  const detail = trpc.community.post.useQuery({ postId }, { enabled: Number.isInteger(postId) });
  const post = detail.data?.post;
  const canPost = detail.data?.canPost ?? false;
  const comments = trpc.community.comments.useQuery({ postId }, { enabled: Number.isInteger(postId) });
  const add = trpc.community.addComment.useMutation({
    onSuccess: async (r) => {
      setText("");
      setCrisis(r.crisis);
      await utils.community.invalidate();
    },
  });

  const loadError = detail.error ?? comments.error;
  if (loadError) return <ErrorState message={errorMessage(loadError)} onRetry={() => Promise.all([detail.refetch(), comments.refetch()])} />;

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <FlatList
          data={comments.data ?? []}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          ListHeaderComponent={
            <View style={{ gap: spacing.md }}>
              {post ? (
                <PostCard
                  post={post}
                  onMore={() => setActions({ targetType: "post", targetId: post.id, authorId: post.authorId, authorName: post.authorName, isMine: post.isMine })}
                />
              ) : detail.isLoading ? (
                <LoadingState />
              ) : null}
              {crisis ? <CrisisNotice onDismiss={() => setCrisis(false)} /> : null}
              <Text variant="subheading">Comments</Text>
            </View>
          }
          ListEmptyComponent={comments.isLoading ? <LoadingState /> : <EmptyState icon="chatbubble-outline" title="No comments yet" message="Offer a word of encouragement." />}
          renderItem={({ item }) => (
            <Card>
              <Row style={{ justifyContent: "space-between" }}>
                <Text variant="label">
                  {item.authorName}{" "}
                  <Text variant="caption" muted>
                    · {timeAgo(item.createdAt)}
                  </Text>
                </Text>
                <IconButton
                  icon="ellipsis-horizontal"
                  label="More actions"
                  size={18}
                  onPress={() => setActions({ targetType: "comment", targetId: item.id, authorId: item.authorId, authorName: item.authorName, isMine: item.isMine })}
                />
              </Row>
              <Text>{item.content}</Text>
            </Card>
          )}
        />
        {canPost ? (
          <View style={{ padding: spacing.md, gap: spacing.sm, borderTopColor: colors.border, borderTopWidth: 0.5 }}>
            {add.error ? <Text color={colors.error}>{errorMessage(add.error)}</Text> : null}
            <Row>
              <View style={{ flex: 1 }}>
                <Field placeholder="Write a comment…" value={text} onChangeText={setText} maxLength={LIMITS.commentContent} />
              </View>
              <Button title="Send" loading={add.isPending} disabled={!text.trim()} onPress={() => add.mutate({ postId, content: text })} />
            </Row>
          </View>
        ) : null}
      </KeyboardAvoidingView>
      {actions ? <ContentActionsSheet target={actions} onClose={() => setActions(null)} onDeleted={() => actions.targetType === "post" && router.back()} /> : null}
    </SafeAreaView>
  );
}
