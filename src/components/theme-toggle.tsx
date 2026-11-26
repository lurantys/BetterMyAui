"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme-provider";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
    >
      {resolvedTheme === "dark" ? (
        <Moon key="dark" aria-hidden="true" className="motion-theme-icon h-4 w-4" />
      ) : (
        <Sun key="light" aria-hidden="true" className="motion-theme-icon h-4 w-4" />
      )}
    </button>
  );
}
