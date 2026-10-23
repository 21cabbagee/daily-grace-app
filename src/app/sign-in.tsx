import { Link } from "expo-router";
import { useState } from "react";
import { Button, Field, Screen, Text } from "@/components/ui";
import { errorMessage, trpc } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function SignIn() {
  const { completeSignIn } = useSession();
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signIn = trpc.auth.signIn.useMutation({ onSuccess: (r) => completeSignIn(r.token) });

  return (
    <Screen edges={[]}>
      <Text variant="heading">Welcome back</Text>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" />
      {signIn.error ? (
        <Text color={colors.error} accessibilityRole="alert">
          {errorMessage(signIn.error)}
        </Text>
      ) : null}
      <Button title="Sign in" loading={signIn.isPending} disabled={!email || !password} onPress={() => signIn.mutate({ email, password })} />
      <Link href="/sign-up" replace>
        <Text muted>New to Daily Grace? Create an account</Text>
      </Link>
    </Screen>
  );
}
