import { router } from "../trpc";
import { adminRouter } from "./admin";
import { authRouter } from "./auth";
import { bibleRouter } from "./bible";
import { communityRouter } from "./community";
import { devotionalRouter } from "./devotional";
import { prayersRouter } from "./prayers";
import { subscriptionRouter } from "./subscription";
import { userRouter } from "./user";

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  devotional: devotionalRouter,
  prayers: prayersRouter,
  bible: bibleRouter,
  community: communityRouter,
  subscription: subscriptionRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
