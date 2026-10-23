import { useState } from "react";
import { Button, Card, Field, Screen, Text } from "@/components/ui";
import { errorMessage, trpc } from "@/lib/api";
import { useSession, useUser } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function DeleteAccount() {
  const { colors } = useTheme();
  const user = useUser();
  const { signOut } = useSession();
  const [password, setPassword] = useState("");
  const del = trpc.auth.deleteAccount.useMutation({ onSuccess: signOut });

  return (
    <Screen edges={[]}>
      <Text variant="heading">Delete your account</Text>
      <Card>
        <Text>This permanently deletes your account and everything in it:</Text>
        <Text muted>• Your prayer journal and answered prayers</Text>
        <Text muted>• Devotional history, favorites, and streak</Text>
        <Text muted>• Bookmarks, highlights, and notes</Text>
        <Text muted>• Your community posts, comments, and likes</Text>
        <Text>This can&apos;t be undone.</Text>
      </Card>
      {user.tier !== "free" ? (
        <Card style={{ borderColor: colors.warning, borderWidth: 1 }}>
          <Text>
            Deleting your account does not cancel your App Store or Google Play subscription. Cancel it in your store account settings first to avoid future
            charges.
          </Text>
        </Card>
      ) : null}
      <Field label="Enter your password to confirm" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
      {del.error ? <Text color={colors.error}>{errorMessage(del.error)}</Text> : null}
      <Button title="Permanently delete account" variant="danger" loading={del.isPending} disabled={!password} onPress={() => del.mutate({ password })} />
    </Screen>
  );
}
