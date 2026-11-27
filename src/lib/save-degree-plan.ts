"use client";

import type { DegreePlan } from "./degree-planner";
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
