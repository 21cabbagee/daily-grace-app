import { QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Component, useEffect, type ReactNode } from "react";
import { Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Button, LoadingState, Text } from "@/components/ui";
import { queryClient, trpc, trpcClient } from "@/lib/api";
import { SessionProvider, useSession } from "@/lib/session";
import { spacing, ThemeProvider, useTheme } from "@/lib/theme";

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    // Message only: component stacks can include user content.
    console.error("ui.crash", error.message);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.lg }}>
        <Text variant="heading">Something went wrong</Text>
        <Text muted style={{ textAlign: "center" }}>
          Daily Grace hit an unexpected problem. Your journal is safe.
        </Text>
        <Button title="Reload" onPress={() => this.setState({ failed: false })} />
      </View>
    );
  }
}

function useNotificationRouting() {
  const router = useRouter();
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === "string" && url.startsWith("/")) router.push(url as "/devotional");
    });
    return () => sub.remove();
  }, [router]);
}

function RootNavigator() {
  const { status, user } = useSession();
  const { colors, scheme } = useTheme();
  useNotificationRouting();

  if (status === "loading") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center" }}>
        <LoadingState label="Opening Daily Grace…" />
      </View>
    );
  }

  const signedIn = status === "signedIn";
  const onboarded = !!user?.onboardingCompleted;

  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerTintColor: colors.primary,
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { color: colors.foreground },
          contentStyle: { backgroundColor: colors.background },
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ title: "Sign in" }} />
          <Stack.Screen name="sign-up" options={{ title: "Create account" }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && onboarded} redirectTo={signedIn ? "/onboarding" : "/welcome"}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="devotional/[id]" options={{ title: "Devotional" }} />
          <Stack.Screen name="devotional/history" options={{ title: "Devotional history" }} />
          <Stack.Screen name="post/[id]" options={{ title: "Post" }} />
          <Stack.Screen name="settings" options={{ title: "Settings" }} />
          <Stack.Screen name="blocked" options={{ title: "Blocked people" }} />
          <Stack.Screen name="bookmarks" options={{ title: "Bookmarks" }} />
          <Stack.Screen name="moderation" options={{ title: "Moderation queue" }} />
          <Stack.Screen name="delete-account" options={{ title: "Delete account" }} />
          <Stack.Screen name="paywall" options={{ presentation: "modal", title: "Plans" }} />
        </Stack.Protected>
        <Stack.Screen name="legal/[doc]" options={{ title: "" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <ErrorBoundary>
              <SessionProvider>
                <RootNavigator />
              </SessionProvider>
            </ErrorBoundary>
          </QueryClientProvider>
        </trpc.Provider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
