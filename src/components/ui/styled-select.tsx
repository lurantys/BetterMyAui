"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string; disabled?: boolean };

export function StyledSelect({ id, label, value, options, onValueChange, placeholder = "Select an option",
  required, disabled, className, triggerClassName, compact = false }: {
  id?: string;
  label: string;
  value: string;
  options: readonly SelectOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  compact?: boolean;
}) {
  const listId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const selected = options.find((option) => option.value === value);
  const enabled = options.flatMap((option, index) => option.disabled ? [] : [index]);
  const expanded = open && !disabled && enabled.length > 0;

  useLayoutEffect(() => {
    if (!expanded) return;
    function position() {
      if (!trigger.current || !list.current) return;
      const rect = trigger.current.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, compact ? 104 : 168), window.innerWidth - 16);
      const below = window.innerHeight - rect.bottom - 10;
      const above = rect.top - 10;
      const upward = below < 180 && above > below;
      const height = Math.max(0, Math.min(232, upward ? above : below));
      Object.assign(list.current.style, {
        left: `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`,
        width: `${width}px`,
        maxHeight: `${height}px`,
        top: upward ? "auto" : `${rect.bottom + 4}px`,
        bottom: upward ? `${window.innerHeight - rect.top + 4}px` : "auto",
        transformOrigin: upward ? "bottom" : "top",
      });
    }
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !list.current?.contains(event.target)) setOpen(false);
    }
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    document.addEventListener("pointerdown", dismiss);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [expanded, compact]);

  useLayoutEffect(() => {
    if (expanded && active >= 0) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, expanded]);

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onValueChange(option.value);
    setOpen(false);
  }

  function initialIndex() {
    const index = options.findIndex((option) => option.value === value && !option.disabled);
    return index < 0 ? enabled[0] : index;
  }

  return (
    <span className={cn("block min-w-0", className)}>
      <button ref={trigger} id={id} type="button" role="combobox" aria-label={label}
        aria-required={required} aria-expanded={expanded} aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        disabled={disabled || enabled.length === 0}
        className={cn("flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-left text-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50", compact && "gap-1 px-1.5", triggerClassName)}
        onBlur={(event) => {
          if (!list.current?.contains(event.relatedTarget)) setOpen(false);
        }}
        onClick={() => {
          if (!expanded) setActive(initialIndex());
          setOpen(!expanded);
        }}
        onKeyDown={(event) => {
          const { key } = event;
          if (key === "Escape" && expanded) {
            event.stopPropagation();
            event.preventDefault();
            setOpen(false);
          } else if (key === "Enter" || key === " ") {
            event.preventDefault();
            if (expanded) choose(active);
            else { setActive(initialIndex()); setOpen(true); }
          } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) {
            event.preventDefault();
            const current = enabled.indexOf(active);
            const step = key === "ArrowDown" ? 1 : -1;
            const next = key === "Home" ? enabled[0] : key === "End" ? enabled.at(-1)
              : expanded ? enabled[Math.max(0, Math.min(enabled.length - 1, current + step))] : initialIndex();
            setActive(next ?? -1);
            setOpen(true);
          } else if (key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
            const now = Date.now();
            const letter = key.toLowerCase();
            const previous = now - typed.current.time < 600 ? typed.current.text : "";
            const query = previous === letter ? letter : previous + letter;
            typed.current = { text: query, time: now };
            const start = enabled.indexOf(active) + 1;
            const matches = [...enabled.slice(start), ...enabled.slice(0, start)];
            const index = matches.find((candidate) => options[candidate].label.toLowerCase().startsWith(query));
            if (index !== undefined) {
              event.preventDefault();
              setActive(index);
              setOpen(true);
            }
          }
        }}>
        <span className={cn("truncate", value ? "text-foreground" : "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
        <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", compact && "size-3", expanded && "rotate-180")} />
      </button>
      {expanded && createPortal(
        <ul ref={list} id={listId} role="listbox" aria-label={label}
          className="styled-select-list fixed z-[80] overflow-auto overscroll-contain rounded-lg border border-border bg-card p-1 text-card-foreground shadow-lg">
          {options.map((option, index) => (
            <li key={option.value} id={`${listId}-${index}`} role="option" aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined} onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => { if (!option.disabled) setActive(index); }} onClick={() => choose(index)}
              className={cn("flex min-h-9 items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm",
                option.disabled ? "cursor-not-allowed text-muted-foreground opacity-60" : "cursor-pointer",
                index === active && "bg-accent text-accent-foreground")}>
              <span>{option.label}</span>
              {option.value === value && <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />}
            </li>
          ))}
        </ul>, document.body)}
    </span>
  );
}
