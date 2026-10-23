import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { REPORT_REASONS, type ReportReason } from "../../shared/constants";
import { errorMessage, trpc } from "@/lib/api";
import { radius, spacing, useTheme } from "@/lib/theme";
import { Button, Chip, Text } from "./ui";

const LABELS: Record<ReportReason, string> = {
  spam: "Spam",
  harassment: "Harassment or bullying",
  inappropriate: "Inappropriate content",
  false_teaching: "Misleading teaching",
  self_harm: "Someone may be at risk",
  other: "Something else",
};

export interface ContentTarget {
  targetType: "post" | "comment";
  targetId: number;
  authorId: number;
  authorName: string;
  isMine: boolean;
}

/** Report / block / delete actions for a community post or comment. */
export function ContentActionsSheet({ target, onClose, onDeleted }: { target: ContentTarget; onClose: () => void; onDeleted?: () => void }) {
  const { colors } = useTheme();
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<"menu" | "report" | "done">("menu");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [doneMessage, setDoneMessage] = useState("");

  const report = trpc.community.report.useMutation({
    onSuccess: () => {
      setDoneMessage("Thanks for letting us know. Our team will review it.");
      setMode("done");
    },
  });
  const block = trpc.community.block.useMutation({
    onSuccess: async () => {
      await utils.community.invalidate();
      setDoneMessage(`You won't see posts or comments from ${target.authorName} anymore.`);
      setMode("done");
    },
  });
  const afterDelete = async () => {
    await utils.community.invalidate();
    onDeleted?.();
    onClose();
  };
  const deletePost = trpc.community.deletePost.useMutation({ onSuccess: afterDelete });
  const deleteComment = trpc.community.deleteComment.useMutation({ onSuccess: afterDelete });
  const error = report.error ?? block.error ?? deletePost.error ?? deleteComment.error;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} onPress={onClose} accessibilityLabel="Close" />
      <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          {mode === "menu" &&
            (target.isMine ? (
              <Button
                title={`Delete ${target.targetType}`}
                icon="trash-outline"
                variant="danger"
                loading={deletePost.isPending || deleteComment.isPending}
                onPress={() =>
                  target.targetType === "post" ? deletePost.mutate({ postId: target.targetId }) : deleteComment.mutate({ commentId: target.targetId })
                }
              />
            ) : (
              <>
                <Button title={`Report ${target.targetType}`} icon="flag-outline" variant="secondary" onPress={() => setMode("report")} />
                <Button title={`Block ${target.authorName}`} icon="ban-outline" variant="secondary" loading={block.isPending} onPress={() => block.mutate({ userId: target.authorId })} />
              </>
            ))}

          {mode === "report" && (
            <>
              <Text variant="subheading">Why are you reporting this?</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {REPORT_REASONS.map((r) => (
                  <Chip key={r} label={LABELS[r]} selected={reason === r} onPress={() => setReason(r)} />
                ))}
              </View>
              {reason === "self_harm" ? (
                <Text muted variant="caption">
                  If someone is in immediate danger, call 911. The 988 Suicide & Crisis Lifeline is available by call or text.
                </Text>
              ) : null}
              <Button
                title="Submit report"
                disabled={!reason}
                loading={report.isPending}
                onPress={() => reason && report.mutate({ targetType: target.targetType, targetId: target.targetId, reason })}
              />
            </>
          )}

          {mode === "done" && <Text>{doneMessage}</Text>}
          {error ? <Text color={colors.error}>{errorMessage(error)}</Text> : null}
          <Button title={mode === "done" ? "Done" : "Cancel"} variant="ghost" onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
