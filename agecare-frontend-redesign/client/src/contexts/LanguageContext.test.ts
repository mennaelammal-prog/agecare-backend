import { describe, expect, it } from "vitest";
import { resolveInitialLanguage } from "./LanguageContext";

describe("resolveInitialLanguage", () => {
  it("uses a supported language in a shareable query preference", () => {
    expect(resolveInitialLanguage("?lang=ar", "en")).toBe("ar");
  });

  it("falls back to the saved language and then English", () => {
    expect(resolveInitialLanguage("?lang=unknown", "es")).toBe("es");
    expect(resolveInitialLanguage("", "unknown")).toBe("en");
  });
});
