/**
 * Minimal hand-rolled replacement for Manus's platform-managed `_core/systemRouter`.
 * See context.ts for why this exists. The original almost certainly exposed
 * platform-level system procedures; nothing in the real AgeCare app calls
 * `trpc.system.*`, so this only offers a liveness check for manual/ops use.
 */
import { publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure.query(() => ({
    status: "ok" as const,
    timestamp: new Date().toISOString(),
  })),
});
