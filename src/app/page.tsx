"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  BookOpen,
  Bot,
  CalendarDays,
  CircleAlert,
  Clock3,
  GraduationCap,
  Upload,
} from "lucide-react";
import { ConcealedGpa, GpaEye } from "@/components/gpa-visibility";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  calculateCumulativeGpa,
  calculateTotalCredits,
  getUnmetPrereqs,
  loadPastSchedules,
  loadProfile,
  loadSchedules,
  loadSemesters,
  onStorageChange,
  sortSemestersChronologically,
  termLabel,
  type CalendarEvent,
  type Semester,
  type SemesterSchedule,
  type StudentProfile,
} from "@/lib/store";

interface WorkspaceSnapshot {
  profile: StudentProfile | null;
  schedules: SemesterSchedule[];
  pastSchedules: SemesterSchedule[];
  gpaSemesters: Semester[];
}

interface NextClass {
  event: CalendarEvent;
  dayLabel: string;
}

const EMPTY_SNAPSHOT: WorkspaceSnapshot = {
  profile: null,
  schedules: [],
  pastSchedules: [],
  gpaSemesters: [],
};

function getWorkspaceSnapshotKey(): string {
  return JSON.stringify({
    profile: loadProfile(),
    schedules: loadSchedules(),
    pastSchedules: loadPastSchedules(),
    gpaSemesters: loadSemesters(),
  } satisfies WorkspaceSnapshot);
}

function getServerWorkspaceSnapshotKey(): string {
  return "";
}

const subscribeToNothing = () => () => {};

function getClientHydrationSnapshot(): boolean {
  return true;
}

function getServerHydrationSnapshot(): boolean {
  return false;
}

function getFirstName(profile: StudentProfile | null): string {
  return profile?.fullName.trim().split(/\s+/)[0] || "there";
}

function parseTime(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function getNextClass(courses: CalendarEvent[]): NextClass | null {
  if (courses.length === 0) return null;

  const now = new Date();
  const currentDay = now.getDay() === 0 ? 7 : now.getDay();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  const candidates = courses.flatMap((event) =>
    event.daysOfWeek
      .filter((day) => day >= 1 && day <= 5)
      .map((day) => {
        let dayOffset = (day - currentDay + 7) % 7;
        if (dayOffset === 0 && parseTime(event.startTime) < currentTime) {
          dayOffset = 7;
        }

        return {
          event,
          day,
          dayOffset,
          startTime: parseTime(event.startTime),
        };
      })
  );

  candidates.sort(
    (a, b) => a.dayOffset - b.dayOffset || a.startTime - b.startTime
  );

  const next = candidates[0];
  if (!next) return null;

  return {
    event: next.event,
    dayLabel:
      next.dayOffset === 0
        ? "Today"
        : next.dayOffset === 1
          ? "Tomorrow"
          : dayNames[next.day - 1],
  };
}

function formatCredits(credits: number): string {
  return `${credits} ${credits === 1 ? "credit" : "credits"}`;
}

function formatSemester(schedule: SemesterSchedule | null): string {
  return schedule ? `${termLabel(schedule.term)} ${schedule.year}` : "Not planned";
}

export default function Home() {
  const workspaceKey = useSyncExternalStore(
    onStorageChange,
    getWorkspaceSnapshotKey,
    getServerWorkspaceSnapshotKey
  );
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot
  );
  const workspace = useMemo(
    () =>
      workspaceKey
        ? (JSON.parse(workspaceKey) as WorkspaceSnapshot)
        : EMPTY_SNAPSHOT,
    [workspaceKey]
  );

  const hasData =
    workspace.profile !== null ||
    workspace.schedules.length > 0 ||
    workspace.pastSchedules.length > 0 ||
    workspace.gpaSemesters.length > 0;
  const firstName = getFirstName(workspace.profile);
  const activeSchedule = workspace.schedules[0] ?? null;
  const historySchedules = useMemo(
    () =>
      sortSemestersChronologically([
        ...workspace.pastSchedules,
        ...workspace.schedules,
      ]),
    [workspace.pastSchedules, workspace.schedules]
  );
  const gradedHistory = useMemo(
    () => [...workspace.pastSchedules, ...workspace.gpaSemesters],
    [workspace.pastSchedules, workspace.gpaSemesters]
  );
  const cumulativeGpa = calculateCumulativeGpa(gradedHistory);
  const completedCredits = calculateTotalCredits(gradedHistory);
  const activeCredits =
    activeSchedule?.courses.reduce((sum, course) => sum + course.credits, 0) ?? 0;
  const nextClass = useMemo(
    () => getNextClass(activeSchedule?.courses ?? []),
    [activeSchedule]
  );
  const alerts = useMemo(() => {
    if (!activeSchedule) return [];

    return activeSchedule.courses.flatMap((course) =>
      getUnmetPrereqs(
        course.code,
        course.prerequisite_courses,
        historySchedules,
        activeSchedule.id
      ).map((prerequisite) => ({
        course: course.code,
        prerequisite,
      }))
    );
  }, [activeSchedule, historySchedules]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="motion-page flex min-h-0 flex-1 flex-col px-6 py-6 sm:px-10 sm:py-8">
        {!hydrated ? (
          <LoadingState />
        ) : hasData ? (
          <CommandCenter
            firstName={firstName}
            activeSchedule={activeSchedule}
            activeCredits={activeCredits}
            cumulativeGpa={cumulativeGpa}
            completedCredits={completedCredits}
            nextClass={nextClass}
            alerts={alerts}
          />
        ) : (
          <div className="flex flex-1 items-center">
            <Welcome />
          </div>
        )}
      </main>

      <footer className="px-6 py-5 text-center text-xs text-muted-foreground">
        Al Akhawayn University, P.O. Box 104, Hassan II Avenue, 53000 Ifrane, Morocco
      </footer>
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 px-3 py-4 sm:px-10 sm:py-5">
      <Link href="/" className="flex items-center gap-3">
        <Image
          src="/assets/brand/favicon.png"
          alt="Jenzabar+"
          width={32}
          height={32}
          className="h-8 w-8"
        />
        <span className="text-sm font-semibold tracking-[-0.01em]">Jenzabar+</span>
      </Link>
      <ThemeToggle />
    </header>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-6xl items-center justify-center" aria-busy="true">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
      <span className="sr-only">Loading your workspace</span>
    </div>
  );
}

