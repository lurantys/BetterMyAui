"use client";

import { DegreeDraftCard } from "@/components/degree-draft-card";
import { StyledSelect } from "@/components/ui/styled-select";
import Link from "next/link";
import { ArrowRight, BookOpen, Check, ChevronDown, ListChecks, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { degreeAudit, makeDegreePlans, DegreePlan } from "@/lib/degree-planner";
import type { PlannerInput } from "@/lib/degree-planner";
import { MAX_COUNTED_COURSES, MAX_SUMMER_TERMS, semesterLimits } from "@/lib/semester-load";
import { mergeDegreePlan } from "@/lib/save-degree-plan";
import { getSemesterStatus, loadPastSchedules, loadProfile, loadSchedules, type SemesterSchedule } from "@/lib/store";

type Audit = ReturnType<typeof degreeAudit>;
type Drafts = ReturnType<typeof makeDegreePlans> & { note: string; specialization?: string };
type SavedDraft = { result: Drafts; key: string; snapshot: string };
type DraftWorkspace = {
  view: "requirements" | "drafts";
  selectedTerm: string;
  targetSemesters: string;
  mode: NonNullable<PlannerInput["mode"]>;
  maxCourses: string;
  includeFrench: boolean;
  includeSummer: boolean;
  summerTermLimit: string;
  preferences: string;
  draft: SavedDraft | null;
};

function readDraftWorkspace(key: string): Partial<DraftWorkspace> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? {};
  } catch {
    return {};
  }
}
const filters = ["All", "Remaining", "In progress", "Completed"] as const;
const segment = "min-h-10 rounded-md px-3.5 py-2 text-sm font-medium transition-colors";
const activeSegment = "bg-accent text-foreground";
const inactiveSegment = "text-muted-foreground hover:bg-accent/50 hover:text-foreground";

