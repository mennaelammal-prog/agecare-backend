/**
 * Display settings (text size, high contrast) -- device-level, not tied to
 * an AgeCare account, persisted to localStorage the same way
 * LanguageContext persists the chosen language. Applied via `data-*`
 * attributes on <html>, which index.css keys its rules off (see the
 * "Display settings" block there).
 *
 * Text size uses CSS `zoom` rather than a root font-size + rem conversion:
 * this stylesheet was written entirely in px (no rem usage to scale off
 * of), and a full rem conversion across every font-size declaration was a
 * much larger change than this warranted. `zoom` scales the whole rendered
 * page uniformly -- text, spacing, controls together -- without the reflow/
 * overlap problems a CSS `transform: scale()` on a container would cause,
 * and is supported by every actively-updated browser at this point
 * (Firefox added support in 2024).
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type FontScale = "normal" | "large" | "xlarge";

type AccessibilityContextValue = {
  fontScale: FontScale;
  setFontScale: (scale: FontScale) => void;
  highContrast: boolean;
  setHighContrast: (value: boolean) => void;
};

const AccessibilityContext = createContext<AccessibilityContextValue | undefined>(undefined);

function resolveInitialFontScale(stored: string | null): FontScale {
  return stored === "large" || stored === "xlarge" ? stored : "normal";
}

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [fontScale, setFontScale] = useState<FontScale>(() => {
    if (typeof window === "undefined") return "normal";
    return resolveInitialFontScale(window.localStorage.getItem("agecare-font-scale"));
  });
  const [highContrast, setHighContrast] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("agecare-high-contrast") === "true";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.setAttribute("data-font-scale", fontScale);
    window.localStorage.setItem("agecare-font-scale", fontScale);
  }, [fontScale]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (highContrast) document.documentElement.setAttribute("data-contrast", "high");
    else document.documentElement.removeAttribute("data-contrast");
    window.localStorage.setItem("agecare-high-contrast", String(highContrast));
  }, [highContrast]);

  const value = useMemo(
    () => ({ fontScale, setFontScale, highContrast, setHighContrast }),
    [fontScale, highContrast],
  );
  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (!context) throw new Error("useAccessibility must be used within AccessibilityProvider");
  return context;
}
