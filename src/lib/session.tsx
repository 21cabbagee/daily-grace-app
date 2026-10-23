import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setUnauthorizedHandler, trpc, type RouterOutputs } from "./api";
import { cancelDailyReminder } from "./notifications";
import { purchases } from "./purchases";
import { tokenStore } from "./token-store";

export type SessionUser = NonNullable<RouterOutputs["auth"]["me"]>;

interface SessionState {
  status: "loading" | "signedOut" | "signedIn";
  user: SessionUser | null;
  /** Stores a freshly issued token and loads the profile. */
  completeSignIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    tokenStore
      .get()
      .then((t) => setHasToken(!!t))
      .catch(() => setHasToken(false));
  }, []);

  const me = trpc.auth.me.useQuery(undefined, { enabled: hasToken === true, staleTime: 60_000 });

  const signOut = useCallback(async () => {
    await tokenStore.clear().catch(() => {});
    await cancelDailyReminder().catch(() => {});
    await purchases.logOut().catch(() => {});
    queryClient.clear();
    setHasToken(false);
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  // A stored token the server no longer accepts (expired, revoked) means signed out.
  const tokenRejected = !!hasToken && me.isSuccess && me.data === null;
  useEffect(() => {
    if (tokenRejected) void tokenStore.clear().catch(() => {});
  }, [tokenRejected]);

  useEffect(() => {
    if (me.data) void purchases.logIn(String(me.data.id)).catch(() => {});
  }, [me.data]);

  const value = useMemo<SessionState>(() => {
    let status: SessionState["status"] = "loading";
    if (hasToken === false) status = "signedOut";
    else if (hasToken && me.data) status = "signedIn";
    else if (hasToken && (me.isError || tokenRejected)) status = "signedOut";
    return {
      status,
      user: me.data ?? null,
      completeSignIn: async (token) => {
        await tokenStore.set(token);
        queryClient.clear();
        setHasToken(true);
        await utils.auth.me.invalidate();
      },
      signOut,
      refresh: async () => {
        await utils.auth.me.invalidate();
      },
    };
  }, [hasToken, me.data, me.isError, tokenRejected, queryClient, signOut, utils]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

/** For screens rendered only when signed in. */
export function useUser(): SessionUser {
  const { user } = useSession();
  if (!user) throw new Error("useUser called while signed out");
  return user;
}
