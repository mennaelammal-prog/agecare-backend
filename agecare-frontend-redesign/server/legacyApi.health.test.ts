import { describe, expect, it } from "vitest";

describe("configured AgeCare legacy API", () => {
  it("responds to its health endpoint", async () => {
    const apiUrl = process.env.AGECARE_LEGACY_API_URL;
    expect(apiUrl).toBeTruthy();

    const response = await fetch(`${apiUrl!.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(20_000),
    });
    expect(response.ok).toBe(true);

    const payload = (await response.json()) as { status?: string };
    expect(payload.status).toBe("ok");
  }, 25_000);
});
