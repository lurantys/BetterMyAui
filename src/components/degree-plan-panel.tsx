"use client";

import { StyledSelect } from "@/components/ui/styled-select";
import Link from "next/link";
import { ArrowRight, BookOpen, Check, ChevronDown, ListChecks, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { degreeAudit, makeDegreePlans, DegreePlan } from "@/lib/degree-planner";
import type { PlannerInput } from "@/lib/degree-planner";
import { MAX_SEMESTER_CREDITS } from "@/lib/semester-load";
import { mergeDegreePlan } from "@/lib/save-degree-plan";
import { loadPastSchedules, loadProfile, loadSchedules, termLabel, type SemesterSchedule } from "@/lib/store";

type Audit = ReturnType<typeof degreeAudit>;
type Drafts = ReturnType<typeof makeDegreePlans> & { note: string; specialization?: string };
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
  const [view, setView] = useState<"requirements" | "drafts">("requirements");
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [query, setQuery] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("");
  const [targetSemesters, setTargetSemesters] = useState("8");
  const [includeFrench, setIncludeFrench] = useState(false);
  const [includeSummer, setIncludeSummer] = useState(false);
  const [preferences, setPreferences] = useState("");
  const [audit, setAudit] = useState<Audit | null>(null);
  const [draft, setDraft] = useState<{ result: Drafts; key: string; snapshot: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [message, setMessage] = useState("");

  const context = JSON.stringify({
    major, minor, specialization, includeFrench,
    semesters: [...past, ...calendar].map(({ term, year, courses }) => ({
      term, year, courses: courses.map(({ code, title, credits, grade }) => ({ code, title, credits, grade })),
    })),
  } satisfies PlannerInput);
  const draftKey = JSON.stringify([context, targetSemesters, includeSummer, preferences]);
  const result = draft?.key === draftKey ? draft.result : null;

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

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    const snapshot = JSON.stringify([loadProfile(), loadPastSchedules(), loadSchedules()]);
    setLoading(true);
    setMessage("");
    setDraft(null);
    try {
      const response = await fetch("/api/degree-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...JSON.parse(context), generate: true, targetSemesters: Number(targetSemesters), includeSummer, preferences,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDraft({ result: data, key: draftKey, snapshot });
      setSelectedTerm("");
      setView("drafts");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate a draft.");
    } finally {
      setLoading(false);
    }
  }

  function deleteDraft(plan: DegreePlan) {
    if (!draft || draft.key !== draftKey) return;
    const plans = draft.result.plans.filter(({ label }) => label !== plan.label);
    setDraft(plans.length ? { ...draft, result: { ...draft.result, plans } } : null);
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
  const keyForTerm = ({ term, year }: { term: string; year: number }) => `${year}-${term}`;
  const terms = [...new Map(result?.plans.flatMap((plan) => plan.terms.map((term) => [keyForTerm(term), term] as const)) ?? []).values()]
    .sort((a, b) => a.year - b.year || ["spring", "summer", "fall"].indexOf(a.term) - ["spring", "summer", "fall"].indexOf(b.term));
  const shownTerm = terms.find((term) => keyForTerm(term) === selectedTerm) ?? terms[0];

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
              <span>{audit.earnedCredits} earned credits{audit.assumedPlacementCredits > 0 && ` + ${audit.assumedPlacementCredits} assumed placement`}</span>
            </div>
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
          <BookOpen className="size-4" aria-hidden="true" /> Plan drafts
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
          </Card> : result ? <div key="drafts" className="motion-enter space-y-3" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{result.plans.length > 1 ? "Compare drafts" : "Plan draft"}</h2>
              <p className="text-sm text-muted-foreground">Target finish: {result.deadline}{result.specialization && ` / ${result.specialization}`}</p>
            </div>
            {terms.length > 0 && <div className="flex flex-wrap gap-1.5" role="group" aria-label="Compare semester workload">
              {terms.map((term) => <button key={keyForTerm(term)} type="button" aria-pressed={shownTerm === term} onClick={() => setSelectedTerm(keyForTerm(term))}
                className={`border border-border ${segment} ${shownTerm === term ? activeSegment : inactiveSegment}`}>
                {termLabel(term.term)} {term.year}
              </button>)}
            </div>}
            <div className={`grid items-start gap-4 ${result.plans.length > 1 ? "sm:grid-cols-2 xl:grid-cols-1 min-[1320px]:grid-cols-2" : ""}`}>
              {result.plans.map((plan, index) => {
                const term = shownTerm && plan.terms.find((item) => keyForTerm(item) === keyForTerm(shownTerm));
                return <Card key={plan.label} className="min-w-0">
                  <CardHeader className="space-y-1.5 pb-3">
                    <CardTitle>{plan.label}</CardTitle>
                    <p className="text-sm text-muted-foreground">{plan.finish
                      ? `${plan.finish}${plan.withinTarget ? "" : " (after target)"}`
                      : "Finish pending review"}{index === 0 && result.plans.length > 1 && " / Recommended"}</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm text-muted-foreground">{plan.terms.length} terms / Peak {plan.peakCredits} credits</div>
                    {term ? <div key={keyForTerm(term)} className="motion-enter space-y-2 rounded-md border border-border p-3">
                      <div className="flex flex-wrap justify-between gap-1 text-sm">
                        <span className="font-medium">{term.credits} / {MAX_SEMESTER_CREDITS} credits</span>
                        <span className="text-muted-foreground">{term.counted} counted courses</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-accent" aria-hidden="true">
                        <div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
                          style={{ width: `${Math.min(term.credits / MAX_SEMESTER_CREDITS, 1) * 100}%` }} />
                      </div>
                      <ul className="divide-y divide-border text-sm">
                        {term.courses.map((course) => <li key={course.code} className="flex justify-between gap-2 py-2">
                          <span><strong className="font-medium">{course.code}</strong> <span className="text-muted-foreground">{course.title}</span></span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{course.credits} cr</span>
                        </li>)}
                      </ul>
                    </div> : shownTerm && <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">No planned courses this term.</p>}
                    {!!plan.remaining.length && <p className="text-sm text-muted-foreground">Unresolved: {plan.remaining.join("; ")}</p>}
                    {!!plan.review.length && <details className="motion-details text-sm text-muted-foreground">
                      <summary className="cursor-pointer">Items to review with your advisor</summary>
                      <ul className="mt-2 list-disc space-y-1 pl-4">{plan.review.map((note) => <li key={note}>{note}</li>)}</ul>
                    </details>}
                    <div className="flex flex-wrap items-center gap-2">
                      {!!plan.terms.length && <Button type="button" variant="outline" onClick={() => save(plan)} disabled={!plan.canSave}>Add courses to Career</Button>}
                      <Button type="button" variant="ghost" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Delete ${plan.label.toLowerCase()} draft`} onClick={() => deleteDraft(plan)}>
                        <Trash2 className="size-4" aria-hidden="true" /> Delete draft
                      </Button>
                    </div>
                  </CardContent>
                </Card>;
              })}
            </div>
            <p className="text-sm text-muted-foreground">{result.assumptions} {result.note}</p>
          </div> : <Card><CardContent className="space-y-3 p-5 text-sm text-muted-foreground">
            <p>{loading ? "Building degree plans..." : "Generate degree plans to compare term workloads and projected finish dates."}</p>
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
            <form onSubmit={generate} className="space-y-4">
              {!!audit?.specializations.length && <label className="grid gap-1.5 text-sm font-medium text-muted-foreground">
                Specialization or concentration
                <StyledSelect label="Specialization or concentration" triggerClassName="h-11" value={specialization} onValueChange={onSpecializationChange}
                    options={[{ value: "", label: "Choose an option" }, ...audit.specializations.map((name) => ({ value: name, label: name }))]} />
              </label>}
              <label className="grid gap-1.5 text-sm font-medium text-muted-foreground">
                Regular semesters from entry
                <Input className="h-11 w-28 text-foreground" type="number" min="1" max="24" required value={targetSemesters} onChange={(event) => setTargetSemesters(event.target.value)} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input className="size-5 accent-primary" type="checkbox" checked={includeSummer} onChange={(event) => setIncludeSummer(event.target.checked)} />
                Include summer
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input className="size-5 accent-primary" type="checkbox" checked={includeFrench} onChange={(event) => setIncludeFrench(event.target.checked)} />
                Include French courses
              </label>
              {!includeFrench && <p className="-mt-2 text-xs text-muted-foreground">Assumes you earned French credit through placement.</p>}
              <label className="grid gap-1.5 text-sm font-medium text-muted-foreground">
                Preferences (optional)
                <Input className="h-11 text-foreground" value={preferences} maxLength={2000} onChange={(event) => setPreferences(event.target.value)} placeholder="For example, favor AI electives" />
              </label>
              <Button type="submit" className="h-11 w-full justify-between" disabled={loading || !audit}>
                {loading ? "Building drafts..." : "Generate degree plans"}<ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
