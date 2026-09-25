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
      join(process.cwd(), "data", "catalog", "aui_catalog_data.json"),
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
  const limitParam = searchParams.get("limit");
  const requestedLimit = limitParam ? Number.parseInt(limitParam, 10) : NaN;

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

  const total = courses.length;
  if (Number.isFinite(requestedLimit) && requestedLimit > 0) {
    courses = courses.slice(0, Math.min(requestedLimit, 100));
  }

  return NextResponse.json({
    disciplines: catalog.disciplines,
    courses,
    total,
  }, {
    headers: {
      // Catalog data is bundled with the deployment and changes only when the
      // app is redeployed, so browsers and the edge can safely reuse it.
      "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
