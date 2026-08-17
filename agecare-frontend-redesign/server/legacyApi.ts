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

const fallbackLegacyApiUrl = "https://agecare-backend-2.onrender.com/api";

export function getLegacyApiUrl() {
  return (process.env.AGECARE_LEGACY_API_URL || fallbackLegacyApiUrl).replace(/\/$/, "");
}

// Render's free tier spins the backend down after inactivity and warns its
// own dashboard can take "50 seconds or more" to wake back up on the next
// request. The timeout here used to be 20s -- shorter than that -- so the
// very first sign-in/register attempt after any idle period would reliably
// abort while Render was still cold-starting agecare-backend-2, and (since
// nothing below caught it) surface as a raw, unhelpful "The operation was
// aborted" straight from fetch. 65s covers Render's stated worst case with
// margin; the catch block below turns a timeout specifically into a message
// that explains what's actually happening instead of that raw error text.
const REQUEST_TIMEOUT_MS = 65_000;

export async function legacyRequest<T>(path: string, options: LegacyRequestOptions = {}): Promise<T> {
  const url = `${getLegacyApiUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new TRPCError({
      code: "TIMEOUT",
      message: isTimeout
        ? "The AgeCare service is starting back up after being idle (free hosting can take up to a minute) -- please try again in a moment."
        : "Could not reach the AgeCare service. Please check your connection and try again.",
    });
  }

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
