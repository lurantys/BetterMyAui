import { NextResponse } from "next/server";
import catalogData from "../../../../data/catalog/aui_catalog_data.json";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.toLowerCase() ?? "";
  const discipline = searchParams.get("discipline") ?? "";
  const level = searchParams.get("level") ?? "";
  const limitParam = searchParams.get("limit");
  const requestedLimit = limitParam ? Number.parseInt(limitParam, 10) : NaN;

  const catalog = catalogData;
  const fragment = searchParams.get("autocomplete")?.slice(-160).trimEnd();
  if (fragment) {
    const suffixes = [...fragment.matchAll(/\b[\p{L}\d]/gu)]
      .filter((match, index) => index === 0 || /\s/.test(fragment[match.index - 1] ?? ""))
      .map((match) => fragment.slice(match.index))
      .filter((value) => value.length >= 3 && value.length <= 75);
    const normalized = (value: string) => value.toLowerCase().replace(/\s+/g, " ");
    const compact = (value: string) => normalized(value).replace(/\s/g, "");
    const suggestions = catalog.courses.flatMap(({ code, title }) => {
      for (const suffix of suffixes) {
        const query = normalized(suffix);
        const words = normalized(title).split(" ");
        const exactPrefix = normalized(title).startsWith(query) || compact(code).startsWith(compact(suffix));
        if (exactPrefix || (suffix.length >= 4 && words.some((_, i) => words.slice(i).join(" ").startsWith(query)))) {
          return [{ code, title, matchedLength: suffix.length, exactPrefix }];
        }
      }
      return [];
    }).sort((a, b) => b.matchedLength - a.matchedLength || Number(b.exactPrefix) - Number(a.exactPrefix));
    return NextResponse.json({ suggestions: suggestions.slice(0, 5) });
  }

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
