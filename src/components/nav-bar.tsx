"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  CalendarDays,
  BookOpen,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const navItems = [
  { href: "/calendar", icon: CalendarDays, label: "Schedule" },
  { href: "/catalog", icon: BookOpen, label: "Catalog" },
  { href: "/gpa", icon: LayoutGrid, label: "My Career" },
];

const SIDEBAR_STORAGE_KEY = "jenzabar_plus_sidebar_expanded";

export function NavBar({ active }: { active: string }) {
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      return saved === null ? true : saved === "true";
    } catch {
      // Keep the expanded default when browser storage is unavailable.
      return true;
    }
  });

  const setAndPersistExpanded = (next: boolean) => {
    setExpanded(next);
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
    } catch {
      // Sidebar state still works for this session when storage is unavailable.
    }
  };

  return (
    <nav
      className={`sticky top-0 flex h-screen shrink-0 flex-col bg-background py-3 transition-[width] duration-200 ${
        expanded ? "w-[184px]" : "w-[60px]"
      }`}
    >
      <div className="mb-2 px-2">
        {expanded ? (
          <div className="relative flex items-center justify-center">
            <Link href="/" className="shrink-0">
              <Image
                src="/assets/brand/favicon.png"
                alt="Jenzabar+"
                width={40}
                height={40}
                className="h-10 w-10"
              />
            </Link>
            <button
              onClick={() => setAndPersistExpanded(false)}
              className="absolute right-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Collapse"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAndPersistExpanded(true)}
            className="flex w-full items-center justify-center rounded-md px-2 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Expand"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mb-5 flex flex-col gap-1 px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              } ${expanded ? "px-2.5" : "justify-center px-0"}`}
              title={item.label}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  isActive ? "text-primary" : ""
                }`}
              />
              {expanded && <span>{item.label}</span>}
            </Link>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col items-center gap-2 px-2">
        <ThemeToggle />
      </div>
    </nav>
  );
}
