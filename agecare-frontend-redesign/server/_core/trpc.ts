/**
 * Minimal hand-rolled replacement for Manus's platform-managed `_core/trpc`.
 * See context.ts for why this exists. The client (client/src/main.tsx) uses a
 * superjson transformer, so the server init must match it.
 */
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;
