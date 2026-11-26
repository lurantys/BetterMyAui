"use client";

import { CourseAutocompleteInput } from "@/components/course-autocomplete-input";
import { ConcealedGpa, GpaToggle } from "@/components/gpa-visibility";
import { StyledSelect } from "@/components/ui/styled-select";
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
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavBar } from "@/components/nav-bar";
import { ProgramSelect } from "@/components/program-select";
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
  getSemesterStatus,
  GRADE_OPTIONS,
  calculateSemesterGpa,
  calculateCumulativeGpa,
  calculateTotalCredits,
  gpaColor,
  gpaBarWidth,
} from "@/lib/store";

const gradeChoices = GRADE_OPTIONS.map(({ letter }) => ({ value: letter, label: letter }));

interface ScheduleWithSource extends SemesterSchedule {
  _source: "calendar" | "past";
}

function getTranscriptCourseCredits(code: string, catalogCredits?: number): number {
  const match = code.match(/^[A-Z]{2,5}\s*\d(\d)/i);
  const encodedCredits = match ? Number.parseInt(match[1], 10) : 0;
  return encodedCredits > 0 ? encodedCredits : (catalogCredits && catalogCredits > 0 ? catalogCredits : 3);
}

function GpaGauge({ gpa, revealed, onToggle }: { gpa: number; revealed: boolean; onToggle: () => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Cumulative GPA</span>
        <div className="flex items-center gap-1">
          <ConcealedGpa revealed={revealed} value={gpa.toFixed(2)} className={`type-display text-2xl ${revealed ? gpaColor(gpa) : ""}`} />
          <GpaToggle revealed={revealed} onToggle={onToggle} />
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary" aria-hidden="true">
        <div
          className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${
            !revealed ? "bg-transparent" : gpa >= 3.7
              ? "bg-status-met"
              : gpa >= 3.0
                ? "bg-primary"
                : gpa >= 2.0
                  ? "bg-status-missing"
                  : "bg-destructive"
          }`}
          style={{ width: revealed ? gpaBarWidth(gpa) : 0 }}
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

  const [showGpa, setShowGpa] = useState(false);
  const [semesterKind, setSemesterKind] = useState<"past" | "planned" | "">("");
  const [showAddSemester, setShowAddSemester] = useState(false);
  const [semesterTerm, setSemesterTerm] = useState<SemesterSchedule["term"]>("fall");
  const [semesterYear, setSemesterYear] = useState(CURRENT_YEAR);
  const [semesterError, setSemesterError] = useState("");

  // Transcript import
  const [showImport, setShowImport] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [parsedSemesters, setParsedSemesters] = useState<ParsedSemester[]>([]);
  const [selectedForImport, setSelectedForImport] = useState<Set<number>>(new Set());
  const [importMajor, setImportMajor] = useState("");
  const [importMinor, setImportMinor] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importDialogRef = useRef<HTMLDivElement>(null);
  const importTriggerRef = useRef<HTMLButtonElement>(null);

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  function saveProgram(kind: "major" | "minor", value: string) {
    const nextProfile: StudentProfile = {
      fullName: profile?.fullName ?? "Student",
      major: profile?.major ?? null,
      minor: profile?.minor ?? null,
      specialization: kind === "minor" || value === profile?.major ? profile?.specialization : undefined,
      [kind]: value || null,
    };
    setProfile(nextProfile);
    saveProfile(nextProfile);
  }
  // Add course to past semester
  const [showAddCourse, setShowAddCourse] = useState<string | null>(null);
  const [newCourseCode, setNewCourseCode] = useState("");
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [newCourseCredits, setNewCourseCredits] = useState("3");
  const [newCourseGrade, setNewCourseGrade] = useState("A");

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

  useEffect(() => {
    if (!showImport) {
      importTriggerRef.current?.focus();
      return;
    }

    const dialog = importDialogRef.current;
    const initialFocus = parsedSemesters.length > 0
      ? dialog?.querySelector<HTMLButtonElement>("#transcript-major")
      : dialog?.querySelector<HTMLButtonElement>('[aria-label="Close transcript import"]');
    initialFocus?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowImport(false);
        setParsedSemesters([]);
        setSelectedForImport(new Set());
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])')
      ).filter((element) => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [parsedSemesters.length, showImport]);

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

  const selectCatalogCourse = useCallback((course: CatalogCourse) => {
    setNewCourseCode(course.code);
    setNewCourseTitle(course.title);
    setNewCourseCredits(course.credits.toString());
  }, []);

  function selectSemesterKind(kind: typeof semesterKind) {
    setSemesterKind(kind);
    setSemesterError("");
    const terms = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].flatMap((year) =>
      (["spring", "summer", "fall"] as const).map((term) => ({ year, term })));
    const eligible = terms.filter(({ term, year }) => getSemesterStatus(term, year) === kind
      && !allSchedules.some((semester) => semester.term === term && semester.year === year));
    const suggestion = kind === "past" ? eligible.at(-1) : eligible[0];
    if (suggestion) {
      setSemesterTerm(suggestion.term);
      setSemesterYear(suggestion.year);
    }
  }

  function addSemester(event: React.FormEvent) {
    event.preventDefault();
    if (!semesterKind || getSemesterStatus(semesterTerm, semesterYear) !== semesterKind) {
      setSemesterError(semesterKind === "past" ? "Choose a past semester." : "Choose a future semester.");
      return;
    }
    if (allSchedules.some(({ term, year }) => term === semesterTerm && year === semesterYear)) {
      setSemesterError("That semester is already in Career.");
      return;
    }
    const semester: SemesterSchedule = { id: generateId(), term: semesterTerm, year: semesterYear, courses: [] };
    const updateSchedules = semesterKind === "past" ? setPastSchedules : setCalendarSchedules;
    updateSchedules((previous) => [...previous, semester]);
    if (activeTab !== "all") setActiveTab(semesterKind === "past" ? "past" : "calendar");
    setActiveId(semester.id);
    setShowAddSemester(false);
    setSemesterError("");
  }

  function deletePlannedSemester(semester: SemesterSchedule) {
    if (getSemesterStatus(semester.term, semester.year) !== "planned") return;
    if (semester.courses.length && !window.confirm(`Remove ${termLabel(semester.term)} ${semester.year} and its planned courses from Career and Schedule?`)) return;
    setCalendarSchedules((previous) => previous.filter(({ id }) => id !== semester.id));
    if (activeId === semester.id) setActiveId(null);
  }

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
    const major = importMajor.trim();
    if (toImport.length === 0 || !major) return;

    // Fetch catalog to enrich courses with correct titles, credits, prereqs
    const catalogMap: Map<string, CatalogCourse> = new Map();
    try {
      const res = await fetch("/api/courses");
      const data = await res.json();
      for (const c of data.courses ?? []) {
        catalogMap.set(c.code.toUpperCase().replace(/\s+/g, ""), c);
      }
    } catch {}

    const importedCourses = (sem: ParsedSemester) => sem.courses.map((c) => {
      const catalog = catalogMap.get(c.code.toUpperCase().replace(/\s+/g, ""));
      return {
        id: generateId(),
        code: c.code,
        title: catalog?.title || c.title,
        transcriptTitle: c.title,
        credits: /-L$/i.test(c.code) || c.grade === "NG" || /exchange program/i.test(c.title)
          ? 0
          : getTranscriptCourseCredits(c.code, catalog?.credits),
        daysOfWeek: [],
        startTime: "",
        endTime: "",
        location: "",
        color: getCourseColor(c.code),
        prerequisite_courses: catalog?.prerequisite_courses ?? [],
        grade: c.grade === "WIP" ? null : c.grade,
        gradePoints: c.grade === "WIP" ? null : (GRADE_OPTIONS.find((g) => g.letter === c.grade)?.points ?? null),
      };
    });

    const mergeSchedules = (prev: SemesterSchedule[], incoming: SemesterSchedule[]) => {
      const existing = new Map(prev.map((s) => [`${s.term}-${s.year}`, s]));
      for (const sem of incoming) {
        const key = `${sem.term}-${sem.year}`;
        const current = existing.get(key);
        if (!current) existing.set(key, sem);
        else {
          const codeKey = (code: string) => code.replace(/\s+/g, "").toUpperCase();
          const incomingByCode = new Map(sem.courses.map((course) => [codeKey(course.code), course]));
          const codes = new Set(current.courses.map((course) => codeKey(course.code)));
          const updated = current.courses.map((course) => {
            const transcriptTitle = incomingByCode.get(codeKey(course.code))?.transcriptTitle;
            return transcriptTitle ? { ...course, transcriptTitle } : course;
          });
          existing.set(key, { ...current, courses: [...updated, ...sem.courses.filter((course) => !codes.has(codeKey(course.code)))] });
        }
      }
      return Array.from(existing.values());
    };

    const newPast: SemesterSchedule[] = [];
    const newCalendar: SemesterSchedule[] = [];
    for (const sem of toImport) {
      const courses = importedCourses(sem);
      const completed = courses.filter((c) => c.grade !== null);
      const inProgress = courses.filter((c) => c.grade === null);
      if (completed.length) newPast.push({ id: generateId(), term: sem.term, year: sem.year, courses: completed });
      if (inProgress.length) newCalendar.push({ id: generateId(), term: sem.term, year: sem.year, courses: inProgress });
    }

    if (newPast.length) setPastSchedules((prev) => mergeSchedules(prev, newPast));
    if (newCalendar.length) setCalendarSchedules((prev) => mergeSchedules(prev, newCalendar));

    const nextProfile = {
      fullName: profile?.fullName ?? "Student",
      major,
      minor: importMinor.trim() || null,
      specialization: major === profile?.major ? profile?.specialization : undefined,
    };
    setProfile(nextProfile);


    saveProfile(nextProfile);

    setShowImport(false);
    setParsedSemesters([]);
    setSelectedForImport(new Set());
  }, [importMajor, importMinor, parsedSemesters, profile, selectedForImport]);

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
  const completedSchedules = allSchedules.filter(
    (semester) => semester._source === "past" || getSemesterStatus(semester.term, semester.year) === "past"
  );
  const cumulativeGpa = useMemo(
    () => calculateCumulativeGpa(completedSchedules),
    [completedSchedules]
  );
  const earnedCredits = calculateTotalCredits(completedSchedules.map(({ courses }) => ({
    courses: courses.filter(({ grade }) =>
      grade && !["F", "W", "I", "NG", "WIP"].includes(grade.toUpperCase())
    ),
  })));
  const attemptingCredits = allSchedules
    .filter(({ term, year }) => getSemesterStatus(term, year) === "current")
    .flatMap(({ courses }) => courses)
    .reduce((sum, { grade, credits }) =>
      sum + (grade?.toUpperCase() === "W" || grade?.toUpperCase() === "I" ? 0 : credits), 0);
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
        status: getSemesterStatus(sem.term, sem.year),
        gpa: calculateSemesterGpa(sem.courses),
        credits: sem.courses.filter((c) =>
          getSemesterStatus(sem.term, sem.year) === "current"
            ? !["W", "I"].includes(c.grade ?? "")
            : sem._source === "calendar"
              ? c.grade === null
              : c.grade !== null && !["W", "I"].includes(c.grade)
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
    <div className="mobile-app-shell flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <NavBar active="/gpa" />

        <main className="motion-page flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="mx-auto w-full max-w-7xl flex-1 overflow-auto px-3 py-5 sm:px-8 sm:py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-[-0.025em] text-foreground">My Career</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Courses, completed credits, and cumulative GPA
            </p>
          </div>

          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-6">
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
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {getSemesterStatus(s.term, s.year) === "current"
                          ? "Current"
                          : s._source === "past" || getSemesterStatus(s.term, s.year) === "past"
                            ? "Past"
                            : "Planned"}
                      </span>
                      <span className="text-xs tabular-nums opacity-60">
                        {s.courses.reduce((sum, course) => sum + course.credits, 0)} cr
                      </span>
                    </button>
                    {(s._source === "past" || getSemesterStatus(s.term, s.year) === "planned") && (
                      <button
                        onClick={() => s._source === "past" ? deletePastSemester(s.id) : deletePlannedSemester(s)}
                        className="mr-1 rounded p-1 text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100 md:opacity-0"
                        aria-label={`Remove ${termLabel(s.term)} ${s.year}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}

                <Button type="button" size="icon" variant="ghost" className="text-muted-foreground"
                  aria-label="Add semester" title="Add semester" aria-expanded={showAddSemester} aria-controls="add-semester"
                  onClick={() => {
                    if (!showAddSemester) selectSemesterKind("");
                    setShowAddSemester(!showAddSemester);
                  }}>
                  <Plus className="size-4" aria-hidden="true" />
                </Button>

                {activeTab !== "calendar" && <button
                  ref={importTriggerRef}
                  onClick={() => {
                    setImportMajor(profile?.major ?? "");
                    setImportMinor(profile?.minor ?? "");
                    setImportError("");
                    setShowImport(true);
                  }}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Upload className="size-3.5" aria-hidden="true" />
                  Import transcript
                </button>}
              </div>

              {showAddSemester && <form id="add-semester" onSubmit={addSemester} className="motion-enter flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-3">
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  Semester type
                  <StyledSelect label="Semester type" value={semesterKind} required placeholder="Choose type"
                    options={[{ value: "past", label: "Past" }, { value: "planned", label: "Planned" }]}
                    onValueChange={(value) => selectSemesterKind(value as typeof semesterKind)} />
                </label>
                {semesterKind && <>
                  <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                    Term
                    <StyledSelect label="Term" value={semesterTerm} options={TERM_OPTIONS}
                      onValueChange={(value) => setSemesterTerm(value as SemesterSchedule["term"])} />
                  </label>
                  <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                    Year
                    <Input className="w-24 text-foreground" type="number" min={1990} max={2100} required value={semesterYear || ""}
                      onChange={(event) => setSemesterYear(Number(event.target.value))} />
                  </label>
                  <Button type="submit" variant="outline">Add</Button>
                </>}
                <Button type="button" variant="ghost" className="text-muted-foreground" onClick={() => setShowAddSemester(false)}>Cancel</Button>
                {semesterError && <p role="alert" className="w-full text-xs text-destructive">{semesterError}</p>}
              </form>}

              {/* Active semester content */}
              {activeSchedule ? (
                <div key={activeSchedule.id} className="motion-enter space-y-4">
                  {/* Add course form for past semesters */}
                  {activeSchedule._source === "past" && (
                    <Card>
                      <CardContent className="p-4">
                        {showAddCourse === activeSchedule.id ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label htmlFor="career-course-code" className="mb-1 block text-xs font-medium text-muted-foreground">
                                  Course code
                                </label>
                                <CourseAutocompleteInput id="career-course-code" value={newCourseCode}
                                  placeholder="Search by code or title" onChange={setNewCourseCode} onSelect={selectCatalogCourse} />
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
                              <label htmlFor="career-course-title" className="mb-1 block text-xs font-medium text-muted-foreground">
                                Title
                              </label>
                              <CourseAutocompleteInput
                                id="career-course-title"
                                placeholder="e.g. Data Structures"
                                value={newCourseTitle}
                                onChange={setNewCourseTitle}
                                onSelect={selectCatalogCourse}
                              />
                            </div>

                            <div>
                              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                Grade
                              </label>
                              <StyledSelect label="Grade" value={newCourseGrade} options={gradeChoices} onValueChange={setNewCourseGrade} />
                            </div>

                            <div className="flex justify-end gap-2 pt-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowAddCourse(null)}
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
                        className="flex items-center gap-2 px-3 py-3.5 transition-colors hover:bg-accent/30 sm:gap-3 sm:px-5"
                      >
                        <div
                          className="h-2.5 w-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: getCourseColor(course.code) }}
                        />
                        <div className="min-w-0 flex-1">
                          <span className="font-sans text-sm font-medium text-primary">
                            {course.code}
                          </span>
                          <span className="block break-words text-xs text-muted-foreground sm:ml-2 sm:inline sm:text-sm">
                            {course.title}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {course.credits} cr
                        </span>
                        <StyledSelect label={`Grade for ${course.code}`} value={course.grade ?? ""}
                          options={[{ value: "", label: "—" }, ...gradeChoices]} compact
                          className="w-14 shrink-0 sm:w-16" triggerClassName="sm:h-8"
                          onValueChange={(value) => updateGrade(activeSchedule.id, course.id, value)} />
                        <span className="min-w-8 text-right font-mono text-xs text-muted-foreground sm:min-w-[50px] sm:text-sm">
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
                      <div className="ml-auto flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Semester GPA</span>
                        <ConcealedGpa revealed={showGpa} value={activeScheduleGpa?.toFixed(2) ?? "—"}
                          className={`type-display text-lg ${showGpa && activeScheduleGpa !== null ? gpaColor(activeScheduleGpa) : ""}`} />
                        <GpaToggle revealed={showGpa} onToggle={() => setShowGpa((shown) => !shown)} />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-20 text-center">
                  <GraduationCap className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    {allSchedules.length === 0
                      ? "No semesters yet."
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
                  <div className="space-y-1.5">
                    <label htmlFor="career-major" className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Major</label>
                    <ProgramSelect id="career-major" kind="major" value={profile?.major ?? ""} onValueChange={(value) => saveProgram("major", value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="career-minor" className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Minor</label>
                    <ProgramSelect id="career-minor" kind="minor" value={profile?.minor ?? ""} onValueChange={(value) => saveProgram("minor", value)} />
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
                  <GpaGauge gpa={cumulativeGpa} revealed={showGpa} onToggle={() => setShowGpa((shown) => !shown)} />
                  <dl className="divide-y divide-border border-t border-border">
                    {[
                      ["Total Credits Earned", earnedCredits],
                      ["Total Credits Attempting", attemptingCredits],
                      ["Total Courses", totalCourses],
                    ].map(([label, total]) => (
                      <div key={label} className="flex items-center justify-between gap-3 py-2 last:pb-0">
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="type-display text-base tabular-nums">{total}</dd>
                      </div>
                    ))}
                  </dl>
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
                            {(stat.status === "current" || stat.source === "past" || stat.status === "past") && (
                              <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                                {stat.status === "current" ? "current" : "past"}
                              </span>
                            )}
                          </div>
                          <span className="flex items-center gap-2">
                            <span className="text-muted-foreground">
                              {stat.credits} cr
                            </span>
                            <ConcealedGpa revealed={showGpa} value={stat.gpa?.toFixed(2) ?? "—"}
                              className={`min-w-8 text-right font-mono font-medium ${showGpa && stat.gpa !== null ? gpaColor(stat.gpa) : ""}`} />
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
        <div className="motion-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/45">
          <div ref={importDialogRef} role="dialog" aria-modal="true" aria-labelledby="transcript-import-title" className="motion-dialog mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border/70 bg-card shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 id="transcript-import-title" className="text-lg font-semibold">Import Transcript</h2>
              <button
                onClick={() => { setShowImport(false); setParsedSemesters([]); setSelectedForImport(new Set()); }}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Close transcript import"
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
                  <section aria-labelledby="transcript-program-title" className="rounded-md border border-border/70 p-4">
                    <h3 id="transcript-program-title" className="text-sm font-medium text-foreground">Program information</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Used to tailor degree planning and saved to My Career.</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label htmlFor="transcript-major" className="text-sm font-medium text-foreground">Major <span className="text-destructive">Required</span></label>
                        <ProgramSelect id="transcript-major" kind="major" value={importMajor} onValueChange={setImportMajor} required />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="transcript-minor" className="text-sm font-medium text-foreground">Minor <span className="text-muted-foreground">Optional</span></label>
                        <ProgramSelect id="transcript-minor" kind="minor" value={importMinor} onValueChange={setImportMinor} />
                      </div>
                    </div>
                  </section>

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
                                  <td className="px-4 py-1.5 font-sans font-medium text-foreground">{c.code}</td>
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
                  disabled={selectedForImport.size === 0 || !importMajor.trim()}
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
