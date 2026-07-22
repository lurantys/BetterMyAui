"use client";

import { useState } from "react";
import {
  CalendarDays,
  BookOpen,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useUser } from "@/lib/auth/provider";
import { signOut } from "@/lib/auth/actions";

const navItems = [
  { href: "/calendar", icon: CalendarDays, label: "Schedule" },
  { href: "/catalog", icon: BookOpen, label: "Catalog" },
  { href: "/gpa", icon: LayoutGrid, label: "My Career" },
];

export function NavBar({ active }: { active: string }) {
  const [expanded, setExpanded] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const user = useUser();

  return (
    <nav
      className={`flex shrink-0 flex-col border-r border-border bg-card py-3 transition-all duration-200 ${
        expanded ? "w-44" : "w-14"
      }`}
    >
      {/* Logo / toggle */}
      <div className="mb-2 px-2">
        {expanded ? (
          <div className="relative flex items-center justify-center">
            <a href="/" className="shrink-0">
              <img
                src="/logoaui.png"
                alt="BetterJenzabar"
                className="h-12 w-auto"
              />
            </a>
            <button
              onClick={() => setExpanded(false)}
              className="absolute right-0 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="Collapse"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setExpanded(true)}
            className="flex w-full items-center justify-center rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Expand"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className={`mb-2 mx-2 h-px bg-border ${expanded ? "" : "w-8 mx-auto"}`} />

      {/* Nav items */}
      <div className="flex flex-col gap-0.5 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.href;
          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              } ${expanded ? "" : "justify-center"}`}
              title={item.label}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {expanded && <span>{item.label}</span>}
            </a>
          );
        })}
      </div>

      {/* User + Theme */}
      <div className="mt-auto flex flex-col items-center gap-2 px-2">
        <ThemeToggle />
        {user && (
          <button
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              await signOut();
              window.location.href = "/";
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none"
            title={expanded ? "Sign out" : user.email}
          >
            {signingOut ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
            ) : (
              <LogOut className="h-4 w-4 shrink-0" />
            )}
            {expanded && <span>{signingOut ? "Signing out..." : "Sign out"}</span>}
          </button>
        )}
      </div>
    </nav>
  );
}
