import { Link, Stack } from "expo-router";
import { EmptyState, Screen, Text } from "@/components/ui";

export default function NotFound() {
  return (
    <Screen>
      <Stack.Screen options={{ title: "Not found" }} />
      <EmptyState
        icon="compass-outline"
        title="This page doesn't exist"
        action={
          <Link href="/">
            <Text>Go home</Text>
          </Link>
        }
      />
    </Screen>
  );
}
