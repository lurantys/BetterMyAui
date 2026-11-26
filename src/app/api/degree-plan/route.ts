import { NextResponse } from "next/server";
import { createDegreePlan } from "@/lib/ai-degree-plan";
import { degreeAudit, type PlannerInput } from "@/lib/degree-planner";

export async function POST(request: Request) {
  try {
    const input = await request.json() as PlannerInput & { generate?: boolean };
    if (typeof input.major !== "string" || !Array.isArray(input.semesters) || input.semesters.length > 150
      || input.semesters.some((semester) => !semester || !["spring", "summer", "fall"].includes(semester.term)
        || !Number.isInteger(semester.year) || semester.year < 1990 || semester.year > 2100
        || !Array.isArray(semester.courses) || semester.courses.length > 100
        || semester.courses.some((course) => !course || typeof course.code !== "string" || !Number.isFinite(course.credits)
          || course.credits < 0 || (course.grade != null && typeof course.grade !== "string")))
      || (input.targetSemesters !== undefined && (!Number.isInteger(input.targetSemesters) || input.targetSemesters < 1 || input.targetSemesters > 24))
      || (input.targetFinish != null && (!["spring", "summer", "fall"].includes(input.targetFinish.term) || !Number.isInteger(input.targetFinish.year) || input.targetFinish.year < 1990 || input.targetFinish.year > 2100))
      || (input.minor != null && typeof input.minor !== "string")
      || (input.specialization != null && typeof input.specialization !== "string")) {
      return NextResponse.json({ error: "Enter a supported major, valid semesters, and a target of 1–24 regular semesters." }, { status: 400 });
    }
    return NextResponse.json(input.generate
      ? await createDegreePlan(input, typeof input.preferences === "string" ? input.preferences : "")
      : degreeAudit(input));
  } catch {
    return NextResponse.json({ error: "Could not build the degree audit. Check your major and semester data." }, { status: 400 });
  }
}
