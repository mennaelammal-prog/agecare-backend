import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("legacy.register", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("forwards the legacy registration contract and returns the session response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      token: "new-account-token",
      user: { id: 12, full_name: "New Person", email: "new@example.com" },
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const caller = appRouter.createCaller(createContext());
    const result = await caller.legacy.register({ fullName: "New Person", email: "new@example.com", password: "sixchars" });

    expect(result.token).toBe("new-account-token");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/auth\/register$/), expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ full_name: "New Person", email: "new@example.com", password: "sixchars" }),
    }));
  });
});
