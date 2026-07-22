"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Search, ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
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

export default function CatalogPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [disciplines, setDisciplines] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedDiscipline, setSelectedDiscipline] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const abortRef = useRef<AbortController | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setVisibleCount(PAGE_SIZE);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch disciplines once on mount (no dependency on query filters)
  useEffect(() => {
    fetch("/api/courses")
      .then((r) => r.json())
      .then((data: ApiResponse) => {
        setDisciplines(data.disciplines);
      })
      .catch(() => {});
  }, []);

  // Fetch courses with AbortController to prevent race conditions
  useEffect(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setCourses([]);

    const params = new URLSearchParams();
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (selectedDiscipline) params.set("discipline", selectedDiscipline);
    if (selectedLevel) params.set("level", selectedLevel);

    fetch(`/api/courses?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: ApiResponse) => {
        if (controller.signal.aborted) return;
        setCourses(data.courses);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [debouncedQuery, selectedDiscipline, selectedLevel]);

  const disciplineCodes = useMemo(
    () => Object.keys(disciplines).sort(),
    [disciplines]
  );

  const visibleCourses = useMemo(
    () => courses.slice(0, visibleCount),
    [courses, visibleCount]
  );

  const hasMore = visibleCount < courses.length;

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <NavBar active="/catalog" />

        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto px-6 py-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">
              Course Catalog
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse all courses from the AUI Academic Catalog 2024-2025
            </p>
          </div>

          {/* Filters */}
          <div className="mb-6 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by code or title..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="relative">
              <select
                value={selectedDiscipline}
                onChange={(e) => setSelectedDiscipline(e.target.value)}
                className="h-9 appearance-none rounded-md border border-input bg-transparent px-3 pr-8 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All disciplines</option>
                {disciplineCodes.map((code) => (
                  <option key={code} value={code}>
                    {code} - {disciplines[code]}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            <div className="relative">
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="h-9 appearance-none rounded-md border border-input bg-transparent px-3 pr-8 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All levels</option>
                <option value="undergraduate">Undergraduate</option>
                <option value="graduate">Graduate</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          <div className="mb-4 text-xs text-muted-foreground">
            {loading ? "Loading..." : `${courses.length} courses`}
          </div>

          {/* Course list */}
          <div className="space-y-2">
            {visibleCourses.map((course) => (
              <div
                key={course.code}
                className="rounded-lg border border-border bg-card"
              >
                <button
                  onClick={() =>
                    setExpandedCourse(
                      expandedCourse === course.code ? null : course.code
                    )
                  }
                  className="flex w-full items-center justify-between p-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-medium text-primary">
                      {course.code}
                    </span>
                    <span className="text-sm">{course.title}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {course.credits} cr
                    </Badge>
                    {course.level === "graduate" && (
                      <Badge variant="info" className="text-[10px]">
                        Grad
                      </Badge>
                    )}
                  </div>
                  {expandedCourse === course.code ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {expandedCourse === course.code && (
                  <div className="border-t border-border px-4 pb-4 pt-3">
                    <p className="text-sm text-muted-foreground">
                      {course.description}
                    </p>

                    {course.prerequisite_raw && (
                      <div className="mt-3">
                        <span className="text-xs font-medium text-muted-foreground">
                          Prerequisites:{" "}
                        </span>
                        <span className="text-xs">
                          {course.prerequisite_raw}
                        </span>
                      </div>
                    )}

                    {course.corequisite_raw && (
                      <div className="mt-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          Corequisites:{" "}
                        </span>
                        <span className="text-xs">
                          {course.corequisite_raw}
                        </span>
                      </div>
                    )}

                    {course.other_requirement_notes && (
                      <div className="mt-1">
                        <Badge variant="warning" className="text-[10px]">
                          {course.other_requirement_notes}
                        </Badge>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {hasMore && !loading && (
            <div className="mt-4 text-center">
              <button
                onClick={loadMore}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                Show more ({courses.length - visibleCount} remaining)
              </button>
            </div>
          )}

          {!loading && courses.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No courses match your search.
            </div>
          )}
        </div>
      </main>
      </div>
    </div>
  );
}
