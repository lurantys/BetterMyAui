"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  CalendarDays,
  BookOpen,
  LayoutGrid,
  Info,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import dynamic from "next/dynamic";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavBar } from "@/components/nav-bar";

const FullCalendarWrapper = dynamic(
  () => import("@/components/full-calendar-wrapper"),
  { ssr: false }
);

import {
  type CalendarEvent,
  type SemesterSchedule,
  type CatalogCourse,
  loadSchedules,
  saveSchedules,
  loadPastSchedules,
  onStorageChange,
  generateId,
  getCourseColor,
  CURRENT_YEAR,
  TERM_OPTIONS,
  termLabel,
  sortSemestersChronologically,
} from "@/lib/store";

const DAY_MAP: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
};
const DAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
];

const TIME_SLOTS = [
  "08:00", "08:10", "08:20", "08:30", "08:40", "08:50",
  "09:00", "09:10", "09:20", "09:30", "09:40", "09:50",
  "10:00", "10:10", "10:20", "10:30", "10:40", "10:50",
  "11:00", "11:10", "11:20", "11:30", "11:40", "11:50",
  "12:00", "12:10", "12:20", "12:30", "12:40", "12:50",
  "13:00", "13:10", "13:20", "13:30", "13:40", "13:50",
  "14:00", "14:10", "14:20", "14:30", "14:40", "14:50",
  "15:00", "15:10", "15:20", "15:30", "15:40", "15:50",
  "16:00", "16:10", "16:20", "16:30", "16:40", "16:50",
  "17:00", "17:10", "17:20", "17:30", "17:40", "17:50",
  "18:00", "18:10", "18:20", "18:30", "18:40", "18:50",
  "19:00", "19:10", "19:20", "19:30", "19:40", "19:50",
  "20:00",
];

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatTime12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

function eventsToCalendar(
  events: CalendarEvent[],
  prereqStatus?: Map<string, string[]>
) {
  return events.map((e) => ({
    id: e.id,
    title: `${e.code} — ${e.title}`,
    daysOfWeek: e.daysOfWeek,
    startTime: e.startTime,
    endTime: e.endTime,
    color: e.color,
    extendedProps: {
      code: e.code,
      courseTitle: e.title,
      credits: e.credits,
      location: e.location,
      hasUnmetPrereqs: prereqStatus?.has(e.id) ?? false,
      unmetPrereqs: prereqStatus?.get(e.id) ?? [],
    },
  }));
}

interface EventForm {
  code: string;
  title: string;
  credits: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  location: string;
  prerequisite_courses: string[];
}

const EMPTY_FORM: EventForm = {
  code: "",
  title: "",
  credits: "3",
  daysOfWeek: [1, 3],
  startTime: "09:00",
  endTime: "10:15",
  location: "",
  prerequisite_courses: [],
};

