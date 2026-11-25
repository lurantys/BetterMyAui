"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

const options = {
  major: [
    "Business Administration",
    "Communication Studies",
    "Computer Science",
    "Engineering and Management Science",
    "General Engineering",
    "International Studies",
    "Renewable Energy Systems Engineering",
  ],
  minor: [
    "African Studies",
    "Business Administration",
    "Communication Studies",
    "Computer Science",
    "English",
    "Environmental Studies",
    "Gender Studies",
    "Human Resource Development",
    "International Studies",
    "Leadership",
    "Mathematics",
    "Organizational Studies",
    "Psychology",
  ],
};

type ProgramSelectProps = {
  id: string;
  kind: keyof typeof options;
  value: string;
  required?: boolean;
  onValueChange: (value: string) => void;
};

export function ProgramSelect({ id, kind, value, required, onValueChange }: ProgramSelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const choices = options[kind];
  const placeholder = kind === "major" ? "Select a major" : "No minor";
  const rows = [
    ...(!required ? [{ value: "", label: placeholder }] : []),
    ...(value && !choices.includes(value) ? [{ value, label: `${value} (saved)` }] : []),
    ...choices.map((choice) => ({ value: choice, label: choice })),
  ];

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [open]);

  function select(next: string) {
    onValueChange(next);
    setOpen(false);
  }

  function highlight(index: number) {
    setActive(index);
    requestAnimationFrame(() => listRef.current?.children[index]?.scrollIntoView({ block: "nearest" }));
  }

  return (
    <div ref={rootRef} className={`relative min-w-0 ${open ? "z-20" : ""}`}>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-label={kind === "major" ? "Major" : "Minor"}
        aria-required={required}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onBlur={() => setOpen(false)}
        onClick={() => {
          if (!open) highlight(Math.max(0, rows.findIndex((row) => row.value === value)));
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.stopPropagation();
            event.preventDefault();
            setOpen(false);
          } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const start = Math.max(0, rows.findIndex((row) => row.value === value));
            const index = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1
              : !open ? start : Math.min(rows.length - 1, Math.max(0, active + (event.key === "ArrowDown" ? 1 : -1)));
            setOpen(true);
            highlight(index);
          } else if (open && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            select(rows[active].value);
          }
        }}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={`truncate ${value ? "text-foreground" : "text-muted-foreground"}`}>{value || placeholder}</span>
        <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul id={listId} ref={listRef} role="listbox" aria-label={kind === "major" ? "Majors" : "Minors"}
          className="absolute inset-x-0 top-full mt-1 max-h-56 overflow-auto overscroll-contain rounded-xl border border-border bg-card p-1 shadow-xl">
          {rows.map((row, index) => (
            <li id={`${listId}-${index}`} key={row.value} role="option" aria-selected={row.value === value}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => select(row.value)}
              className={`flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${index === active ? "bg-accent text-accent-foreground" : "text-foreground"}`}>
              <span>{row.label}</span>
              {row.value === value && <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
