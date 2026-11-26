export const MAX_COUNTED_COURSES = 6;
export const MAX_SEMESTER_CREDITS = 21;

export function courseKey(code: string) {
  return code.replace(/\s+/g, "").toUpperCase();
}

export function countsTowardCourseLimit({ code, title = "" }: { code: string; title?: string }) {
  const key = courseKey(code);
  return !/^(?:CIP|SLP)\d|^FYE110[12]$|-L$/.test(key)
    && !/\b(?:lab|laboratory)$/i.test(title.trim());
}

export function semesterLoad<T extends { code: string; title?: string; credits: number }>(courses: readonly T[]) {
  return {
    credits: courses.reduce((sum, course) => sum + course.credits, 0),
    counted: courses.filter(countsTowardCourseLimit).length,
  };
}
