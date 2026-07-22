"use server";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { SemesterSchedule } from "@/lib/store";

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Not authenticated");
  return user;
}

async function ensureProfile(userId: string, fullName?: string) {
  const existing = await prisma.profile.findUnique({ where: { authUserId: userId } });
  if (existing) return existing;
  return prisma.profile.create({
    data: {
      id: userId,
      authUserId: userId,
      fullName: fullName || "Student",
    },
  });
}

function rowToSchedule(s: any): SemesterSchedule {
  return {
    id: s.id,
    term: s.term as "fall" | "spring" | "summer",
    year: s.year,
    courses: (s.courses || []).map((c: any) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      credits: Number(c.credits),
      daysOfWeek: (c.timeSlots as any[])?.map((t: any) => t.day) ?? [],
      startTime: (c.timeSlots as any[])?.[0]?.start ?? "09:00",
      endTime: (c.timeSlots as any[])?.[0]?.end ?? "10:00",
      location: "",
      color: c.color ?? "#64748b",
      prerequisite_courses: (c.prerequisiteCourses as string[]) ?? [],
      grade: c.grade,
      gradePoints: c.gradePoints ? Number(c.gradePoints) : null,
    })),
  };
}

// --- Planned semesters (calendar) ---

export async function loadPlannedSemesters(): Promise<SemesterSchedule[]> {
  const user = await getAuthenticatedUser();
  await ensureProfile(user.id, user.user_metadata?.full_name);

  const semesters = await prisma.userSemester.findMany({
    where: { userId: user.id, type: "planned" },
    include: { courses: true },
    orderBy: [{ year: "asc" }, { term: "asc" }],
  });

  return semesters.map(rowToSchedule);
}

export async function savePlannedSemesters(semesters: SemesterSchedule[]): Promise<void> {
  const user = await getAuthenticatedUser();
  await ensureProfile(user.id, user.user_metadata?.full_name);

  await prisma.userCourse.deleteMany({ where: { userId: user.id, semester: { type: "planned" } } });
  await prisma.userSemester.deleteMany({ where: { userId: user.id, type: "planned" } });

  for (const sem of semesters) {
    const created = await prisma.userSemester.create({
      data: {
        userId: user.id,
        type: "planned",
        year: sem.year,
        term: sem.term,
      },
    });

    if (sem.courses.length > 0) {
      await prisma.userCourse.createMany({
        data: sem.courses.map((c) => ({
          semesterId: created.id,
          userId: user.id,
          code: c.code,
          title: c.title,
          credits: c.credits,
          description: null,
          grade: c.grade,
          gradePoints: c.gradePoints,
          timeSlots: [{ day: c.daysOfWeek[0], start: c.startTime, end: c.endTime }],
          color: c.color,
          prerequisiteCourses: c.prerequisite_courses,
        })),
      });
    }
  }
}

// --- Past semesters (GPA tracking) ---

export async function loadPastSemesters(): Promise<SemesterSchedule[]> {
  const user = await getAuthenticatedUser();
  await ensureProfile(user.id, user.user_metadata?.full_name);

  const semesters = await prisma.userSemester.findMany({
    where: { userId: user.id, type: "past" },
    include: { courses: true },
    orderBy: [{ year: "asc" }, { term: "asc" }],
  });

  return semesters.map(rowToSchedule);
}

export async function savePastSemesters(semesters: SemesterSchedule[]): Promise<void> {
  const user = await getAuthenticatedUser();
  await ensureProfile(user.id, user.user_metadata?.full_name);

  await prisma.userCourse.deleteMany({ where: { userId: user.id, semester: { type: "past" } } });
  await prisma.userSemester.deleteMany({ where: { userId: user.id, type: "past" } });

  for (const sem of semesters) {
    const created = await prisma.userSemester.create({
      data: {
        userId: user.id,
        type: "past",
        year: sem.year,
        term: sem.term,
      },
    });

    if (sem.courses.length > 0) {
      await prisma.userCourse.createMany({
        data: sem.courses.map((c) => ({
          semesterId: created.id,
          userId: user.id,
          code: c.code,
          title: c.title,
          credits: c.credits,
          description: null,
          grade: c.grade,
          gradePoints: c.gradePoints,
          timeSlots: [{ day: c.daysOfWeek[0], start: c.startTime, end: c.endTime }],
          color: c.color,
          prerequisiteCourses: c.prerequisite_courses,
        })),
      });
    }
  }
}
