/**
 * Minimal hand-rolled replacement for Manus's platform-managed `_core/cookies`.
 * See context.ts for why this exists. Only `auth.logout` (server/routers.ts)
 * uses this — it is not part of the real AgeCare authentication flow, which
 * never sets this cookie in the first place (see context.ts). Kept mainly so
 * the existing test (auth.logout.test.ts) continues to describe intended
 * cookie-clearing behavior if a session cookie is ever introduced.
 */
import type { Request } from "express";
import { ONE_YEAR_MS } from "@shared/const";

export function getSessionCookieOptions(req: Request) {
  const isHttps = req.protocol === "https";
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: (isHttps ? "none" : "lax") as "none" | "lax",
    path: "/",
    maxAge: ONE_YEAR_MS,
  };
}