export default function CalendarPage() {
  const [schedules, setSchedules] = useState<SemesterSchedule[]>([]);
  const [pastSchedules, setPastSchedules] = useState<SemesterSchedule[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailEventId, setDetailEventId] = useState<string | null>(null);

  // Catalog search in left panel
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogCourse[]>([]);
  const [searching, setSearching] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Load from localStorage, then sync from Supabase
  useEffect(() => {
    const stored = loadSchedules();
    if (stored.length > 0) {
      setSchedules(stored);
      setActiveId(stored[0].id);
    }
    setPastSchedules(loadPastSchedules());
    setLoaded(true);

    // Background sync from Supabase
    setSyncing(true);
    import("@/lib/store").then(({ syncFromSupabase }) => {
      syncFromSupabase().then(() => {
        const updated = loadSchedules();
        if (updated.length > 0) {
          setSchedules(updated);
          setActiveId((prev) => {
            if (prev && updated.some((s) => s.id === prev)) return prev;
            return updated[0].id;
          });
        }
        setPastSchedules(loadPastSchedules());
        setSyncing(false);
      }).catch(() => setSyncing(false));
    });
  }, []);

  useEffect(() => {
    return onStorageChange(() => {
      setSchedules(loadSchedules());
    });
  }, []);

  useEffect(() => {
    if (loaded) {
      saveSchedules(schedules);
      import("@/lib/store").then(({ syncSchedulesToSupabase }) => {
        syncSchedulesToSupabase(schedules);
      });
    }
  }, [schedules, loaded]);

  const activeSchedule = schedules.find((s) => s.id === activeId) ?? null;

  // Semester CRUD
  const addSemester = useCallback(
    (term: "fall" | "spring" | "summer", year: number) => {
      const exists = schedules.some((s) => s.term === term && s.year === year);
      if (exists) return;
      const sem: SemesterSchedule = {
        id: generateId(),
        term,
        year,
        courses: [],
      };
      setSchedules((prev) => [...prev, sem]);
      setActiveId(sem.id);
    },
    [schedules]
  );

  const removeSemester = useCallback(
    (id: string) => {
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      setActiveId((prev) => {
        if (prev !== id) return prev;
        const remaining = schedules.filter((s) => s.id !== id);
        return remaining.length > 0 ? remaining[0].id : null;
      });
    },
    [schedules]
  );

  const updateCourses = useCallback(
    (courses: CalendarEvent[]) => {
      if (!activeId) return;
      setSchedules((prev) =>
        prev.map((s) => (s.id === activeId ? { ...s, courses } : s))
      );
    },
    [activeId]
  );

  // Modal for custom events
  const openAddModal = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setShowModal(true);
  }, []);

  const openEditModal = useCallback(
    (eventId: string) => {
      if (!activeSchedule) return;
      const ev = activeSchedule.courses.find((e) => e.id === eventId);
      if (!ev) return;
      setEditingId(eventId);
      setForm({
        code: ev.code,
        title: ev.title,
        credits: ev.credits.toString(),
        daysOfWeek: [...ev.daysOfWeek],
        startTime: ev.startTime,
        endTime: ev.endTime,
        location: ev.location,
        prerequisite_courses: ev.prerequisite_courses ?? [],
      });
      setErrors({});
      setShowModal(true);
    },
    [activeSchedule]
  );

  const validate = useCallback((f: EventForm): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!f.code.trim()) errs.code = "Required";
    if (!f.title.trim()) errs.title = "Required";
    if (f.daysOfWeek.length === 0) errs.days = "Select at least one day";
    if (timeToMinutes(f.endTime) <= timeToMinutes(f.startTime))
      errs.time = "End must be after start";
    return errs;
  }, []);

  const handleSave = useCallback(() => {
    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    const ev: CalendarEvent = {
      id: editingId || generateId(),
      code: form.code.trim().toUpperCase(),
      title: form.title.trim(),
      credits: parseInt(form.credits) || 3,
      daysOfWeek: form.daysOfWeek.sort(),
      startTime: form.startTime,
      endTime: form.endTime,
      location: form.location.trim(),
      color: getCourseColor(form.code.trim()),
      prerequisite_courses: form.prerequisite_courses,
      grade: editingId
        ? (activeSchedule?.courses.find((e) => e.id === editingId)?.grade ?? null)
        : null,
      gradePoints: editingId
        ? (activeSchedule?.courses.find((e) => e.id === editingId)?.gradePoints ?? null)
        : null,
    };

    if (editingId && activeSchedule) {
      updateCourses(
        activeSchedule.courses.map((e) => (e.id === editingId ? ev : e))
      );
    } else if (activeSchedule) {
      updateCourses([...activeSchedule.courses, ev]);
    }

    setShowModal(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }, [form, editingId, validate, activeSchedule, updateCourses]);

  const handleDelete = useCallback(
    (eventId: string) => {
      if (activeSchedule) {
        updateCourses(activeSchedule.courses.filter((e) => e.id !== eventId));
      }
      setShowModal(false);
      setEditingId(null);
    },
    [activeSchedule, updateCourses]
  );

  const toggleDay = useCallback((day: number) => {
    setForm((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day)
        ? prev.daysOfWeek.filter((d) => d !== day)
        : [...prev.daysOfWeek, day].sort(),
    }));
    setErrors((prev) => ({ ...prev, days: "" }));
  }, []);

  const handleEventClick = useCallback(
    (info: { event: { id: string } }) => {
      setDetailEventId(info.event.id);
      setShowDetailModal(true);
    },
    []
  );

  // Add course from catalog — opens modal pre-filled for time selection
  const addCourseFromCatalog = useCallback(
    (course: CatalogCourse) => {
      if (!activeSchedule) return;
      setEditingId(null);
      setForm({
        code: course.code,
        title: course.title,
        credits: course.credits.toString(),
        daysOfWeek: [],
        startTime: "09:00",
        endTime: "10:15",
        location: "",
        prerequisite_courses: course.prerequisite_courses,
      });
      setErrors({});
      setShowModal(true);
    },
    [activeSchedule]
  );

  // Check if a course is already in the active schedule
  const isCourseAdded = useCallback(
    (courseCode: string) => {
      if (!activeSchedule) return false;
      return activeSchedule.courses.some(
        (c) => c.code.toUpperCase() === courseCode.toUpperCase()
      );
    },
    [activeSchedule]
  );

  // Remove course by code from active schedule
  const removeCourseByCode = useCallback(
    (courseCode: string) => {
      if (!activeSchedule) return;
      updateCourses(
        activeSchedule.courses.filter(
          (c) => c.code.toUpperCase() !== courseCode.toUpperCase()
        )
      );
    },
    [activeSchedule, updateCourses]
  );

  // Catalog search
  useEffect(() => {
    setSearchResults([]);
    if (!searchQuery.trim()) {
      return;
    }
    const timer = setTimeout(() => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSearching(true);
      fetch(`/api/courses?q=${encodeURIComponent(searchQuery)}`, {
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((d) => setSearchResults((d.courses ?? []).slice(0, 20)))
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const calendarEvents = activeSchedule ? activeSchedule.courses : [];

  const initialDate = (() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split("T")[0];
  })();

  const prereqStatus = (() => {
    if (!activeSchedule) return new Map<string, string[]>();
    const sorted = sortSemestersChronologically(schedules);
    const activeIndex = sorted.findIndex((s) => s.id === activeSchedule.id);
    const takenBefore = new Set<string>();

    // All past semesters count as "taken before" any planned semester
    for (const sem of pastSchedules) {
      for (const c of sem.courses) {
        takenBefore.add(c.code.toUpperCase());
      }
    }

    // Planned semesters before the active one also count
    for (let i = 0; i < activeIndex; i++) {
      for (const c of sorted[i].courses) {
        takenBefore.add(c.code.toUpperCase());
      }
    }
    const result = new Map<string, string[]>();
    for (const course of activeSchedule.courses) {
      const unmet = (course.prerequisite_courses ?? []).filter(
        (p) => !takenBefore.has(p.toUpperCase())
      );
      if (unmet.length > 0) result.set(course.id, unmet);
    }
    return result;
  })();

  const totalCredits = activeSchedule
    ? activeSchedule.courses.reduce((sum, c) => sum + c.credits, 0)
    : 0;

  // Quick-add semester
  const [showNewSem, setShowNewSem] = useState(false);
  const [newTerm, setNewTerm] = useState<"fall" | "spring" | "summer">("fall");
  const [newYear, setNewYear] = useState(CURRENT_YEAR);

  const calendarOptions = {
    initialDate,
    initialView: "timeGridWeek",
    headerToolbar: false,
    views: {
      timeGridWeek: {
        type: "timeGrid",
        duration: { days: 5 },
        buttonText: "Week",
        hiddenDays: [0, 6],
      },
    },
    slotMinTime: "08:00:00",
    slotMaxTime: "20:00:00",
    slotLabelFormat: {
      hour: "numeric",
      minute: "2-digit",
      meridiem: "short",
    },
    allDaySlot: false,
    weekends: false,
    hiddenDays: [0, 6],
    events: eventsToCalendar(calendarEvents, prereqStatus),
    eventClick: handleEventClick,
    eventContent: (arg: any) => {
      const { location, hasUnmetPrereqs } = arg.event.extendedProps;
      return (
        <div className="fc-event-title-container p-1 leading-tight">
          <div className="fc-event-title text-xs font-semibold leading-tight flex items-center gap-1">
            {arg.timeText}
            {hasUnmetPrereqs && (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-status-missing shrink-0" title="Missing prerequisites" />
            )}
          </div>
          <div className="text-[10px] opacity-90 leading-tight truncate">
            {arg.event.title}
          </div>
          {location && (
            <div className="text-[9px] opacity-70 leading-tight mt-0.5">
              {location}
            </div>
          )}
        </div>
      );
    },
    height: "auto",
    expandRows: true,
    nowIndicator: true,
  };

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Syncing indicator */}
      {syncing && (
        <div className="flex items-center gap-2 border-b border-border bg-card/80 px-4 py-1.5 text-xs text-muted-foreground">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-border border-t-primary" />
          Syncing your data...
        </div>
      )}

      {/* Slim vertical nav bar */}
      <div className="flex flex-1 overflow-hidden">
        <NavBar active="/calendar" />

        {/* Left panel — Course search & list */}
        <aside className="flex w-[340px] min-w-[300px] flex-col border-r border-border bg-card">
          {/* Search bar */}
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search courses to add..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Course list */}
          <div className="flex-1 overflow-y-auto">
            {searchQuery.trim() ? (
              <>
                {searching && (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    Searching...
                  </div>
                )}
                {!searching && searchResults.length === 0 && (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    No courses found.
                  </div>
                )}
                {searchResults.map((course) => {
                  const added = isCourseAdded(course.code);
                  return (
                    <div
                      key={course.code}
                      className="border-b border-border px-3 py-3 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-primary">
                              {course.code}
                            </span>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {course.credits} cr
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm text-foreground truncate">
                            {course.title}
                          </p>
                          {course.prerequisite_courses.length > 0 && (
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              Prereqs: {course.prerequisite_courses.join(", ")}
                            </p>
                          )}
                        </div>
                        {added ? (
                          <button
                            onClick={() => removeCourseByCode(course.code)}
                            className="shrink-0 rounded-full bg-status-met/15 px-2.5 py-1 text-[11px] font-medium text-status-met hover:bg-status-met/25 transition-colors"
                          >
                            Added
                          </button>
                        ) : (
                          <button
                            onClick={() => addCourseFromCatalog(course)}
                            disabled={!activeSchedule}
                            className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-40"
                          >
                            + Add
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                {/* Added courses list when no search */}
                {activeSchedule && activeSchedule.courses.length > 0 && (
                  <div>
                    <div className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Added courses
                    </div>
                    {activeSchedule.courses.map((ev) => {
                      const unmet = prereqStatus.get(ev.id);
                      return (
                        <div
                          key={ev.id}
                          className="border-b border-border px-3 py-2.5 hover:bg-accent/50 transition-colors cursor-pointer"
                          onClick={() => {
                            setDetailEventId(ev.id);
                            setShowDetailModal(true);
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-2 w-2 rounded-full shrink-0"
                                  style={{ backgroundColor: ev.color }}
                                />
                                <span className="font-mono text-sm font-bold text-foreground">
                                  {ev.code}
                                </span>
                                {unmet && unmet.length > 0 && (
                                  <span className="rounded bg-status-missing/15 px-1 py-0.5 text-[9px] font-medium text-status-missing">
                                    Missing prereq
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground truncate">
                                {ev.title}
                              </p>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">
                                {ev.daysOfWeek.map((d) => DAY_MAP[d]).join("/")}{" "}
                                {formatTime12(ev.startTime)}–{formatTime12(ev.endTime)}
                                {ev.location && ` · ${ev.location}`}
                              </p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateCourses(
                                  activeSchedule.courses.filter((c) => c.id !== ev.id)
                                );
                              }}
                              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeSchedule && activeSchedule.courses.length === 0 && (
                  <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                    <BookOpen className="mb-3 h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      Search for courses above to add them to your schedule.
                    </p>
                  </div>
                )}

                {!activeSchedule && (
                  <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                    <CalendarDays className="mb-3 h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      Create a semester to start building your schedule.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Right panel — Calendar */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2.5">
            {/* Semester tabs */}
            <div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
              {schedules.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveId(s.id)}
                  className={`group flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    activeId === s.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <span>
                    {termLabel(s.term)} {s.year}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSemester(s.id);
                    }}
                    className="ml-0.5 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </button>
              ))}

              {!showNewSem ? (
                <button
                  onClick={() => setShowNewSem(true)}
                  className="flex shrink-0 items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                >
                  <Plus className="h-3 w-3" />
                </button>
              ) : (
                <div className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5">
                  <select
                    value={newTerm}
                    onChange={(e) =>
                      setNewTerm(e.target.value as "fall" | "spring" | "summer")
                    }
                    className="h-6 rounded border border-input bg-card px-1 text-[11px] text-foreground"
                  >
                    {TERM_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center">
                    <button
                      onClick={() => setNewYear((y) => y - 1)}
                      className="rounded p-0.5 text-foreground hover:bg-accent"
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </button>
                    <span className="w-8 text-center text-[11px] font-medium text-foreground">
                      {newYear}
                    </span>
                    <button
                      onClick={() => setNewYear((y) => y + 1)}
                      className="rounded p-0.5 text-foreground hover:bg-accent"
                    >
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      addSemester(newTerm, newYear);
                      setShowNewSem(false);
                    }}
                    className="rounded bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setShowNewSem(false)}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Right side actions */}
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                {totalCredits} credits
              </span>
              <Button
                onClick={openAddModal}
                size="sm"
                disabled={!activeId}
                className="h-7 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Custom
              </Button>
            </div>
          </div>

          {/* Calendar */}
          {activeSchedule ? (
            <div className="flex-1 overflow-auto p-2">
              <div className="calendar-container rounded-lg border border-border bg-card shadow-sm overflow-hidden h-full">
                <FullCalendarWrapper {...calendarOptions} />
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  No semesters yet. Click{" "}
                  <strong>+</strong> in the top bar to add one.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Course Detail Modal */}
      {showDetailModal && detailEventId && activeSchedule && (() => {
        const ev = activeSchedule.courses.find((c) => c.id === detailEventId);
        if (!ev) return null;
        const unmet = prereqStatus.get(ev.id);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => { setShowDetailModal(false); setDetailEventId(null); }}
          >
            <div
              className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: ev.color }}
                  />
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{ev.code}</h2>
                    <p className="text-xs text-muted-foreground">{ev.title}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowDetailModal(false); setDetailEventId(null); }}
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <span className="text-lg">&times;</span>
                </button>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-accent/50 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Credits</p>
                    <p className="mt-0.5 text-sm font-semibold text-foreground">{ev.credits}</p>
                  </div>
                  <div className="rounded-lg bg-accent/50 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Location</p>
                    <p className="mt-0.5 text-sm font-semibold text-foreground">{ev.location || "—"}</p>
                  </div>
                </div>

                <div className="rounded-lg bg-accent/50 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Schedule</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">
                    {ev.daysOfWeek.map((d) => DAY_MAP[d]).join("/")}{" "}
                    {formatTime12(ev.startTime)}–{formatTime12(ev.endTime)}
                  </p>
                </div>

                {ev.prerequisite_courses && ev.prerequisite_courses.length > 0 && (
                  <div className="rounded-lg bg-accent/50 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Prerequisites</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {ev.prerequisite_courses.map((p) => (
                        <span
                          key={p}
                          className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {unmet && unmet.length > 0 && (
                  <div className="rounded-lg bg-status-missing/10 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-status-missing">Missing Prerequisites</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {unmet.map((p) => (
                        <span
                          key={p}
                          className="inline-flex items-center rounded-md bg-status-missing/15 px-2 py-0.5 text-xs font-medium text-status-missing"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setShowDetailModal(false);
                      setDetailEventId(null);
                      handleDelete(ev.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setShowDetailModal(false);
                      setDetailEventId(null);
                      openEditModal(ev.id);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add/Edit Custom Event Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingId ? "Edit Course" : "Add Course"}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingId(null);
                }}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <span className="text-lg">&times;</span>
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Course code <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder="e.g. CSC 2302"
                    value={form.code}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, code: e.target.value }));
                      setErrors((prev) => ({ ...prev, code: "" }));
                    }}
                  />
                  {errors.code && (
                    <p className="mt-0.5 text-[10px] text-destructive">
                      {errors.code}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Credits
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="6"
                    value={form.credits}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, credits: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Title <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="e.g. Data Structures"
                  value={form.title}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, title: e.target.value }));
                    setErrors((prev) => ({ ...prev, title: "" }));
                  }}
                />
                {errors.title && (
                  <p className="mt-0.5 text-[10px] text-destructive">
                    {errors.title}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Days <span className="text-destructive">*</span>
                </label>
                <div className="flex gap-1.5">
                  {DAY_OPTIONS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      className={`flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium transition-colors ${
                        form.daysOfWeek.includes(d.value)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-transparent text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {d.label.slice(0, 2)}
                    </button>
                  ))}
                </div>
                {errors.days && (
                  <p className="mt-0.5 text-[10px] text-destructive">
                    {errors.days}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Start time
                  </label>
                  <select
                    value={form.startTime}
                    onChange={(e) => {
                      setForm((prev) => ({
                        ...prev,
                        startTime: e.target.value,
                      }));
                      setErrors((prev) => ({ ...prev, time: "" }));
                    }}
                    className="flex h-9 w-full items-center rounded-md border border-input bg-card px-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {TIME_SLOTS.map((t) => (
                      <option key={t} value={t}>
                        {formatTime12(t)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    End time
                  </label>
                  <select
                    value={form.endTime}
                    onChange={(e) => {
                      setForm((prev) => ({
                        ...prev,
                        endTime: e.target.value,
                      }));
                      setErrors((prev) => ({ ...prev, time: "" }));
                    }}
                    className="flex h-9 w-full items-center rounded-md border border-input bg-card px-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {TIME_SLOTS.filter(
                      (t) => timeToMinutes(t) > timeToMinutes(form.startTime)
                    ).map((t) => (
                      <option key={t} value={t}>
                        {formatTime12(t)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {errors.time && (
                <p className="text-[10px] text-destructive">{errors.time}</p>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Location
                </label>
                <Input
                  placeholder="e.g. Room 204"
                  value={form.location}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, location: e.target.value }))
                  }
                />
              </div>

              <div className="flex justify-between pt-2">
                {editingId ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(editingId)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                ) : (
                  <div />
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowModal(false);
                      setEditingId(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave}>
                    {editingId ? "Save changes" : "Add to schedule"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
