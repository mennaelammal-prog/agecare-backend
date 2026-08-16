/**
 * Bridges the redesigned AgeCare UI to the existing REST API.
 * The client sends the user-held legacy JWT only to this application; this module forwards it to the configured API.
 */
import { TRPCError } from "@trpc/server";

type LegacyRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  token?: string;
  body?: unknown;
};

const fallbackLegacyApiUrl = "https://agecare-backend-c8uq.onrender.com/api";

export function getLegacyApiUrl() {
  return (process.env.AGECARE_LEGACY_API_URL || fallbackLegacyApiUrl).replace(/\/$/, "");
}

export async function legacyRequest<T>(path: string, options: LegacyRequestOptions = {}): Promise<T> {
  const url = `${getLegacyApiUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });

  const responseText = await response.text();
  let payload: unknown = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = { error: "The legacy API returned an unexpected response." };
  }

  if (!response.ok) {
    const detail = payload as { error?: string; message?: string } | null;
    throw new TRPCError({
      code: response.status === 401 ? "UNAUTHORIZED" : response.status === 404 ? "NOT_FOUND" : "BAD_REQUEST",
      message: detail?.error || detail?.message || `AgeCare service request failed (${response.status}).`,
    });
  }

  return payload as T;
}
