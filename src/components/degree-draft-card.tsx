"use client";

import { useId } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DegreePlan } from "@/lib/degree-planner";
import { semesterLimits } from "@/lib/semester-load";
import { termLabel } from "@/lib/store";

type Props = {
  plan: DegreePlan;
  deadline: string;
  specialization?: string;
  totalCredits?: number | number[];
  assumptions: string;
  note?: string;
  selectedTerm: string;
  onSelectTerm: (term: string) => void;
  onSave?: (plan: DegreePlan) => void;
  onDelete?: (plan: DegreePlan) => void;
  saveLabel?: string;
  confirmed?: boolean;
  name?: string;
  onNameChange?: (name: string) => void;
  disabled?: boolean;
  children?: React.ReactNode;
};

export function DegreeDraftCard({ plan, deadline, specialization, totalCredits, assumptions, note,
  selectedTerm, onSelectTerm, onSave, onDelete, saveLabel = "Add courses to Career", confirmed, name, onNameChange, disabled, children }: Props) {
  const keyForTerm = ({ term, year }: { term: string; year: number }) => `${year}-${term}`;
  const term = plan.terms.find((item) => keyForTerm(item) === selectedTerm) ?? plan.terms[0];
  const creditLimit = semesterLimits(term?.term).credits;

  return (
    <div className="motion-enter w-full min-w-0 space-y-3" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{confirmed ? "Confirmed plan" : "Plan draft"}</h2>
        <p className="text-sm text-muted-foreground">Target finish: {deadline}{specialization && ` / ${specialization}`}</p>
      </div>
      {plan.terms.length > 0 && <div className="flex flex-wrap gap-1.5" role="group" aria-label="Planned semesters">
        {plan.terms.map((item) => <button key={keyForTerm(item)} type="button" aria-pressed={term === item}
          onClick={() => onSelectTerm(keyForTerm(item))}
          className={`min-h-10 rounded-md border border-border px-3.5 py-2 text-sm font-medium transition-colors ${term === item ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"}`}>
          {termLabel(item.term)} {item.year}
        </button>)}
      </div>}
      <Card className="min-w-0">
        <CardHeader className="space-y-1.5 pb-3">
          <CardTitle>{onNameChange ? <input aria-label={confirmed ? "Confirmed plan name" : "Draft name"}
            placeholder={plan.label} value={name ?? ""} onChange={(event) => onNameChange(event.target.value)}
            maxLength={80} disabled={disabled} className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
            : name || plan.label}</CardTitle>
          <p className="text-sm text-muted-foreground">{plan.finish
            ? `${plan.finish}${plan.withinTarget ? "" : " (after target)"}`
            : "Finish pending review"}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{plan.terms.length} terms / Peak {plan.peakCredits} credits</p>
            <p>{plan.projectedCredits} projected credits through this draft</p>
          </div>
          {term ? <div key={keyForTerm(term)} className="motion-enter space-y-2 rounded-md border border-border p-3">
            <div className="flex flex-wrap justify-between gap-1 text-sm">
              <span className="font-medium">{term.credits} / {creditLimit} credits</span>
              <span className="text-muted-foreground">{term.counted} counted courses</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-accent" aria-hidden="true">
              <div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
                style={{ width: `${Math.min(term.credits / creditLimit, 1) * 100}%` }} />
            </div>
            <p className="text-sm text-muted-foreground">
              {term.projectedCredits}{totalCredits && ` / ${Array.isArray(totalCredits) ? totalCredits.join("–") : totalCredits}`} degree credits by term end · {term.remainingRequirements} listed requirements remaining
            </p>
            <ul className="divide-y divide-border text-sm">
              {term.courses.map((course) => <li key={course.code} className="flex justify-between gap-2 py-2">
                <span><strong className="font-medium">{course.code}</strong> <span className="text-muted-foreground">{course.title}</span></span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{course.credits} cr</span>
              </li>)}
            </ul>
          </div> : null}
          {!!plan.remaining.length && <p className="text-sm text-muted-foreground">Unresolved: {plan.remaining.join("; ")}</p>}
          {!!plan.review.length && <details className="motion-details text-sm text-muted-foreground">
            <summary className="cursor-pointer">Items to review with your advisor</summary>
            <ul className="mt-2 list-disc space-y-1 pl-4">{plan.review.map((note) => <li key={note}>{note}</li>)}</ul>
          </details>}
          <div className="flex flex-wrap items-center gap-2">
            {onSave && !!plan.terms.length && <Button type="button" variant="outline" onClick={() => onSave(plan)} disabled={disabled || !plan.canSave}>{saveLabel}</Button>}
            {onDelete && <Button type="button" variant="ghost" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Delete ${plan.label.toLowerCase()} draft`} onClick={() => onDelete(plan)} disabled={disabled}>
              <Trash2 className="size-4" aria-hidden="true" /> Delete draft
            </Button>}
          </div>
          {children}
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">{assumptions} {note}</p>
    </div>
  );
}

export function DegreeDraftEditor({ value, onChange, onSubmit, disabled, pending, feedback }: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  pending: boolean;
  feedback: string;
}) {
  const id = useId();
  return (
    <form className="space-y-2 border-t border-border pt-3" onSubmit={(event) => {
      event.preventDefault();
      if (!disabled && value.trim()) onSubmit();
    }}>
      <label htmlFor={id} className="text-sm font-medium">Adjust this draft</label>
      <div className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
        <input id={id} value={value} onChange={(event) => onChange(event.target.value)}
          placeholder="e.g. Move Chemistry to Spring 2027" maxLength={4000}
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
        <Button type="submit" variant="outline" disabled={!value.trim() || disabled}>
          {pending ? "Checking change..." : "Request change"}
        </Button>
      </div>
      {feedback && <p role="status" className="text-sm text-muted-foreground">{feedback}</p>}
    </form>
  );
}
