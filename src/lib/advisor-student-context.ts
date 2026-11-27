import { calculateCumulativeGpa, calculateGpaTotals, calculateTotalCredits, getSemesterStatus, GRADE_OPTIONS, loadPastSchedules, loadProfile, loadSchedules } from "@/lib/store";

export function advisorStudentContext(selectedSemester?: { term: string; year: number }, planned = loadSchedules()) {
  const profile = loadProfile();
  const past = loadPastSchedules();
  const currentSemester = planned.find(({ term, year }) => getSemesterStatus(term, year) === "current");
  const { qualityPoints, gradedCredits } = calculateGpaTotals([...past, ...planned]);
  const plannedInProgressCredits = planned.flatMap(({ courses }) => courses).filter((course) => course.grade === null).reduce((sum, course) => sum + course.credits, 0);
  return JSON.stringify({
    profile: profile ? { major: profile.major, minor: profile.minor, specialization: profile.specialization } : null,
    careerSummary: {
      cumulativeGpa: calculateCumulativeGpa([...past, ...planned]),
      cumulativeQualityPoints: qualityPoints,
      cumulativeGpaCredits: gradedCredits,
      totalCareerCredits: calculateTotalCredits(past) + calculateTotalCredits(planned) + plannedInProgressCredits,
      gradingScale: GRADE_OPTIONS.map(({ letter, points }) => ({ grade: letter, points })),
    },
    selectedScheduleSemester: selectedSemester ? { term: selectedSemester.term, year: selectedSemester.year } : null,
    currentSemester: currentSemester ? {
      term: currentSemester.term,
      year: currentSemester.year,
      courses: currentSemester.courses.map(({ code, title, credits, grade, gradePoints }) => ({ code, title, credits, grade, gradePoints })),
    } : null,
    plannedSemesters: planned.map(({ term, year, courses }) => ({ term, year, courses: courses.map(({ code, title, transcriptTitle, credits, grade, gradePoints, daysOfWeek, startTime, endTime, location }) => ({ code, title, transcriptTitle, credits, grade, gradePoints, daysOfWeek, startTime, endTime, location })) })),
    completedSemesters: past.map(({ term, year, courses }) => ({ term, year, courses: courses.map(({ code, title, credits, grade, gradePoints }) => ({ code, title, credits, grade, gradePoints })) })),
  });
}