export function DegreePlanPanel({ major, minor, specialization, onSpecializationChange, calendar, past, onSave }: {
  major: string;
  minor?: string | null;
  specialization: string;
  onSpecializationChange: (value: string) => void;
  calendar: SemesterSchedule[];
  past: SemesterSchedule[];
  onSave: (schedules: SemesterSchedule[]) => void;
}) {
  const storageKey = `jenzabar_plus_degree_drafts_v1_${major}`;
  const [stored] = useState(() => readDraftWorkspace(storageKey));
  const [view, setView] = useState<DraftWorkspace["view"]>(stored.view ?? "requirements");
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [query, setQuery] = useState("");
  const [selectedTerm, setSelectedTerm] = useState(stored.selectedTerm ?? "");
  const [targetSemesters, setTargetSemesters] = useState(stored.targetSemesters ?? "8");
  const [mode, setMode] = useState<DraftWorkspace["mode"]>(stored.mode ?? "earlier");
  const [maxCourses, setMaxCourses] = useState(stored.maxCourses ?? String(MAX_COUNTED_COURSES));
  const [includeFrench, setIncludeFrench] = useState(stored.includeFrench ?? false);
  const [includeSummer, setIncludeSummer] = useState(stored.includeSummer ?? false);
  const [summerTermLimit, setSummerTermLimit] = useState(stored.summerTermLimit ?? "all");
  const [preferences, setPreferences] = useState(stored.preferences ?? "");
  const [audit, setAudit] = useState<Audit | null>(null);
  const [draft, setDraft] = useState<SavedDraft | null>(stored.draft ?? null);
  const [loading, setLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [message, setMessage] = useState("");

  const context = JSON.stringify({
    major, minor, specialization, includeFrench,
    semesters: [...past, ...calendar].map(({ term, year, courses }) => ({
      term, year, courses: courses.map(({ code, title, credits, grade }) => ({ code, title, credits, grade })),
    })),
  } satisfies PlannerInput);
  function keyForSettings(summer: boolean, termLimit = summerTermLimit) {
    const summerRulesApply = summer || calendar.some(({ term, year }) =>
      term === "summer" && getSemesterStatus(term, year) === "planned");
    return JSON.stringify([context, targetSemesters, summer, preferences, mode, maxCourses,
      ...(summerRulesApply ? [semesterLimits("summer"), termLimit] : [])]);
  }
  const draftKey = keyForSettings(includeSummer);
  const result = draft?.key === draftKey && draft.result.plans.every((plan) =>
    plan.terms.every(({ term, year }) => getSemesterStatus(term, year) === "planned")) ? draft.result : null;

  useEffect(() => {
    if (!major) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        view, selectedTerm, targetSemesters, mode, maxCourses, includeFrench, includeSummer, summerTermLimit, preferences, draft,
      } satisfies DraftWorkspace));
    } catch {
      // The draft remains available in the open page if browser storage is full or unavailable.
    }
  }, [major, storageKey, view, selectedTerm, targetSemesters, mode, maxCourses, includeFrench, includeSummer, summerTermLimit, preferences, draft]);

  useEffect(() => {
    if (!major) return;
    const controller = new AbortController();
    fetch("/api/degree-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: context,
      signal: controller.signal,
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAudit(data);
      setAuditError("");
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setAuditError(error.message);
    });
    return () => controller.abort();
  }, [major, context]);

  async function generate(summer = includeSummer, termLimit = summerTermLimit) {
    if (loading) return;
    const target = Number(targetSemesters);
    if (!Number.isInteger(target) || target < 1 || target > 24) {
      setMessage("Enter a target of 1–24 regular semesters.");
      return;
    }
    const count = Number(maxCourses);
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNTED_COURSES) {
      setMessage(`Enter a maximum of 1–${MAX_COUNTED_COURSES} counted courses per Fall or Spring term.`);
      return;
    }
    const requestedKey = keyForSettings(summer, termLimit);
    const snapshot = JSON.stringify([loadProfile(), loadPastSchedules(), loadSchedules()]);
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/degree-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...JSON.parse(context), generate: true, targetSemesters: target, mode, maxCourses: count, includeSummer: summer,
          maxSummerTerms: summer && termLimit !== "all" ? Number(termLimit) : undefined, preferences,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDraft({ result: data, key: requestedKey, snapshot });
      setSelectedTerm("");
      setView("drafts");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate a draft.");
    } finally {
      setLoading(false);
    }
  }

  function changeSummer(include: boolean) {
    setIncludeSummer(include);
    if (draft) void generate(include);
  }

  function deleteDraft(plan: DegreePlan) {
    if (!draft || draft.key !== draftKey) return;
    setDraft(null);
    setMessage(`Deleted ${plan.label.toLowerCase()} draft.`);
  }

  function save(plan: DegreePlan) {
    const schedules = loadSchedules();
    if (!draft || draft.key !== draftKey || draft.snapshot !== JSON.stringify([loadProfile(), loadPastSchedules(), schedules])) {
      setMessage("Your Career data changed. Generate a new draft before saving.");
      return;
    }
    try {
      const updated = mergeDegreePlan(plan, schedules);
      if (updated.added) onSave(updated.schedules);
      setMessage(updated.added ? `Added ${updated.added} courses to your planned semesters.` : "These courses are already in your plan.");
      setDraft(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the draft.");
    }
  }

  const rows = audit?.rows ?? [];
  const completed = rows.filter((row) => row.status === "Completed").length;
  const groups = new Map<string, typeof rows>();
  const search = query.trim().toLowerCase();
  for (const row of rows) {
    if (filter !== "All" && row.status !== filter) continue;
    if (search && ![row.label, row.course?.code, row.course?.title, ...row.options.flatMap(({ code, title }) => [code, title])]
      .some((value) => value?.toLowerCase().includes(search))) continue;
    const category = row.label.split(" / ")[0];
    const group = groups.get(category) ?? [];
    group.push(row);
    groups.set(category, group);
  }

  if (!major) return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <p className="text-sm text-muted-foreground">Select your major to see its degree requirements.</p>
        <Link href="/gpa" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent">Open My Career</Link>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-5 sm:space-y-6">
      {audit && <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-[1fr_minmax(14rem,24rem)] sm:items-center sm:p-6">
          <div>
            <p className="text-lg font-semibold tracking-tight">{audit.program}</p>
            <p className="mt-1 text-sm text-muted-foreground">{audit.catalog} catalog{minor && ` / ${minor} minor`}</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap justify-between gap-x-3 text-sm text-muted-foreground">
              <span><strong className="text-foreground">{completed} / {rows.length}</strong> requirements</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>{audit.earnedCredits} earned credits</span>
              <span>{audit.attemptingCredits} in progress</span>
              {audit.assumedPlacementCredits > 0 && <span>{audit.assumedPlacementCredits} assumed placement</span>}
            </div>
            <p className="text-sm font-medium">{audit.projectedCredits} projected credits after this term</p>
            <div role="progressbar" aria-label="Listed requirements completed" aria-valuenow={completed} aria-valuemax={rows.length || 1}
              className="h-2 overflow-hidden rounded-full bg-accent">
              <div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${rows.length ? completed / rows.length * 100 : 0}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>}

      <div className="flex flex-wrap gap-1" role="group" aria-label="Degree plan views">
        <button type="button" aria-pressed={view === "requirements"} onClick={() => setView("requirements")}
          className={`inline-flex items-center gap-2 ${segment} ${view === "requirements" ? activeSegment : inactiveSegment}`}>
          <ListChecks className="size-4" aria-hidden="true" /> Requirements
        </button>
        <button type="button" aria-pressed={view === "drafts"} onClick={() => setView("drafts")}
          className={`inline-flex items-center gap-2 ${segment} ${view === "drafts" ? activeSegment : inactiveSegment}`}>
          <BookOpen className="size-4" aria-hidden="true" /> Plan draft
        </button>
      </div>

      {message && <p role="status" className="rounded-md border border-border bg-card px-3 py-2 text-sm">{message}</p>}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {view === "requirements" ? <Card key="requirements" className="motion-enter">
            <CardContent className="space-y-5 p-4 sm:p-6">
              {auditError && <p role="alert" className="text-sm text-destructive">{auditError}</p>}
              {!audit && !auditError && <p role="status" className="text-sm text-muted-foreground">Loading requirements...</p>}
              {audit && <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Requirement status">
                    {filters.map((status) => <button key={status} type="button" aria-pressed={filter === status}
                      onClick={() => setFilter(status)} className={`${segment} ${filter === status ? activeSegment : inactiveSegment}`}>{status}</button>)}
                  </div>
                  <div className="relative w-full sm:w-56">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input type="search" aria-label="Search requirements" placeholder="Find a requirement" className="h-11 pl-9" value={query}
                      onChange={(event) => setQuery(event.target.value)} />
                  </div>
                </div>
                {audit.issues.length > 0 && <div className="space-y-1 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                  {audit.issues.map((issue) => <p key={issue}>{issue}</p>)}
                </div>}
                <div className="divide-y divide-border rounded-md border border-border">
                  {[...groups].map(([category, entries]) => <details key={category} className="motion-details group" open={search || filter !== "All" ? true : undefined}>
                    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 text-base font-medium hover:bg-accent/40 [&::-webkit-details-marker]:hidden">
                      <ChevronDown className="size-4 shrink-0 -rotate-90 text-muted-foreground motion-chevron group-open:rotate-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1">{category}</span>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{entries.filter((row) => row.status === "Completed").length}/{entries.length}</span>
                    </summary>
                    <ul className="divide-y divide-border border-t border-border bg-background/40 px-3 text-sm">
                      {entries.map((row, index) => {
                        const requirement = row.label.split(" / ").slice(1).join(" / ");
                        const choices = row.course ? [row.course] : row.status === "Completed" ? [] : row.options;
                        const heading = requirement || (choices.length !== 1 ? category : null);
                        return <li key={`${row.label}-${index}`} className="space-y-1 py-3 pl-7">
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                          <div className="min-w-0 flex-1 basis-48">
                            {heading && <p>{heading}</p>}
                            {choices.length > 0 && <ul className={`space-y-0.5 ${heading ? "mt-1 text-muted-foreground" : ""}`}>
                              {choices.map(({ code, title }) => <li key={code}>
                                <span className="font-medium">{code}</span>{title && <span className="text-muted-foreground"> · {title}</span>}
                              </li>)}
                            </ul>}
                          </div>
                          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                            {row.status === "Completed" && <Check className="size-3.5 text-primary" aria-hidden="true" />}
                            {row.status}
                          </span>
                        </div>
                        {row.rule && <p className="text-sm text-muted-foreground">{row.rule}</p>}
                      </li>;
                      })}
                    </ul>
                  </details>)}
                  {groups.size === 0 && <p className="p-4 text-sm text-muted-foreground">No matching requirements.</p>}
                </div>
                {!!audit.unallocated.length && <details className="motion-details text-sm text-muted-foreground">
                  <summary className="cursor-pointer">{audit.unallocated.length} completed courses without a requirement match</summary>
                  <ul className="mt-2 space-y-1">
                    {audit.unallocated.map(({ code, title }) => <li key={code}>{code}{title && ` · ${title}`}</li>)}
                  </ul>
                </details>}
              </>}
            </CardContent>
          </Card> : result ? result.plans[0] ? (
            <DegreeDraftCard plan={result.plans[0]} deadline={result.deadline} specialization={result.specialization}
              totalCredits={audit?.totalCredits} assumptions={result.assumptions} note={result.note}
              selectedTerm={selectedTerm} onSelectTerm={setSelectedTerm} onSave={save} onDelete={deleteDraft} disabled={loading} />
          ) : <p role="status" className="text-sm text-muted-foreground">{result.assumptions} {result.note}</p> : <Card><CardContent className="space-y-3 p-5 text-sm text-muted-foreground">
            <p>{loading ? "Building your degree plan..." : "Generate a degree plan to see your term workloads and projected finish date."}</p>
            {!loading && <a href="#plan-settings" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              Plan settings <ArrowRight className="size-3.5" aria-hidden="true" />
            </a>}
          </CardContent></Card>}
        </div>

        <Card id="plan-settings">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden="true" /> Plan settings</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(event) => { event.preventDefault(); void generate(); }} className="space-y-4">
              {!!audit?.specializations.length && <label className="grid gap-1.5 text-sm font-medium text-muted-foreground">
                Specialization or concentration
                <StyledSelect label="Specialization or concentration" triggerClassName="h-11" value={specialization} onValueChange={onSpecializationChange}
                    options={[{ value: "", label: "Choose an option" }, ...audit.specializations.map((name) => ({ value: name, label: name }))]} />
              </label>}
              <label className="grid gap-1.5 text-sm font-medium text-muted-foreground">
                Planning style
                <StyledSelect label="Planning style" triggerClassName="h-11" value={mode}
                  options={[{ value: "earlier", label: "Graduate sooner" }, { value: "balanced", label: "Balanced workload" }]}
                  onValueChange={(value) => setMode(value as DraftWorkspace["mode"])} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-muted-foreground">
                Max counted courses per Fall or Spring term
                <Input className="h-11 w-28 text-foreground" type="number" min="1" max={MAX_COUNTED_COURSES} required
                  value={maxCourses} onChange={(event) => setMaxCourses(event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-muted-foreground">
                Regular semesters from entry
                <Input className="h-11 w-28 text-foreground" type="number" min="1" max="24" required value={targetSemesters} onChange={(event) => setTargetSemesters(event.target.value)} />
              </label>
              <PlanCheckbox checked={includeSummer} onChange={changeSummer} label="Include summer" disabled={loading} />
              {includeSummer && <label className="grid gap-1.5 text-sm font-medium text-muted-foreground">
                Maximum summer terms
                <StyledSelect label="Maximum summer terms" triggerClassName="h-11" value={summerTermLimit} disabled={loading}
                  options={[{ value: "all", label: "No limit" }, ...Array.from({ length: MAX_SUMMER_TERMS }, (_, index) => ({
                    value: String(index + 1), label: `${index + 1} ${index === 0 ? "summer" : "summers"}`,
                  }))]}
                  onValueChange={(value) => {
                    setSummerTermLimit(value);
                    if (draft) void generate(true, value);
                  }} />
              </label>}
              <PlanCheckbox checked={includeFrench} onChange={setIncludeFrench} label="Include French courses" />
              {!includeFrench && <p className="-mt-2 text-xs text-muted-foreground">Assumes you earned French credit through placement.</p>}
              <label className="grid gap-1.5 text-sm font-medium text-muted-foreground">
                Preferences (optional)
                <Input className="h-11 text-foreground" value={preferences} maxLength={2000} onChange={(event) => setPreferences(event.target.value)} placeholder="For example, favor AI electives" />
              </label>
              <Button type="submit" className="h-11 w-full justify-between" disabled={loading || !audit}>
                {loading ? "Building draft..." : "Generate degree plan"}<ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PlanCheckbox({ checked, onChange, label, disabled }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-2.5 text-sm ${disabled ? "cursor-wait opacity-60" : "cursor-pointer"}`}>
      <span className="relative grid size-5 shrink-0 place-items-center">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 forced-colors:opacity-100" />
        <span aria-hidden="true"
          className="pointer-events-none grid size-full place-items-center rounded border border-primary/35 bg-primary/5 text-primary transition-colors peer-checked:border-primary/60 peer-checked:bg-primary/15 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-card motion-reduce:transition-none forced-colors:hidden">
          {checked && <Check className="size-3.5" />}
        </span>
      </span>
      {label}
    </label>
  );
}
