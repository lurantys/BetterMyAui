import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export interface ParsedCourse {
  code: string;
  title: string;
  credits: number;
  grade: string;
}

export interface ParsedSemester {
  label: string;
  term: "fall" | "spring" | "summer";
  year: number;
  courses: ParsedCourse[];
}

const SEMESTER_RE = /(\d{4})-\d{4}\s+Academic\s+Year\s*:?\s*(Fall|Spring|Summer)\s*Semester/i;

interface TextItem {
  str: string;
  x: number;
  y: number;
}

// Column x-ranges (pymupdf coords, pdfjs inverts y but x stays same)
const CODE_X_MAX = 120;
const TITLE_X_MIN = 120;
const TITLE_X_MAX = 250;
const GRADE_X_MIN = 275;
const GRADE_X_MAX = 330;
const CREDIT_X_MIN = 330;
const CREDIT_X_MAX = 370;

const VALID_GRADES = new Set([
  "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F", "P", "W", "I", "NG",
]);

function classifyItem(item: TextItem): "code" | "title" | "grade" | "credit" | "other" {
  const t = item.str.trim();
  if (!t) return "other";

  if (item.x < CODE_X_MAX && /^[A-Z]{2,4}\d{4}(-L)?$/i.test(t)) return "code";
  if (item.x >= GRADE_X_MIN && item.x < GRADE_X_MAX && VALID_GRADES.has(t.toUpperCase())) return "grade";
  if (item.x >= CREDIT_X_MIN && item.x < CREDIT_X_MAX && /^\d+\.\d{2}$/.test(t)) return "credit";
  if (item.x >= TITLE_X_MIN && item.x < TITLE_X_MAX && t.length > 1) return "title";
  return "other";
}

export async function parseTranscript(file: File): Promise<ParsedSemester[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const allItems: TextItem[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ("str" in item && item.str.trim()) {
        const tx = item.transform;
        // pdfjs y is bottom-up, convert to top-down for consistency
        allItems.push({
          str: item.str.trim(),
          x: tx[4],
          y: -tx[5],
        });
      }
    }
  }

  // Sort by y (top to bottom), then x (left to right)
  allItems.sort((a, b) => a.y - b.y || a.x - b.x);

  // Group into rows by y-proximity (tolerance ~6 units)
  const rows: TextItem[][] = [];
  let currentRow: TextItem[] = [];
  let lastY = -Infinity;
  const Y_TOLERANCE = 6;

  for (const item of allItems) {
    if (Math.abs(item.y - lastY) > Y_TOLERANCE && currentRow.length > 0) {
      currentRow.sort((a, b) => a.x - b.x);
      rows.push(currentRow);
      currentRow = [];
    }
    currentRow.push(item);
    lastY = item.y;
  }
  if (currentRow.length > 0) {
    currentRow.sort((a, b) => a.x - b.x);
    rows.push(currentRow);
  }

  // Find semester header rows
  const semesterRowIndices: { index: number; term: "fall" | "spring" | "summer"; year: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const rowText = rows[i].map((r) => r.str).join(" ");
    const m = rowText.match(SEMESTER_RE);
    if (m) {
      semesterRowIndices.push({
        index: i,
        year: parseInt(m[1]),
        term: m[2].toLowerCase() as "fall" | "spring" | "summer",
      });
    }
  }

  // Process each semester section
  const semesters: ParsedSemester[] = [];

  for (let s = 0; s < semesterRowIndices.length; s++) {
    const startRow = semesterRowIndices[s].index + 1;
    const endRow = s + 1 < semesterRowIndices.length
      ? semesterRowIndices[s + 1].index
      : rows.length;

    const courses: ParsedCourse[] = [];

    for (let r = startRow; r < endRow; r++) {
      const row = rows[r];
      const rowText = row.map((it) => it.str).join(" ");

      // Stop at totals
      if (/Term\s+Totals|Career\s+Totals|Division\s+Career/i.test(rowText)) break;

      // Classify each item in the row
      let code = "";
      let title = "";
      let grade = "";
      let credit = 0;

      for (const item of row) {
        const cls = classifyItem(item);
        const t = item.str.trim();
        if (cls === "code") code = t.toUpperCase();
        else if (cls === "grade") grade = t.toUpperCase();
        else if (cls === "credit" && credit === 0) credit = parseFloat(t);
        else if (cls === "title") {
          // Append multi-word titles (items at similar x on same row)
          title += (title ? " " : "") + t;
        }
      }

      // Only add if we found a valid course code and grade
      if (code && grade && VALID_GRADES.has(grade)) {
        // Skip withdrawn / no-grade
        if (grade === "W" || grade === "NG") continue;

        courses.push({
          code,
          title: title || code,
          credits: credit || 3,
          grade,
        });
      }
    }

    if (courses.length > 0) {
      const { term, year } = semesterRowIndices[s];
      semesters.push({
        label: `${year} ${term.charAt(0).toUpperCase() + term.slice(1)}`,
        term,
        year,
        courses,
      });
    }
  }

  return semesters;
}

export function gradeToPoints(grade: string): number | null {
  const map: Record<string, number | null> = {
    "A+": 4.0, "A": 4.0, "A-": 3.67,
    "B+": 3.33, "B": 3.0, "B-": 2.67,
    "C+": 2.33, "C": 2.0, "C-": 1.67,
    "D+": 1.33, "D": 1.0, "F": 0.0,
    "P": null, "W": null, "I": null, "NG": null,
  };
  return map[grade.toUpperCase()] ?? null;
}
