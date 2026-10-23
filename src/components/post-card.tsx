import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";
import { errorMessage, trpc, type RouterOutputs } from "@/lib/api";
import { spacing, useTheme } from "@/lib/theme";
import { Card, IconButton, Row, Text } from "./ui";

export type FeedPost = RouterOutputs["community"]["feed"]["items"][number];

export function timeAgo(date: Date): string {
  const s = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(date).toLocaleDateString();
}

export function PostCard({ post, onOpen, onMore }: { post: FeedPost; onOpen?: () => void; onMore: () => void }) {
  const { colors } = useTheme();
  const utils = trpc.useUtils();
  const like = trpc.community.toggleLike.useMutation({
    onSuccess: () => utils.community.invalidate(),
  });
  const liked = like.data?.liked ?? post.likedByMe;
  const likeCount = like.data?.likeCount ?? post.likeCount;

  return (
    <Card>
      <Row style={{ justifyContent: "space-between" }}>
        <Row>
          <Ionicons
            name={post.type === "prayer_request" ? "hand-left-outline" : "book-outline"}
            size={16}
            color={post.type === "prayer_request" ? colors.secondary : colors.primary}
          />
          <Text variant="label">{post.authorName}</Text>
          <Text variant="caption" muted>
            · {post.type === "prayer_request" ? "Prayer request" : "Verse reflection"} · {timeAgo(post.createdAt)}
          </Text>
        </Row>
        <IconButton icon="ellipsis-horizontal" label="More actions" size={18} onPress={onMore} />
      </Row>
      {post.reference ? (
        <Text variant="label" color={colors.primary}>
          {post.reference}
        </Text>
      ) : null}
      <Text>{post.content}</Text>
      <Row style={{ gap: spacing.lg }}>
        <Pressable
          onPress={() => like.mutate({ postId: post.id })}
          accessibilityRole="button"
          accessibilityLabel={post.type === "prayer_request" ? (liked ? "Stop praying" : "I'm praying") : liked ? "Unlike" : "Like"}
          accessibilityState={{ selected: liked }}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 44 }}
        >
          <Ionicons
            name={post.type === "prayer_request" ? (liked ? "hand-left" : "hand-left-outline") : liked ? "heart" : "heart-outline"}
            size={20}
            color={liked ? colors.secondary : colors.muted}
          />
          <Text variant="caption" muted>
            {likeCount} {post.type === "prayer_request" ? "praying" : ""}
          </Text>
        </Pressable>
        {onOpen ? (
          <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${post.commentCount} comments`} style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 44 }}>
            <Ionicons name="chatbubble-outline" size={18} color={colors.muted} />
            <Text variant="caption" muted>
              {post.commentCount}
            </Text>
          </Pressable>
        ) : null}
      </Row>
      {like.error ? <Text color={colors.error}>{errorMessage(like.error)}</Text> : null}
    </Card>
  );
}
