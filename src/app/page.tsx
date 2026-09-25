"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  GraduationCap,
  LayoutGrid,
  Sparkles,
  Upload,
} from "lucide-react";
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
  const greeting = "Good afternoon";

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
      <SiteHeader hasData={hasData} />

      <main className="flex-1 px-6 py-10 sm:px-10 sm:py-14">
        {!hydrated ? (
          <LoadingState />
        ) : hasData ? (
          <CommandCenter
            firstName={firstName}
            greeting={greeting}
            activeSchedule={activeSchedule}
            activeCredits={activeCredits}
            cumulativeGpa={cumulativeGpa}
            completedCredits={completedCredits}
            nextClass={nextClass}
            alerts={alerts}
          />
        ) : (
          <Welcome />
        )}
      </main>

      <footer className="px-6 py-5 text-center text-xs text-muted-foreground">
        Built for Al Akhawayn University students
      </footer>
    </div>
  );
}

function SiteHeader({ hasData }: { hasData: boolean }) {
  return (
    <header className="flex items-center justify-between px-6 py-5 sm:px-10">
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
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Link
          href="/calendar"
          className="rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {hasData ? "Open schedule" : "Get started"}
        </Link>
      </div>
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
      <section className="grid gap-12 border-b border-border/70 pb-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-20 lg:pb-24">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
            Academic planning for AUI
          </p>
          <h1 className="mt-5 max-w-2xl text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
            Welcome to Jenzabar+.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            Plan your courses, check prerequisites, and track your progress.
          </p>
        </div>

        <div className="border-y border-border/70 py-2">
          <p className="px-1 py-4 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Start with one action
          </p>
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
      className="group flex items-center gap-4 border-t border-border/60 px-1 py-5 transition-colors last:border-b hover:bg-accent/35"
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
  greeting,
  activeSchedule,
  activeCredits,
  cumulativeGpa,
  completedCredits,
  nextClass,
  alerts,
}: {
  firstName: string;
  greeting: string;
  activeSchedule: SemesterSchedule | null;
  activeCredits: number;
  cumulativeGpa: number;
  completedCredits: number;
  nextClass: NextClass | null;
  alerts: Array<{ course: string; prerequisite: string }>;
}) {
  return (
    <div className="mx-auto max-w-6xl">
      <section className="flex flex-col justify-between gap-8 border-b border-border/70 pb-10 sm:flex-row sm:items-end">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Academic command center
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            {greeting}, {firstName}.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            Here is the clearest view of what is next in your academic year.
          </p>
        </div>
        <Link
          href="/calendar"
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Open schedule
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <section className="grid divide-y divide-border/70 border-b border-border/70 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
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
          value={completedCredits > 0 ? cumulativeGpa.toFixed(2) : "—"}
          detail={
            completedCredits > 0
              ? `${formatCredits(completedCredits)} completed`
              : "Add grades in My Career"
          }
          href="/gpa"
        />
        <SummaryItem
          icon={<Clock3 className="h-4 w-4" />}
          label="Next class"
          value={nextClass ? nextClass.event.code : "Nothing scheduled"}
          detail={
            nextClass
              ? `${nextClass.dayLabel} · ${nextClass.event.startTime}`
              : "Your week is open"
          }
          href="/calendar"
        />
        <SummaryItem
          icon={<CircleAlert className="h-4 w-4" />}
          label="Prerequisite alerts"
          value={alerts.length > 0 ? String(alerts.length) : "All clear"}
          detail={
            alerts.length > 0
              ? "Review before you plan"
              : "No blockers in your current plan"
          }
          href="/catalog"
          alert={alerts.length > 0}
        />
      </section>

      <section className="grid gap-12 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20 lg:py-16">
        <div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Your next move
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em]">
                {nextClass ? "Keep the week moving" : "Shape your semester"}
              </h2>
            </div>
            <Link
              href="/calendar"
              className="text-sm font-medium text-primary hover:underline"
            >
              View schedule
            </Link>
          </div>
          {nextClass ? (
            <div className="mt-6 border-y border-border/70 py-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="font-mono text-sm font-semibold text-primary">
                    {nextClass.event.code}
                  </p>
                  <p className="mt-1 text-base font-medium">{nextClass.event.title}</p>
                </div>
                <div className="text-sm text-muted-foreground sm:text-right">
                  <p>{nextClass.dayLabel}</p>
                  <p className="mt-1">
                    {nextClass.event.startTime}–{nextClass.event.endTime}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 border-y border-border/70 py-8 text-sm leading-6 text-muted-foreground">
              {activeSchedule
                ? "Your current semester is ready for courses. Add one when you are ready."
                : "Create a semester to turn your plans into a weekly schedule."}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Attention
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em]">
                Prerequisite check
              </h2>
            </div>
            <Link
              href="/catalog"
              className="text-sm font-medium text-primary hover:underline"
            >
              Open catalog
            </Link>
          </div>
          {alerts.length > 0 ? (
            <div className="mt-6 divide-y divide-border/70 border-y border-border/70">
              {alerts.slice(0, 3).map((alert) => (
                <div
                  key={`${alert.course}-${alert.prerequisite}`}
                  className="flex items-start gap-3 py-4 text-sm"
                >
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-status-missing" />
                  <p className="leading-5 text-muted-foreground">
                    <span className="font-mono font-medium text-foreground">
                      {alert.course}
                    </span>{" "}
                    needs {alert.prerequisite} first.
                  </p>
                </div>
              ))}
              {alerts.length > 3 && (
                <p className="py-4 text-xs text-muted-foreground">
                  + {alerts.length - 3} more prerequisite checks
                </p>
              )}
            </div>
          ) : (
            <div className="mt-6 flex items-start gap-3 border-y border-border/70 py-5 text-sm leading-6 text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-met" />
              Your current plan has no unresolved prerequisite alerts.
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-border/70 py-10">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Explore Jenzabar+
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em]">
              Keep every academic decision in one place.
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/catalog"
              className="rounded-md border border-border px-3.5 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              Browse catalog
            </Link>
            <Link
              href="/gpa"
              className="rounded-md border border-border px-3.5 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              Open My Career
            </Link>
          </div>
        </div>
        <div className="mt-8 grid gap-6 text-sm text-muted-foreground sm:grid-cols-3 sm:gap-0">
          <FeatureItem
            icon={<CalendarDays className="h-4 w-4" />}
            title="Schedule"
            description="Shape a week that works."
          />
          <FeatureItem
            icon={<BookOpen className="h-4 w-4" />}
            title="Catalog"
            description="Check courses before you commit."
          />
          <FeatureItem
            icon={<LayoutGrid className="h-4 w-4" />}
            title="My Career"
            description="See the progress behind the plan."
          />
        </div>
      </section>
    </div>
  );
}

function SummaryItem({
  icon,
  label,
  value,
  detail,
  href,
  alert = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group px-1 py-6 transition-colors hover:bg-accent/25 sm:px-6 lg:px-5"
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className={alert ? "text-status-missing" : "text-primary"}>{icon}</span>
        <span className="text-xs font-medium uppercase tracking-[0.12em]">
          {label}
        </span>
      </div>
      <p className="mt-4 truncate text-lg font-semibold tracking-[-0.02em]">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
        {detail}
      </p>
    </Link>
  );
}

function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="sm:border-l sm:border-border/70 sm:pl-6 sm:first:border-l-0 sm:first:pl-0">
      <div className="flex items-center gap-2 text-primary">{icon}</div>
      <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}
