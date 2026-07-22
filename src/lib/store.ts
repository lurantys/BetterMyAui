"use client";

// Shared data store with cross-tab sync via BroadcastChannel + localStorage.

// --- Calendar / scheduling types ---

export interface CalendarEvent {
  id: string;
  code: string;
  title: string;
  credits: number;
  daysOfWeek: number[]; // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
  startTime: string; // "09:00"
  endTime: string; // "10:15"
  location: string;
  color: string;
  prerequisite_courses: string[];
  grade: string | null;
  gradePoints: number | null;
}

export interface SemesterSchedule {
  id: string;
  term: "fall" | "spring" | "summer";
  year: number;
  courses: CalendarEvent[];
}

export interface CatalogCourse {
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

// --- GPA types (used by /gpa page) ---

export interface CourseEntry {
  id: string;
  code: string;
  credits: number;
  grade: string;
  gradePoints: number | null;
}

export interface Semester {
  id: string;
  name: string;
  courses: CourseEntry[];
}

// --- Storage keys ---

const SCHEDULES_KEY = "bettermyaui_semester_schedules";
const SEMESTERS_KEY = "bettermyaui_gpa_semesters";
const PAST_SCHEDULES_KEY = "bettermyaui_past_semesters";
const CHANNEL_NAME = "bettermyaui_sync";

let channel: BroadcastChannel | null = null;
let listeners: Array<() => void> = [];

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = () => {
        listeners.forEach((fn) => fn());
      };
    } catch {}
  }
  return channel;
}

export function onStorageChange(callback: () => void): () => void {
  listeners.push(callback);
  const bc = getChannel();
  if (!bc) {
    const handler = (e: StorageEvent) => {
      if (
        e.key === SCHEDULES_KEY ||
        e.key === SEMESTERS_KEY ||
        e.key === PAST_SCHEDULES_KEY
      )
        callback();
    };
    window.addEventListener("storage", handler);
    return () => {
      listeners = listeners.filter((fn) => fn !== callback);
      window.removeEventListener("storage", handler);
    };
  }
  return () => {
    listeners = listeners.filter((fn) => fn !== callback);
  };
}

function broadcast() {
  const bc = getChannel();
  if (bc) {
    try { bc.postMessage("sync"); } catch {}
  }
}

// --- Semester schedules (calendar) ---

