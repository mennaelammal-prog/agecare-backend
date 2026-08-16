import { describe, expect, it } from "vitest";
import { getRegistrationValidationError } from "./accountValidation";

describe("getRegistrationValidationError", () => {
  it("requires a six-character password", () => {
    expect(getRegistrationValidationError("short", "short")).toBe("passwordTooShort");
  });

  it("requires matching confirmation", () => {
    expect(getRegistrationValidationError("sixchars", "different")).toBe("passwordsDoNotMatch");
  });

  it("accepts matching valid passwords", () => {
    expect(getRegistrationValidationError("sixchars", "sixchars")).toBeNull();
  });
});
