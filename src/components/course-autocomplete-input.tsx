"use client";

import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import type { CatalogCourse } from "@/lib/store";

export function CourseAutocompleteInput({ id, value, placeholder, onChange, onSelect }: {
  id: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onSelect: (course: CatalogCourse) => void;
}) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const [result, setResult] = useState<{ query: string; courses: CatalogCourse[] }>({ query: "", courses: [] });
  const query = value.trim();
  const courses = focused && !dismissed && result.query === query ? result.courses : [];

  useEffect(() => {
    if (!focused || dismissed || query.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/courses?q=${encodeURIComponent(query)}&limit=6`, { signal: controller.signal });
        if (!response.ok) return;
        const body = await response.json();
        if (!controller.signal.aborted && Array.isArray(body.courses)) setResult({ query, courses: body.courses });
      } catch {
        // Manual entry remains available when the catalog cannot be reached.
      }
    }, 150);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, dismissed, focused]);

  function choose(course: CatalogCourse) {
    onSelect(course);
    setDismissed(true);
    setActive(-1);
  }

  return (
    <div className={`relative min-w-0 ${courses.length ? "z-20" : ""}`}>
      <Input id={id} value={value} placeholder={placeholder} autoComplete="off"
        role="combobox" aria-autocomplete="list" aria-expanded={courses.length > 0}
        aria-controls={courses.length ? listId : undefined}
        aria-activedescendant={courses[active] ? `${listId}-${active}` : undefined}
        onFocus={() => { setFocused(true); setDismissed(false); }}
        onBlur={() => { setFocused(false); setActive(-1); }}
        onChange={(event) => {
          setActive(-1);
          setDismissed(false);
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (!courses.length || event.nativeEvent.isComposing) return;
          if (event.key === "Escape") {
            event.stopPropagation();
            setDismissed(true);
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setActive((previous) => event.key === "ArrowDown"
              ? (previous + 1) % courses.length
              : previous <= 0 ? courses.length - 1 : previous - 1);
          } else if (event.key === "Enter" && courses[active]) {
            event.preventDefault();
            choose(courses[active]);
          }
        }}
      />
      {courses.length > 0 && (
        <ul id={listId} role="listbox" aria-label="Catalog matches" className="motion-menu absolute inset-x-0 top-full mt-1 max-h-52 min-w-full overflow-auto overscroll-contain rounded-lg border border-border bg-card p-1 shadow-xl sm:min-w-64">
          {courses.map((course, index) => (
            <li key={course.code} id={`${listId}-${index}`} role="option" aria-selected={active === index}
              onMouseDown={(event) => event.preventDefault()} onClick={() => choose(course)}
              className={`cursor-pointer rounded-md px-3 py-2 text-left hover:bg-accent ${active === index ? "bg-accent" : ""}`}>
              <span className="block text-[11px] font-semibold text-primary">{course.code} · {course.credits} cr</span>
              <span className="block break-words text-sm text-foreground">{course.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
