import { getCalendars } from "expo-localization";
import { Link } from "expo-router";
import { useState } from "react";
import { LIMITS } from "../../shared/constants";
import { Button, Field, Screen, Text } from "@/components/ui";
import { errorMessage, trpc } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function SignUp() {
  const { completeSignIn } = useSession();
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signUp = trpc.auth.signUp.useMutation({ onSuccess: (r) => completeSignIn(r.token) });
  const tooShort = password.length > 0 && password.length < LIMITS.passwordMin;

  return (
    <Screen edges={[]}>
      <Text variant="heading">Create your account</Text>
      <Text muted>Your prayers and notes are private to you.</Text>
      <Field label="First name" value={name} onChangeText={setName} autoComplete="given-name" textContentType="givenName" maxLength={LIMITS.name} />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        error={tooShort ? `At least ${LIMITS.passwordMin} characters` : null}
      />
      {signUp.error ? (
        <Text color={colors.error} accessibilityRole="alert">
          {errorMessage(signUp.error)}
        </Text>
      ) : null}
      <Button
        title="Create account"
        loading={signUp.isPending}
        disabled={!name.trim() || !email || password.length < LIMITS.passwordMin}
        onPress={() => signUp.mutate({ name, email, password, timezone: getCalendars()[0]?.timeZone ?? undefined })}
      />
      <Link href="/sign-in" replace>
        <Text muted>Already have an account? Sign in</Text>
      </Link>
    </Screen>
  );
}
