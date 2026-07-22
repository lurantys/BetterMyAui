import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

interface Course {
  code: string;
  title: string;
  credits: number;
  level: string;
  prerequisite_raw: string | null;
  prerequisite_courses: string[];
  corequisite_raw: string | null;
  corequisite_courses: string[];
  classification_requirement: string | null;
  other_requirement_notes: string | null;
  description: string;
}

interface CatalogData {
  disciplines: Record<string, string>;
  courses: Course[];
}

let cached: CatalogData | null = null;

function getCatalog(): CatalogData {
  if (!cached) {
    const raw = readFileSync(
      join(process.cwd(), "aui_catalog_data.json"),
      "utf-8"
    );
    cached = JSON.parse(raw) as CatalogData;
  }
  return cached as CatalogData;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.toLowerCase() ?? "";
  const discipline = searchParams.get("discipline") ?? "";
  const level = searchParams.get("level") ?? "";

  const catalog = getCatalog();

  let courses = catalog.courses;

  if (q) {
    courses = courses.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q)
    );
  }

  if (discipline) {
    courses = courses.filter((c) =>
      c.code.startsWith(discipline.toUpperCase())
    );
  }

  if (level) {
    courses = courses.filter((c) => c.level === level);
  }

  return NextResponse.json({
    disciplines: catalog.disciplines,
    courses,
    total: courses.length,
  });
}
