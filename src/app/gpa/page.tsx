"use client";

import {
  startTransition,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  Plus,
  Trash2,
  GraduationCap,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Search,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavBar } from "@/components/nav-bar";
import type { ParsedSemester } from "@/lib/transcript-parser";
import {
  type CalendarEvent,
  type SemesterSchedule,
  type CatalogCourse,
  type StudentProfile,
  loadSchedules,
  saveSchedules,
  loadPastSchedules,
  savePastSchedules,
  loadProfile,
  saveProfile,
  onStorageChange,
  generateId,
  getCourseColor,
  CURRENT_YEAR,
  TERM_OPTIONS,
  termLabel,
  GRADE_OPTIONS,
  calculateSemesterGpa,
  calculateCumulativeGpa,
  calculateTotalCredits,
  gpaColor,
  gpaBarWidth,
} from "@/lib/store";

interface ScheduleWithSource extends SemesterSchedule {
  _source: "calendar" | "past";
}

function GpaGauge({ gpa, label }: { gpa: number; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span className={`font-mono text-2xl font-bold ${gpaColor(gpa)}`}>
          {gpa.toFixed(2)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            gpa >= 3.7
              ? "bg-status-met"
              : gpa >= 3.0
                ? "bg-primary"
                : gpa >= 2.0
                  ? "bg-status-missing"
                  : "bg-destructive"
          }`}
          style={{ width: gpaBarWidth(gpa) }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0.00</span>
        <span>1.00</span>
        <span>2.00</span>
        <span>3.00</span>
        <span>4.00</span>
      </div>
    </div>
  );
}

export default function CareerPage() {
  const [calendarSchedules, setCalendarSchedules] = useState<
    SemesterSchedule[]
  >([]);
  const [pastSchedules, setPastSchedules] = useState<SemesterSchedule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "calendar" | "past">(
    "all"
  );

  // Past semester form
  const [showAddPast, setShowAddPast] = useState(false);
  const [pastTerm, setPastTerm] = useState<"fall" | "spring" | "summer">(
    "fall"
  );
  const [pastYear, setPastYear] = useState(CURRENT_YEAR - 1);

  // Transcript import
  const [showImport, setShowImport] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [parsedSemesters, setParsedSemesters] = useState<ParsedSemester[]>([]);
  const [selectedForImport, setSelectedForImport] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [editMajor, setEditMajor] = useState(false);
  const [editMinor, setEditMinor] = useState(false);
  const [majorValue, setMajorValue] = useState("");
  const [minorValue, setMinorValue] = useState("");

  const saveMajor = useCallback(() => {
    const nextProfile = {
      fullName: profile?.fullName ?? "Student",
      major: majorValue.trim() || null,
      minor: profile?.minor ?? null,
    };
    setProfile(nextProfile);
    saveProfile(nextProfile);
    setEditMajor(false);
  }, [majorValue, profile]);

  const saveMinor = useCallback(() => {
    const nextProfile = {
      fullName: profile?.fullName ?? "Student",
      major: profile?.major ?? null,
      minor: minorValue.trim() || null,
    };
    setProfile(nextProfile);
    saveProfile(nextProfile);
    setEditMinor(false);
  }, [minorValue, profile]);

  // Add course to past semester
  const [showAddCourse, setShowAddCourse] = useState<string | null>(null);
  const [newCourseCode, setNewCourseCode] = useState("");
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [newCourseCredits, setNewCourseCredits] = useState("3");
  const [newCourseGrade, setNewCourseGrade] = useState("A");

  // Catalog search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogCourse[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const storedProfile = loadProfile();
    const nextProfile = storedProfile ?? {
      fullName: "Student",
      major: null,
      minor: null,
    };
    startTransition(() => {
      setCalendarSchedules(loadSchedules());
      setPastSchedules(loadPastSchedules());
      setProfile(nextProfile);
      setMajorValue(nextProfile.major ?? "");
      setMinorValue(nextProfile.minor ?? "");
      setLoaded(true);
    });
    if (!storedProfile) saveProfile(nextProfile);
  }, []);

  useEffect(() => {
    return onStorageChange(() => {
      setCalendarSchedules(loadSchedules());
      setPastSchedules(loadPastSchedules());
      const updatedProfile = loadProfile();
      if (updatedProfile) {
        setProfile(updatedProfile);
        setMajorValue(updatedProfile.major ?? "");
        setMinorValue(updatedProfile.minor ?? "");
      }
    });
  }, []);

  useEffect(() => {
    if (loaded) {
      saveSchedules(calendarSchedules);
    }
  }, [calendarSchedules, loaded]);

  useEffect(() => {
    if (loaded) {
      savePastSchedules(pastSchedules);
    }
  }, [pastSchedules, loaded]);

  // Merge and sort all semesters
  const allSchedules = useMemo(() => {
    const all: ScheduleWithSource[] = [
      ...calendarSchedules.map((s) => ({ ...s, _source: "calendar" as const })),
      ...pastSchedules.map((s) => ({ ...s, _source: "past" as const })),
    ];
    const termOrder = { spring: 0, summer: 1, fall: 2 } as const;
    return all.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return termOrder[a.term] - termOrder[b.term];
    });
  }, [calendarSchedules, pastSchedules]);

  const filteredSchedules = useMemo(() => {
    if (activeTab === "calendar")
      return allSchedules.filter((s) => s._source === "calendar");
    if (activeTab === "past")
      return allSchedules.filter((s) => s._source === "past");
    return allSchedules;
  }, [allSchedules, activeTab]);

  useEffect(() => {
    startTransition(() => {
      if (filteredSchedules.length > 0 && !activeId) {
        setActiveId(filteredSchedules[0].id);
      } else if (
        filteredSchedules.length > 0 &&
        !filteredSchedules.find((s) => s.id === activeId)
      ) {
        setActiveId(filteredSchedules[0].id);
      } else if (filteredSchedules.length === 0) {
        setActiveId(null);
      }
    });
  }, [filteredSchedules, activeId]);

  const activeSchedule = useMemo(
    () => allSchedules.find((s) => s.id === activeId) ?? null,
    [allSchedules, activeId]
  );

  // Catalog search — debounce input → query
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 200);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchInput]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      return;
    }
    const controller = new AbortController();
    startTransition(() => setSearching(true));
    fetch(`/api/courses?q=${encodeURIComponent(searchQuery)}&limit=6`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((d) => setSearchResults((d.courses ?? []).slice(0, 6)))
      .catch(() => {})
      .finally(() => setSearching(false));
    return () => controller.abort();
  }, [searchQuery]);

  const selectCatalogCourse = useCallback((course: CatalogCourse) => {
    setNewCourseCode(course.code);
    setNewCourseTitle(course.title);
    setNewCourseCredits(course.credits.toString());
    setSearchOpen(false);
    setSearchInput("");
    setSearchQuery("");
    setSearchResults([]);
  }, []);

  // Add past semester
  const addPastSemester = useCallback(() => {
    const exists = pastSchedules.some(
      (s) => s.term === pastTerm && s.year === pastYear
    );
    if (exists) return;
    const sem: SemesterSchedule = {
      id: generateId(),
      term: pastTerm,
      year: pastYear,
      courses: [],
    };
    setPastSchedules((prev) => [...prev, sem]);
    setShowAddPast(false);
    setActiveId(sem.id);
  }, [pastTerm, pastYear, pastSchedules]);

  // Transcript import handlers
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    setImportError("");
    try {
      const { parseTranscript } = await import("@/lib/transcript-parser");
      const semesters = await parseTranscript(file);
      if (semesters.length === 0) {
        setImportError("No semesters found in transcript.");
      } else {
        setParsedSemesters(semesters);
        setSelectedForImport(new Set(semesters.map((_, i) => i)));
      }
    } catch {
      setImportError("Failed to parse transcript. Please try a different file.");
    } finally {
      setImportLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  const toggleImportSelection = useCallback((index: number) => {
    setSelectedForImport((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleImport = useCallback(async () => {
    const toImport = parsedSemesters.filter((_, i) => selectedForImport.has(i));
    if (toImport.length === 0) return;

    // Fetch catalog to enrich courses with correct titles, credits, prereqs
    const catalogMap: Map<string, CatalogCourse> = new Map();
    try {
      const res = await fetch("/api/courses");
      const data = await res.json();
      for (const c of data.courses ?? []) {
        catalogMap.set(c.code.toUpperCase(), c);
      }
    } catch {}

    const newPast: SemesterSchedule[] = toImport.map((sem) => ({
      id: generateId(),
      term: sem.term,
      year: sem.year,
      courses: sem.courses.map((c) => {
        const catalog = catalogMap.get(c.code.toUpperCase());
        return {
          id: generateId(),
          code: c.code,
          title: catalog?.title || c.title,
          credits: catalog?.credits || c.credits,
          daysOfWeek: [],
          startTime: "",
          endTime: "",
          location: "",
          color: getCourseColor(c.code),
          prerequisite_courses: catalog?.prerequisite_courses ?? [],
          grade: c.grade,
          gradePoints: GRADE_OPTIONS.find((g) => g.letter === c.grade)?.points ?? null,
        };
      }),
    }));

    setPastSchedules((prev) => {
      const existing = new Map(prev.map((s) => [`${s.term}-${s.year}`, s]));
      for (const sem of newPast) {
        const key = `${sem.term}-${sem.year}`;
        if (existing.has(key)) {
          const existingSem = existing.get(key)!;
          const existingCodes = new Set(existingSem.courses.map((c) => c.code));
          const newCourses = sem.courses.filter((c) => !existingCodes.has(c.code));
          existing.set(key, {
            ...existingSem,
            courses: [...existingSem.courses, ...newCourses],
          });
        } else {
          existing.set(key, sem);
        }
      }
      return Array.from(existing.values());
    });

    setShowImport(false);
    setParsedSemesters([]);
    setSelectedForImport(new Set());
  }, [parsedSemesters, selectedForImport]);

  // Add course to past semester
  const addCourse = useCallback(() => {
    if (!showAddCourse || !newCourseCode.trim()) return;
    const credits = parseInt(newCourseCredits) || 3;
    const gradeOpt = GRADE_OPTIONS.find((g) => g.letter === newCourseGrade);
    if (!gradeOpt) return;

    const ev: CalendarEvent = {
      id: generateId(),
      code: newCourseCode.trim().toUpperCase(),
      title: newCourseTitle.trim() || newCourseCode.trim().toUpperCase(),
      credits,
      daysOfWeek: [],
      startTime: "",
      endTime: "",
      location: "",
      color: getCourseColor(newCourseCode.trim()),
      prerequisite_courses: [],
      grade: gradeOpt.letter,
      gradePoints: gradeOpt.points,
    };

    setPastSchedules((prev) =>
      prev.map((s) =>
        s.id === showAddCourse ? { ...s, courses: [...s.courses, ev] } : s
      )
    );
    setNewCourseCode("");
    setNewCourseTitle("");
    setNewCourseCredits("3");
    setNewCourseGrade("A");
    setShowAddCourse(null);
  }, [showAddCourse, newCourseCode, newCourseTitle, newCourseCredits, newCourseGrade]);

  // Update grade on a calendar-synced course
  const updateGrade = useCallback(
    (semesterId: string, courseId: string, grade: string) => {
      const gradeOpt = GRADE_OPTIONS.find((g) => g.letter === grade);
      if (!gradeOpt) return;

      // Try calendar schedules first
      const inCalendar = calendarSchedules.some((s) => s.id === semesterId);
      if (inCalendar) {
        setCalendarSchedules((prev) =>
          prev.map((s) =>
            s.id === semesterId
              ? {
                  ...s,
                  courses: s.courses.map((c) =>
                    c.id === courseId
                      ? { ...c, grade: gradeOpt.letter, gradePoints: gradeOpt.points }
                      : c
                  ),
                }
              : s
          )
        );
      } else {
        setPastSchedules((prev) =>
          prev.map((s) =>
            s.id === semesterId
              ? {
                  ...s,
                  courses: s.courses.map((c) =>
                    c.id === courseId
                      ? { ...c, grade: gradeOpt.letter, gradePoints: gradeOpt.points }
                      : c
                  ),
                }
              : s
          )
        );
      }
    },
    [calendarSchedules]
  );

  // Delete course from past semester
  const deleteCourse = useCallback(
    (semesterId: string, courseId: string) => {
      setPastSchedules((prev) =>
        prev.map((s) =>
          s.id === semesterId
            ? { ...s, courses: s.courses.filter((c) => c.id !== courseId) }
            : s
        )
      );
    },
    []
  );

  // Delete past semester
  const deletePastSemester = useCallback(
    (semesterId: string) => {
      setPastSchedules((prev) => prev.filter((s) => s.id !== semesterId));
      if (activeId === semesterId) setActiveId(null);
    },
    [activeId]
  );

  // Stats
  const cumulativeGpa = useMemo(
    () => calculateCumulativeGpa(allSchedules),
    [allSchedules]
  );
  const totalCredits = useMemo(
    () => calculateTotalCredits(allSchedules),
    [allSchedules]
  );
  const totalCourses = useMemo(
    () => allSchedules.reduce((sum, s) => sum + s.courses.length, 0),
    [allSchedules]
  );
  const activeScheduleGpa = useMemo(
    () =>
      activeSchedule
        ? calculateSemesterGpa(activeSchedule.courses)
        : null,
    [activeSchedule]
  );

  const semesterStats = useMemo(
    () =>
      allSchedules.map((sem) => ({
        id: sem.id,
        label: `${termLabel(sem.term)} ${sem.year}`,
        source: sem._source,
        gpa: calculateSemesterGpa(sem.courses),
        credits: sem.courses.filter(
          (c) =>
            c.grade !== null && !["W", "I"].includes(c.grade)
        ).reduce((sum, c) => sum + c.credits, 0),
        courseCount: sem.courses.length,
      })),
    [allSchedules]
  );

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <NavBar active="/gpa" />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="mx-auto w-full max-w-7xl flex-1 overflow-auto px-6 py-8 sm:px-8">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-[-0.025em] text-foreground">My Career</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Courses, completed credits, and cumulative GPA
            </p>
          </div>

          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6">
              {/* Tab filter */}
              <div className="flex items-center gap-2">
                {(
                  [
                    { key: "all", label: "All semesters" },
                    { key: "calendar", label: "Planned" },
                    { key: "past", label: "Past" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      activeTab === tab.key
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Semester tabs */}
              <div className="flex flex-wrap items-center gap-2">
                {filteredSchedules.map((s) => (
                  <div
                    key={s.id}
                    className="group flex items-center rounded-md bg-card"
                  >
                    <button
                      onClick={() => setActiveId(s.id)}
                      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        activeId === s.id
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      }`}
                    >
                      <span>
                        {termLabel(s.term)} {s.year}
                      </span>
                      {s._source === "past" && (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Past
                        </span>
                      )}
                      <span className="text-xs tabular-nums opacity-60">
                        {s.courses.reduce((sum, course) => sum + course.credits, 0)} cr
                      </span>
                    </button>
                    {s._source === "past" && (
                      <button
                        onClick={() => deletePastSemester(s.id)}
                        className="mr-1 rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        aria-label={`Remove ${termLabel(s.term)} ${s.year}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}

                {activeTab !== "calendar" && (
                  <>
                    {!showAddPast ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setShowAddPast(true)}
                          className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Add past semester</span>
                        </button>
                        <button
                          onClick={() => setShowImport(true)}
                          className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          <span>Import transcript</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 rounded-md bg-muted p-1">
                        <select
                          value={pastTerm}
                          onChange={(e) =>
                            setPastTerm(
                              e.target.value as "fall" | "spring" | "summer"
                            )
                          }
                          className="h-7 rounded border-0 bg-transparent px-2 text-xs text-foreground outline-none"
                        >
                          {TERM_OPTIONS.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => setPastYear((y) => y - 1)}
                            className="rounded p-0.5 text-foreground hover:bg-accent"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-10 text-center text-xs font-medium text-foreground">
                            {pastYear}
                          </span>
                          <button
                            onClick={() => setPastYear((y) => y + 1)}
                            className="rounded p-0.5 text-foreground hover:bg-accent"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <button
                          onClick={addPastSemester}
                          className="rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => setShowAddPast(false)}
                          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Active semester content */}
              {activeSchedule ? (
                <div className="space-y-4">
                  {/* Add course form for past semesters */}
                  {activeSchedule._source === "past" && (
                    <Card>
                      <CardContent className="p-4">
                        {showAddCourse === activeSchedule.id ? (
                          <div className="space-y-3">
                            <div>
                              <button
                                onClick={() => setSearchOpen(!searchOpen)}
                                className="flex w-full items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
                              >
                                <Search className="h-4 w-4" />
                                {searchOpen
                                  ? "Type to search courses..."
                                  : "Search course catalog"}
                              </button>
                              {searchOpen && (
                                <div className="relative mt-1">
                                  <Input
                                    placeholder="e.g. CSC 2302, Data Structures..."
                                    value={searchInput}
                                    onChange={(e) => {
                                      setSearchInput(e.target.value);
                                      setSearchResults([]);
                                    }}
                                    autoFocus
                                  />
                                  {searchResults.length > 0 && (
                                    <div className="absolute z-10 mt-1 w-full rounded-md bg-card ring-1 ring-border/70">
                                      {searchResults.map((c) => (
                                        <button
                                          key={c.code}
                                          onClick={() => selectCatalogCourse(c)}
                                          className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-accent transition-colors first:rounded-t-lg last:rounded-b-lg"
                                        >
                                          <span className="font-mono text-xs font-medium text-primary shrink-0 mt-0.5">
                                            {c.code}
                                          </span>
                                          <div className="min-w-0">
                                            <div className="text-sm truncate">
                                              {c.title}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground">
                                              {c.credits} credits
                                            </div>
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  {searching && (
                                    <div className="mt-1 text-xs text-muted-foreground">
                                      Searching...
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                  Course code
                                </label>
                                <Input
                                  placeholder="e.g. CSC 2302"
                                  value={newCourseCode}
                                  onChange={(e) =>
                                    setNewCourseCode(e.target.value)
                                  }
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                  Credits
                                </label>
                                <Input
                                  type="number"
                                  min="1"
                                  max="6"
                                  value={newCourseCredits}
                                  onChange={(e) =>
                                    setNewCourseCredits(e.target.value)
                                  }
                                />
                              </div>
                            </div>

                            <div>
                              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                Title
                              </label>
                              <Input
                                placeholder="e.g. Data Structures"
                                value={newCourseTitle}
                                onChange={(e) =>
                                  setNewCourseTitle(e.target.value)
                                }
                              />
                            </div>

                            <div>
                              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                Grade
                              </label>
                              <select
                                value={newCourseGrade}
                                onChange={(e) =>
                                  setNewCourseGrade(e.target.value)
                                }
                                className="flex h-9 w-full items-center rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                {GRADE_OPTIONS.map((g) => (
                                  <option key={g.letter} value={g.letter}>
                                    {g.letter}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="flex justify-end gap-2 pt-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setShowAddCourse(null);
                                  setSearchOpen(false);
                                  setSearchInput("");
                                  setSearchQuery("");
                                  setSearchResults([]);
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={addCourse}
                                disabled={!newCourseCode.trim()}
                              >
                                Add course
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setShowAddCourse(activeSchedule.id);
                              setNewCourseCode("");
                              setNewCourseTitle("");
                              setNewCourseCredits("3");
                              setNewCourseGrade("A");
                            }}
                            className="flex w-full items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
                          >
                            <Plus className="h-4 w-4" />
                            Add course
                          </button>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Course list */}
                  <div className="divide-y divide-border/60 overflow-hidden rounded-lg bg-card">
                    {activeSchedule.courses.length === 0 && (
                      <div className="py-12 text-center">
                        <BookOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">
                          {activeSchedule._source === "past"
                            ? "No courses yet. Add one above."
                            : "No courses in this semester."}
                        </p>
                      </div>
                    )}
                    {activeSchedule.courses.map((course) => (
                      <div
                        key={course.id}
                        className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-accent/30"
                      >
                        <div
                          className="h-2.5 w-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: getCourseColor(course.code) }}
                        />
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-sm font-medium text-primary">
                            {course.code}
                          </span>
                          <span className="ml-2 text-sm text-muted-foreground truncate">
                            {course.title}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {course.credits} cr
                        </span>
                        <select
                          value={course.grade ?? ""}
                          onChange={(e) =>
                            updateGrade(
                              activeSchedule.id,
                              course.id,
                              e.target.value
                            )
                          }
                          className="h-8 w-16 rounded border border-input bg-transparent px-1 text-center text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="">—</option>
                          {GRADE_OPTIONS.map((g) => (
                            <option key={g.letter} value={g.letter}>
                              {g.letter}
                            </option>
                          ))}
                        </select>
                        <span className="min-w-[50px] text-right font-mono text-sm text-muted-foreground">
                          {course.gradePoints !== null
                            ? `${course.gradePoints.toFixed(2)}`
                            : "\u2014"}
                        </span>
                        {activeSchedule._source === "past" && (
                          <button
                            onClick={() =>
                              deleteCourse(activeSchedule.id, course.id)
                            }
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {activeSchedule.courses.length > 0 && (
                    <div className="flex items-center justify-between border-y border-border/60 px-1 py-3">
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>
                          {activeSchedule.courses.length} course
                          {activeSchedule.courses.length !== 1 ? "s" : ""}
                        </span>
                        <span>
                          {activeSchedule.courses.reduce(
                            (sum, c) => sum + c.credits,
                            0
                          )}{" "}
                          total credits
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground">
                          Semester GPA
                        </span>
                        <span
                          className={`ml-2 font-mono text-lg font-bold ${
                            activeScheduleGpa !== null
                              ? gpaColor(activeScheduleGpa)
                              : "text-muted-foreground"
                          }`}
                        >
                          {activeScheduleGpa !== null
                            ? activeScheduleGpa.toFixed(2)
                            : "\u2014"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-20 text-center">
                  <GraduationCap className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    {allSchedules.length === 0
                      ? "No semesters yet. Add a past semester or plan courses in the Schedule tab."
                      : "Select a semester to view courses."}
                  </p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
              {/* Personal Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Personal Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Name</span>
                    <p className="text-sm font-medium text-foreground">{profile?.fullName ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Major</span>
                    {editMajor ? (
                      <div className="mt-1 flex items-center gap-1.5">
                        <Input
                          value={majorValue}
                          onChange={(e) => setMajorValue(e.target.value)}
                          placeholder="e.g. Computer Science"
                          className="h-7 text-xs"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter") saveMajor(); if (e.key === "Escape") { setEditMajor(false); setMajorValue(profile?.major ?? ""); }}}
                        />
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={saveMajor}>Save</Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditMajor(true); setMajorValue(profile?.major ?? ""); }}
                        className="mt-0.5 block w-full text-left text-sm text-foreground transition-colors hover:text-primary"
                      >
                        {profile?.major || <span className="text-muted-foreground italic">Click to add</span>}
                      </button>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Minor</span>
                    {editMinor ? (
                      <div className="mt-1 flex items-center gap-1.5">
                        <Input
                          value={minorValue}
                          onChange={(e) => setMinorValue(e.target.value)}
                          placeholder="e.g. Mathematics"
                          className="h-7 text-xs"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter") saveMinor(); if (e.key === "Escape") { setEditMinor(false); setMinorValue(profile?.minor ?? ""); }}}
                        />
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={saveMinor}>Save</Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditMinor(true); setMinorValue(profile?.minor ?? ""); }}
                        className="mt-0.5 block w-full text-left text-sm text-foreground transition-colors hover:text-primary"
                      >
                        {profile?.minor || <span className="text-muted-foreground italic">Click to add</span>}
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Career Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <GpaGauge gpa={cumulativeGpa} label="Cumulative GPA" />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs text-muted-foreground">
                        Total Credits
                      </span>
                      <p className="font-mono text-lg font-semibold">
                        {totalCredits}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">
                        Total Courses
                      </span>
                      <p className="font-mono text-lg font-semibold">
                        {totalCourses}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-border pt-3">
                    <span className="text-xs text-muted-foreground">
                      Classification
                    </span>
                    <p className="text-sm font-medium">
                      {totalCredits >= 90
                        ? "Senior"
                        : totalCredits >= 60
                          ? "Junior"
                          : totalCredits >= 30
                            ? "Sophomore"
                            : "Freshman"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    AUI Grading Scale
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {GRADE_OPTIONS.filter((g) => g.points !== null).map((g) => (
                      <div
                        key={g.letter}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="font-mono font-medium">
                          {g.letter}
                        </span>
                        <span className="text-muted-foreground">
                          {g.points.toFixed(2)} pts
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 border-t border-border pt-2 text-[10px] text-muted-foreground">
                    W, I, P excluded from GPA calculation
                  </div>
                </CardContent>
              </Card>

              {semesterStats.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      By Semester
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {semesterStats.map((stat) => (
                        <div
                          key={stat.id}
                          className="flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">
                              {stat.label}
                            </span>
                            {stat.source === "past" && (
                              <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                                past
                              </span>
                            )}
                          </div>
                          <span className="flex items-center gap-2">
                            <span className="text-muted-foreground">
                              {stat.credits} cr
                            </span>
                            <span
                              className={`font-mono font-medium ${
                                stat.gpa !== null
                                  ? gpaColor(stat.gpa)
                                  : "text-muted-foreground"
                              }`}
                            >
                              {stat.gpa !== null ? stat.gpa.toFixed(2) : "\u2014"}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Transcript Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45">
          <div className="mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border/70 bg-card shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold">Import Transcript</h2>
              <button
                onClick={() => { setShowImport(false); setParsedSemesters([]); setSelectedForImport(new Set()); }}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <span className="text-lg">&times;</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {parsedSemesters.length === 0 && !importLoading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Upload className="mb-4 h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Upload your unofficial transcript (PDF)
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importLoading}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    {importLoading ? "Parsing..." : "Choose PDF file"}
                  </button>
                  {importError && (
                    <p className="mt-3 text-sm text-destructive">{importError}</p>
                  )}
                </div>
              )}

              {importLoading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
                  <p className="text-sm text-muted-foreground">Reading transcript...</p>
                </div>
              )}

              {parsedSemesters.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Found {parsedSemesters.reduce((sum, s) => sum + s.courses.length, 0)} courses across {parsedSemesters.length} semesters
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedForImport(new Set(parsedSemesters.map((_, i) => i)))}
                        className="text-xs text-primary hover:underline"
                      >
                        Select all
                      </button>
                      <button
                        onClick={() => setSelectedForImport(new Set())}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        Deselect all
                      </button>
                    </div>
                  </div>

                  {parsedSemesters.map((sem, semIdx) => (
                    <div key={semIdx} className="overflow-hidden rounded-md bg-card ring-1 ring-border/60">
                      <button
                        onClick={() => toggleImportSelection(semIdx)}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          selectedForImport.has(semIdx) ? "bg-accent/60" : "bg-transparent"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedForImport.has(semIdx)}
                          onChange={() => toggleImportSelection(semIdx)}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="text-sm font-medium text-foreground">
                          {sem.year} {sem.term.charAt(0).toUpperCase() + sem.term.slice(1)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {sem.courses.length} courses
                        </span>
                      </button>

                      {selectedForImport.has(semIdx) && (
                        <div className="border-t border-border">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="px-4 py-1.5 text-left font-medium">Code</th>
                                <th className="px-4 py-1.5 text-left font-medium">Title</th>
                                <th className="px-4 py-1.5 text-center font-medium">Cr</th>
                                <th className="px-4 py-1.5 text-center font-medium">Grade</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sem.courses.map((c, cIdx) => (
                                <tr key={cIdx} className="border-t border-border/50">
                                  <td className="px-4 py-1.5 font-mono font-medium text-foreground">{c.code}</td>
                                  <td className="px-4 py-1.5 text-muted-foreground">{c.title}</td>
                                  <td className="px-4 py-1.5 text-center text-foreground">{c.credits}</td>
                                  <td className="px-4 py-1.5 text-center font-medium text-foreground">{c.grade}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {parsedSemesters.length > 0 && (
              <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowImport(false); setParsedSemesters([]); setSelectedForImport(new Set()); }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleImport}
                  disabled={selectedForImport.size === 0}
                >
                  Import {selectedForImport.size} semester{selectedForImport.size !== 1 ? "s" : ""}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
