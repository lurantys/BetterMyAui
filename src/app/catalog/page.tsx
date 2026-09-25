"use client";

import {
  startTransition,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { Search, ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NavBar } from "@/components/nav-bar";

interface Course {
  code: string;
  title: string;
  credits: number;
  level: string;
  prerequisite_raw: string | null;
  prerequisite_courses: string[];
  corequisite_raw: string | null;
  corequisite_courses: string[];
  classification_requirement: string | null;
  other_requirement_notes: string | null;
  description: string;
}

interface ApiResponse {
  disciplines: Record<string, string>;
  courses: Course[];
  total: number;
}

const PAGE_SIZE = 50;
const DEBOUNCE_MS = 300;

function hasAdditionalPrerequisiteDetails(
  raw: string,
  codes: string[]
): boolean {
  let normalized = raw.toUpperCase().replace(/[^A-Z0-9]+/g, "");

  for (const code of codes) {
    normalized = normalized.replace(
      code.toUpperCase().replace(/[^A-Z0-9]+/g, ""),
      ""
    );
  }

  return normalized.replace(/AND|OR/g, "").length > 0;
}

export default function CatalogPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [disciplines, setDisciplines] = useState<Record<string, string>>({});
  const [courseNames, setCourseNames] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedDiscipline, setSelectedDiscipline] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const abortRef = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    fetch("/api/courses")
      .then((response) => response.json())
      .then((data: ApiResponse) => {
        setDisciplines(data.disciplines);
        setCourseNames(
          Object.fromEntries(
            data.courses.map((course) => [course.code.toUpperCase(), course.title])
          )
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    startTransition(() => {
      setLoading(true);
      setCourses([]);
      setVisibleCount(PAGE_SIZE);
      loadingMoreRef.current = false;
    });

    const params = new URLSearchParams();
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (selectedDiscipline) params.set("discipline", selectedDiscipline);
    if (selectedLevel) params.set("level", selectedLevel);

    fetch(`/api/courses?${params}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data: ApiResponse) => {
        if (controller.signal.aborted) return;
        setCourses(data.courses);
        setLoading(false);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQuery, selectedDiscipline, selectedLevel]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || visibleCount >= courses.length) return;

    loadingMoreRef.current = true;
    setVisibleCount(
      Math.min(visibleCount + PAGE_SIZE, courses.length)
    );
    requestAnimationFrame(() => {
      loadingMoreRef.current = false;
    });
  }, [courses.length, visibleCount]);

  useEffect(() => {
    if (loading || visibleCount >= courses.length) return;

    const checkWindowScroll = () => {
      const sentinel = loadMoreRef.current;
      if (!sentinel) return;

      const sentinelRect = sentinel.getBoundingClientRect();
      if (sentinelRect.top <= window.innerHeight + 320) {
        loadMore();
      }
    };

    window.addEventListener("scroll", checkWindowScroll, { passive: true });
    window.addEventListener("resize", checkWindowScroll);
    checkWindowScroll();

    return () => {
      window.removeEventListener("scroll", checkWindowScroll);
      window.removeEventListener("resize", checkWindowScroll);
    };
  }, [courses.length, loadMore, loading, visibleCount]);

  const disciplineCodes = useMemo(
    () => Object.keys(disciplines).sort(),
    [disciplines]
  );
  const visibleCourses = useMemo(
    () => courses.slice(0, visibleCount),
    [courses, visibleCount]
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <NavBar active="/catalog" />

        <main className="min-w-0 flex-1">
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8 sm:px-8">
            <header className="mb-7">
              <h1 className="text-2xl font-semibold tracking-[-0.025em] text-foreground">
                Course catalog
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                AUI Academic Catalog 2024–2025
              </p>
            </header>

            <div className="mb-5 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by code or title"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-9 rounded-md bg-card pl-9 shadow-none"
                />
              </div>
              <div className="relative">
                <select
                  value={selectedDiscipline}
                  onChange={(event) => setSelectedDiscipline(event.target.value)}
                  className="h-9 appearance-none rounded-md border-0 bg-card px-3 pr-8 text-sm text-foreground shadow-none outline-none ring-1 ring-inset ring-border/70 focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <option value="">All disciplines</option>
                  {disciplineCodes.map((code) => (
                    <option key={code} value={code}>
                      {code} — {disciplines[code]}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
              <div className="relative">
                <select
                  value={selectedLevel}
                  onChange={(event) => setSelectedLevel(event.target.value)}
                  className="h-9 appearance-none rounded-md border-0 bg-card px-3 pr-8 text-sm text-foreground shadow-none outline-none ring-1 ring-inset ring-border/70 focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <option value="">All levels</option>
                  <option value="undergraduate">Undergraduate</option>
                  <option value="graduate">Graduate</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            <div className="mb-3 text-xs tabular-nums text-muted-foreground">
              {loading ? "Loading courses" : `${courses.length} courses`}
            </div>

            <div className="overflow-hidden rounded-lg bg-card">
              <div className="divide-y divide-border/60">
                {visibleCourses.map((course) => {
                  const expanded = expandedCourse === course.code;
                  return (
                    <div key={course.code}>
                      <button
                        onClick={() =>
                          setExpandedCourse(expanded ? null : course.code)
                        }
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-accent/35"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="font-mono text-sm font-semibold text-foreground">
                            {course.code}
                          </span>
                          <span className="truncate text-sm text-foreground/90">
                            {course.title}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {course.credits} cr
                          </span>
                          {course.level === "graduate" && (
                            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Graduate
                            </span>
                          )}
                        </div>
                        {expanded ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>

                      {expanded && (
                        <div className="bg-muted/20 px-5 pb-5 pt-4">
                          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                            {course.description}
                          </p>
                          {course.prerequisite_courses.length > 0 && (
                            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                              <span className="font-medium text-muted-foreground">
                                Prerequisites:
                              </span>
                              {course.prerequisite_courses.map((code) => {
                                const normalizedCode = code.trim().toUpperCase();
                                const name = courseNames[normalizedCode];
                                return (
                                  <span
                                    key={`${course.code}-${code}`}
                                    className="group relative inline-flex outline-none"
                                    tabIndex={0}
                                    aria-label={name ? `${code}: ${name}` : code}
                                  >
                                    <span className="cursor-help font-mono font-medium text-primary underline decoration-primary/30 underline-offset-4 transition-colors group-hover:decoration-primary group-focus-within:decoration-primary">
                                      {code}
                                    </span>
                                    {name && (
                                      <span
                                        role="tooltip"
                                        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-64 -translate-x-1/2 whitespace-normal rounded-md border border-border bg-popover px-3 py-2 text-left text-xs leading-5 text-popover-foreground shadow-lg group-hover:block group-focus-within:block"
                                      >
                                        {name}
                                      </span>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                          {course.prerequisite_raw &&
                            (course.prerequisite_courses.length === 0 ||
                              hasAdditionalPrerequisiteDetails(
                                course.prerequisite_raw,
                                course.prerequisite_courses
                              )) && (
                              <p
                                className={`text-xs text-foreground ${
                                  course.prerequisite_courses.length > 0
                                    ? "mt-1.5"
                                    : "mt-3"
                                }`}
                              >
                                <span className="font-medium text-muted-foreground">
                                  {course.prerequisite_courses.length > 0
                                    ? "Notes: "
                                    : "Prerequisites: "}
                                </span>
                                {course.prerequisite_raw}
                              </p>
                            )}
                          {course.corequisite_raw && (
                            <p className="mt-1.5 text-xs text-foreground">
                              <span className="font-medium text-muted-foreground">
                                Corequisites:{" "}
                              </span>
                              {course.corequisite_raw}
                            </p>
                          )}
                          {course.other_requirement_notes && (
                            <p className="mt-2 text-xs text-status-missing">
                              {course.other_requirement_notes}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {!loading && visibleCount < courses.length && (
              <div
                ref={loadMoreRef}
                className="flex h-12 items-center justify-center"
                aria-live="polite"
              >
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-primary" />
                <span className="sr-only">Loading more courses</span>
              </div>
            )}

            {!loading && courses.length === 0 && (
              <div className="py-20 text-center text-sm text-muted-foreground">
                No courses match your search.
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