function Welcome() {
  return (
    <div className="mx-auto max-w-6xl">
      <section className="grid w-full gap-12 py-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-20 lg:py-12">
        <div>
          <h1 className="mt-5 max-w-2xl text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
            Plan your semester.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            Plan your courses, check prerequisites, and track your progress.
          </p>
        </div>

        <div className="py-2">
          <p className="px-1 py-4 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Get started
          </p>
          <div className="divide-y divide-border/60">
            <StartAction
              href="/calendar"
              icon={<CalendarDays className="h-4 w-4" />}
              title="Create your first semester"
              description="Choose a term and start shaping your week."
            />
            <StartAction
              href="/gpa"
              icon={<Upload className="h-4 w-4" />}
              title="Import your transcript"
              description="Bring in completed courses and calculate your GPA."
            />
            <StartAction
              href="/catalog"
              icon={<BookOpen className="h-4 w-4" />}
              title="Explore the catalog"
              description="Search every AUI course and check its prerequisites."
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function StartAction({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 px-1 py-5 transition-colors hover:bg-accent/35"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-1 block text-sm leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}

function CommandCenter({
  firstName,
  activeSchedule,
  activeCredits,
  cumulativeGpa,
  completedCredits,
  nextClass,
  alerts,
}: {
  firstName: string;
  activeSchedule: SemesterSchedule | null;
  activeCredits: number;
  cumulativeGpa: number;
  completedCredits: number;
  nextClass: NextClass | null;
  alerts: Array<{ course: string; prerequisite: string }>;
}) {
  const [showGpa, setShowGpa] = useState(false);
  return (
    <div className="mx-auto my-auto w-full max-w-5xl">
      <section className="flex flex-col items-center gap-6 border-b border-border/70 pb-8 text-center sm:pb-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            Welcome back, {firstName}.
          </h1>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            {activeSchedule ? formatSemester(activeSchedule) : "Choose a semester to start planning."}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/calendar" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Open Schedule <ArrowRight className="size-4" />
          </Link>
          <Link href="/advisor" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-accent">
            <Bot className="size-4" /> Ask Advisor
          </Link>
        </div>
      </section>

      <section className="grid divide-y divide-border/70 border-b border-border/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <SummaryItem
          icon={<CalendarDays className="h-4 w-4" />}
          label="Current semester"
          value={formatSemester(activeSchedule)}
          detail={
            activeSchedule
              ? `${activeSchedule.courses.length} courses · ${formatCredits(activeCredits)}`
              : "Create a semester to begin"
          }
          href="/calendar"
        />
        <SummaryItem
          icon={<GraduationCap className="h-4 w-4" />}
          label="Cumulative GPA"
          value={<ConcealedGpa revealed={showGpa} value={completedCredits > 0 ? cumulativeGpa.toFixed(2) : "—"} />}
          detail={
            completedCredits > 0
              ? `${formatCredits(completedCredits)} completed`
              : "Add grades in My Career"
          }
          action={() => setShowGpa((visible) => !visible)}
          actionLabel={showGpa ? "Hide GPA" : "Show GPA"}
          expanded={showGpa}
        />
        <SummaryItem
          icon={<BookOpen className="size-4" />}
          label="Semester credits"
          value={activeSchedule ? formatCredits(activeCredits) : "—"}
          detail={activeSchedule ? activeSchedule.courses.length + " courses" : "Add courses in Schedule"}
          href="/calendar"
        />
      </section>

      {(nextClass || alerts.length > 0) && (
        <div className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm">
          {nextClass && (
            <Link href="/calendar" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <Clock3 className="size-4 text-primary" />
              Next class: {nextClass.event.code} on {nextClass.dayLabel} at {nextClass.event.startTime}
            </Link>
          )}
          {alerts.length > 0 && (
            <Link href="/calendar" className="inline-flex items-center gap-2 text-status-missing hover:underline">
              <CircleAlert className="size-4" />
              {alerts.length} prerequisite {alerts.length === 1 ? "alert" : "alerts"}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryItem({
  icon,
  label,
  value,
  detail,
  href,
  action,
  actionLabel,
  expanded,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail: string;
  href?: string;
  action?: () => void;
  actionLabel?: string;
  expanded?: boolean;
}) {
  const className = "group px-1 py-6 transition-colors hover:bg-accent/25 sm:px-6 lg:px-5";
  const content = <>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="text-primary">{icon}</span>
        <span className="text-xs font-medium uppercase tracking-[0.12em]">
          {label}
        </span>
        {expanded !== undefined && <span className="ml-auto group-hover:text-foreground"><GpaEye revealed={expanded} /></span>}
      </div>
      <p className="mt-4 truncate text-lg font-semibold tracking-[-0.02em]">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
        {detail}
      </p>
    </>;
  return href ? <Link href={href} className={className}>{content}</Link> : (
    <button type="button" className={`${className} text-left`} onClick={action} aria-label={actionLabel} aria-expanded={expanded}>
      {content}
    </button>
  );
}
