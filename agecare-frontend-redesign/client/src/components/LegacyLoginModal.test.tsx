import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { LegacyLoginModal } from "./LegacyCareModules";

const noop = () => {};

describe("LegacyLoginModal", () => {
  it("renders the account-creation fields when opened in registration mode", () => {
    const markup = renderToStaticMarkup(
      <LanguageProvider>
        <LegacyLoginModal loading={false} onClose={noop} onSubmit={noop} onRegister={noop} initialMode="register" />
      </LanguageProvider>,
    );

    expect(markup).toContain("Create your AgeCare account.");
    expect(markup).toContain("Full name");
    expect(markup).toContain("Confirm password");
    expect(markup).toContain("Create account");
  });

  it("renders the sign-in action by default", () => {
    const markup = renderToStaticMarkup(
      <LanguageProvider>
        <LegacyLoginModal loading={false} onClose={noop} onSubmit={noop} onRegister={noop} />
      </LanguageProvider>,
    );

    expect(markup).toContain("Connect my account");
    expect(markup).toContain("New to AgeCare? Create an account");
  });
});
