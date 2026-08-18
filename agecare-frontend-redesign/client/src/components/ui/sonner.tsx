import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        // The shadcn template these came from assumes --popover/
        // --popover-foreground tokens this app never defines, so sonner
        // fell back to its own plain white/black defaults. Point them at
        // the app's real card/ink/border tokens instead -- both the
        // normal and high-contrast palettes already define these.
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--ink)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
