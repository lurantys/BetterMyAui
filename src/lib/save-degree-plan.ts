"use client";

import type { DegreePlan, DegreePlanSettings } from "./degree-planner";
import { courseKey, semesterLimits, semesterLoad } from "./semester-load";
import { generateId, getCourseColor, getSemesterStatus, type SemesterSchedule } from "./store";

export function mergeDegreePlan(plan: DegreePlan, schedules: SemesterSchedule[]) {
  if (!plan.canSave) throw new Error("Resolve the saved schedule conflicts before applying this draft.");
  const updated = [...schedules];
  let added = 0;
  for (const term of plan.terms) {
    if (getSemesterStatus(term.term, term.year) !== "planned") {
      throw new Error("A draft semester has already started. Generate a new draft before saving.");
    }
    const index = updated.findIndex((entry) => entry.term === term.term && entry.year === term.year);
    const existing = updated[index] ?? { id: generateId(), term: term.term, year: term.year, courses: [] };
    const seen = new Set(existing.courses.map(({ code }) => courseKey(code)));
    const additions = term.courses.filter(({ code }) => !seen.has(courseKey(code))).map((course) => ({
      id: generateId(), code: course.code, title: course.title, credits: course.credits,
      daysOfWeek: [], startTime: "", endTime: "", location: "", color: getCourseColor(course.code),
      prerequisite_courses: course.prerequisite_courses, grade: null, gradePoints: null,
    }));
    if (!additions.length) continue;
    const next = { ...existing, courses: [...existing.courses, ...additions] };
    const load = semesterLoad(next.courses.filter(({ grade }) => grade?.toUpperCase() !== "W"));
    const limits = semesterLimits(term.term);
    if (load.counted > limits.counted || load.credits > limits.credits) {
      throw new Error("The draft and saved courses exceed a semester load limit.");
    }
    if (index < 0) updated.push(next);
    else updated[index] = next;
    added += additions.length;
  }
  return { schedules: updated, added };
}

export type DegreePlanDraft = {
  plan: DegreePlan;
  settings: DegreePlanSettings;
  deadline: string;
  assumptions: string;
  note?: string;
  name?: string;
};

export type ConfirmedDegreePlan = DegreePlanDraft & { managedCourseIds: string[] };

export function confirmedPlanKey(major: string) {
  return `jenzabar_plus_confirmed_degree_plan_v1_${major}`;
}

export function loadConfirmedPlan(major: string): ConfirmedDegreePlan | null {
  try {
    const saved = JSON.parse(localStorage.getItem(confirmedPlanKey(major)) ?? "null");
    return saved && Array.isArray(saved.plan?.terms) && Array.isArray(saved.managedCourseIds) ? saved : null;
  } catch {
    return null;
  }
}

function isManagedCourse(confirmed: ConfirmedDegreePlan, semester: SemesterSchedule, course: SemesterSchedule["courses"][number]) {
  return !course.grade && getSemesterStatus(semester.term, semester.year) === "planned"
    && confirmed.managedCourseIds.includes(course.id)
    && confirmed.plan.terms.some(({ term, year, courses }) => term === semester.term && year === semester.year
      && courses.some(({ code }) => courseKey(code) === courseKey(course.code)));
}

export function schedulesForAlternative(schedules: SemesterSchedule[], confirmed: ConfirmedDegreePlan | null) {
  return schedules.flatMap((semester) => {
    const courses = confirmed ? semester.courses.filter((course) => !isManagedCourse(confirmed, semester, course)) : semester.courses;
    return courses.length || getSemesterStatus(semester.term, semester.year) !== "planned" ? [{ ...semester, courses }] : [];
  });
}

export function confirmDegreePlan(major: string, draft: DegreePlanDraft, schedules: SemesterSchedule[], saveSchedules: (value: SemesterSchedule[]) => void) {
  const previous = loadConfirmedPlan(major);
  const existingIds = new Set(schedules.flatMap(({ courses }) => courses.map(({ id }) => id)));
  const keptIds = new Set<string>();
  const baseline = previous ? schedules.map((semester) => ({
    ...semester,
    courses: semester.courses.filter((course) => {
      if (!isManagedCourse(previous, semester, course)) return true;
      const retained = draft.plan.terms.some(({ term, year, courses }) => term === semester.term && year === semester.year
        && courses.some(({ code }) => courseKey(code) === courseKey(course.code)));
      if (retained) keptIds.add(course.id);
      return retained;
    }),
  })) : schedules;
  const updated = mergeDegreePlan(draft.plan, baseline);
  const pastTerms = previous?.plan.terms.filter(({ term, year }) => getSemesterStatus(term, year) !== "planned") ?? [];
  const confirmed: ConfirmedDegreePlan = { ...draft,
    plan: { ...draft.plan, terms: [...pastTerms, ...draft.plan.terms] },
    managedCourseIds: updated.schedules.flatMap(({ courses }) =>
    courses.filter(({ id }) => keptIds.has(id) || !existingIds.has(id)).map(({ id }) => id),
  ) };
  const key = confirmedPlanKey(major);
  localStorage.setItem(key, JSON.stringify(confirmed));
  try {
    saveSchedules(updated.schedules);
  } catch (error) {
    if (previous) localStorage.setItem(key, JSON.stringify(previous));
    else localStorage.removeItem(key);
    throw error;
  }
  return { ...updated, confirmed };
}
