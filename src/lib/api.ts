import { QueryClient } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createTRPCReact, type inferReactQueryProcedureOptions } from "@trpc/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import Constants from "expo-constants";
import { Platform } from "react-native";
import superjson from "superjson";
import type { AppRouter } from "../../server/routers";
import { tokenStore } from "./token-store";

export const trpc = createTRPCReact<AppRouter>();
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type ReactQueryOptions = inferReactQueryProcedureOptions<AppRouter>;

/**
 * EXPO_PUBLIC_API_URL in production. In development we reach the server on the machine
 * running Metro, so physical devices on the same Wi-Fi work without configuration.
 */
export function apiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, "");
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host) return `http://${host}:8787`;
  return Platform.OS === "android" ? "http://10.0.2.2:8787" : "http://localhost:8787";
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => {
        const code = err instanceof TRPCClientError ? err.data?.code : undefined;
        if (code === "UNAUTHORIZED" || code === "FORBIDDEN" || code === "NOT_FOUND" || code === "BAD_REQUEST") return false;
        return count < 2;
      },
    },
  },
});

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${apiBaseUrl()}/trpc`,
      transformer: superjson,
      async headers() {
        const token = await tokenStore.get();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
      async fetch(url, opts) {
        const res = await fetch(url, opts);
        if (res.status === 401) onUnauthorized?.();
        return res;
      },
    }),
  ],
});

/** User-facing message for any tRPC/network error. */
export function errorMessage(err: unknown): string {
  if (err instanceof TRPCClientError) {
    if (err.data?.zodError || err.data?.code === "BAD_REQUEST") {
      const issues = (err.data?.zodError as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors;
      const first = issues && Object.values(issues).flat()[0];
      return first ?? err.message;
    }
    if (err.message === "Failed to fetch" || err.message.includes("Network request failed")) {
      return "Can't reach Daily Grace. Check your connection and try again.";
    }
    return err.message;
  }
  return "Something went wrong. Please try again.";
}

/** True when the server rejected an action because the user's plan doesn't include it. */
export function isUpgradeError(err: unknown): boolean {
  return err instanceof TRPCClientError && err.data?.code === "FORBIDDEN" && /Grace (Plus|Pro)/.test(err.message);
}
