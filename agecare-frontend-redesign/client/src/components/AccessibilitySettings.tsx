/**
 * "Display settings" popover: text size (three steps) and a high-contrast
 * toggle. Device-level, not account-level -- see AccessibilityContext.tsx
 * for why and how it's persisted and applied.
 */
import { useState } from "react";
import { Contrast, Type } from "lucide-react";
import { useAccessibility, type FontScale } from "@/contexts/AccessibilityContext";

const FONT_SCALE_OPTIONS: { value: FontScale; label: string; description: string }[] = [
  { value: "normal", label: "A", description: "Normal text size" },
  { value: "large", label: "A+", description: "Large text size" },
  { value: "xlarge", label: "A++", description: "Extra large text size" },
];

export function AccessibilitySettings() {
  const { fontScale, setFontScale, highContrast, setHighContrast } = useAccessibility();
  const [open, setOpen] = useState(false);

  return (
    <div className="a11y-settings">
      <button
        type="button"
        className="icon-button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Display settings"
        aria-expanded={open}
      >
        <Type size={18} />
      </button>
      {open && (
        <div className="a11y-popover" role="dialog" aria-label="Display settings">
          <div className="a11y-popover-head">
            <strong>Display settings</strong>
            <small>Make everything easier to read.</small>
          </div>

          <div className="a11y-field">
            <span>Text size</span>
            <div className="a11y-scale-buttons" role="group" aria-label="Text size">
              {FONT_SCALE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`a11y-scale-button ${fontScale === option.value ? "is-active" : ""}`}
                  onClick={() => setFontScale(option.value)}
                  aria-pressed={fontScale === option.value}
                  aria-label={option.description}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="a11y-field a11y-field-toggle">
            <span><Contrast size={15} aria-hidden="true" /> High contrast</span>
            <input
              type="checkbox"
              checked={highContrast}
              onChange={(event) => setHighContrast(event.target.checked)}
            />
          </label>
        </div>
      )}
    </div>
  );
}