export function loadSchedules(): SemesterSchedule[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(SCHEDULES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveSchedules(schedules: SemesterSchedule[]) {
  localStorage.setItem(SCHEDULES_KEY, JSON.stringify(schedules));
  broadcast();
}

// --- Past semester schedules (manual entry for GPA tracking) ---

export function loadPastSchedules(): SemesterSchedule[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(PAST_SCHEDULES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function savePastSchedules(schedules: SemesterSchedule[]) {
  localStorage.setItem(PAST_SCHEDULES_KEY, JSON.stringify(schedules));
  broadcast();
}

// --- GPA semesters ---

export function loadSemesters(): Semester[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(SEMESTERS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveSemesters(semesters: Semester[]) {
  localStorage.setItem(SEMESTERS_KEY, JSON.stringify(semesters));
  broadcast();
}

// --- Helpers ---

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const CURRENT_YEAR = new Date().getFullYear();

export const TERM_OPTIONS = [
  { value: "fall" as const, label: "Fall" },
  { value: "spring" as const, label: "Spring" },
  { value: "summer" as const, label: "Summer" },
];

export function termLabel(term: "fall" | "spring" | "summer"): string {
  return TERM_OPTIONS.find((t) => t.value === term)?.label ?? term;
}

// --- GPA helpers ---

export const GRADE_OPTIONS = [
  { letter: "A+", points: 4.0 },
  { letter: "A", points: 4.0 },
  { letter: "A-", points: 3.67 },
  { letter: "B+", points: 3.33 },
  { letter: "B", points: 3.0 },
  { letter: "B-", points: 2.67 },
  { letter: "C+", points: 2.33 },
  { letter: "C", points: 2.0 },
  { letter: "C-", points: 1.67 },
  { letter: "D+", points: 1.33 },
  { letter: "D", points: 1.0 },
  { letter: "F", points: 0.0 },
  { letter: "W", points: null },
  { letter: "I", points: null },
  { letter: "P", points: null },
] as const;

export const GRADE_OPTIONS_GRADED = GRADE_OPTIONS.filter(
  (g) => g.points !== null
);

interface GradedItem {
  credits: number;
  grade: string | null;
  gradePoints: number | null;
}

function isGraded(c: GradedItem): boolean {
  return c.gradePoints !== null && c.grade !== null && !["W", "I", "P"].includes(c.grade);
}

export function calculateSemesterGpa(
  courses: GradedItem[]
): number | null {
  const graded = courses.filter(isGraded);
  if (graded.length === 0) return null;
  const totalPoints = graded.reduce(
    (sum, c) => sum + (c.gradePoints ?? 0) * c.credits,
    0
  );
  const totalCredits = graded.reduce((sum, c) => sum + c.credits, 0);
  return totalCredits === 0 ? 0 : totalPoints / totalCredits;
}

export function calculateCumulativeGpa(
  semesters: { courses: GradedItem[] }[]
): number {
  let totalPoints = 0;
  let totalCredits = 0;
  for (const sem of semesters) {
    for (const course of sem.courses) {
      if (isGraded(course)) {
        totalPoints += (course.gradePoints ?? 0) * course.credits;
        totalCredits += course.credits;
      }
    }
  }
  return totalCredits === 0 ? 0 : totalPoints / totalCredits;
}

export function calculateTotalCredits(
  semesters: { courses: GradedItem[] }[]
): number {
  let total = 0;
  for (const sem of semesters) {
    for (const course of sem.courses) {
      if (isGraded(course)) {
        total += course.credits;
      }
    }
  }
  return total;
}

export function gpaColor(gpa: number): string {
  if (gpa >= 3.7) return "text-status-met";
  if (gpa >= 3.0) return "text-primary";
  if (gpa >= 2.0) return "text-status-missing";
  return "text-destructive";
}

export function gpaBarWidth(gpa: number): string {
  return `${Math.min((gpa / 4.0) * 100, 100)}%`;
}

// --- Calendar colors (AUI discipline palettes) ---

export const COURSE_COLORS: Record<string, string> = {
  ACC: "#8b5cf6",
  BIO: "#059669",
  CHE: "#d97706",
  COM: "#ec4899",
  CSC: "#2563eb",
  ECO: "#0891b2",
  EGR: "#6366f1",
  ENG: "#f43f5e",
  FIN: "#16a34a",
  HIS: "#9333ea",
  MTH: "#dc2626",
  MGT: "#ea580c",
  MKT: "#d946ef",
  PHY: "#0284c7",
  PSY: "#a855f7",
  SOC: "#64748b",
  STA: "#0d9488",
  PHI: "#7c3aed",
  INS: "#0369a1",
  MIS: "#4f46e5",
};

export const DEFAULT_COURSE_COLOR = "#64748b";

export function getCourseColor(code: string): string {
  const prefix = code.replace(/\s*\d+.*/, "").trim();
  return COURSE_COLORS[prefix] ?? DEFAULT_COURSE_COLOR;
}

// --- Semester ordering ---

const TERM_ORDER = { fall: 0, spring: 1, summer: 2 } as const;

export function sortSemestersChronologically(
  semesters: SemesterSchedule[]
): SemesterSchedule[] {
  return [...semesters].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return TERM_ORDER[a.term] - TERM_ORDER[b.term];
  });
}

// --- Prerequisite checking ---

export function getUnmetPrereqs(
  courseCode: string,
  prereqs: string[],
  allSchedules: SemesterSchedule[],
  activeScheduleId: string
): string[] {
  if (prereqs.length === 0) return [];

  const sorted = sortSemestersChronologically(allSchedules);
  const activeIndex = sorted.findIndex((s) => s.id === activeScheduleId);

  // Collect all courses taken in semesters BEFORE the active one
  const takenBefore = new Set<string>();
  for (let i = 0; i < activeIndex; i++) {
    for (const c of sorted[i].courses) {
      takenBefore.add(c.code.toUpperCase());
    }
  }

  return prereqs.filter((prereq) => !takenBefore.has(prereq.toUpperCase()));
}
