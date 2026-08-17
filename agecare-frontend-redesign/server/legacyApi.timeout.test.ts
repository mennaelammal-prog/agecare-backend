import { afterEach, describe, expect, it, vi } from "vitest";
import { legacyRequest } from "./legacyApi";

describe("legacyRequest", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("turns a request timeout into a clear message instead of the raw AbortSignal error", async () => {
    // This is exactly what happens when Render's free-tier backend is
    // spun down and cold-starting: fetch rejects with a DOMException
    // named "TimeoutError" once AbortSignal.timeout's deadline passes.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError")));

    await expect(legacyRequest("/auth/login", { method: "POST" })).rejects.toMatchObject({
      code: "TIMEOUT",
      message: expect.stringContaining("starting back up"),
    });
  });

  it("turns a generic network failure into a plain connectivity message, not a raw error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(legacyRequest("/auth/login", { method: "POST" })).rejects.toMatchObject({
      code: "TIMEOUT",
      message: expect.stringContaining("Could not reach"),
    });
  });

  it("still resolves normally on a successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(legacyRequest("/health")).resolves.toEqual({ ok: true });
  });
});
