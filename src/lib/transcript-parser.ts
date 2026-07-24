import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ParsedCourse {
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

const VALID_GRADES = new Set([
  "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F", "P", "W", "I", "NG",
]);

const SEMESTER_PATTERN = /(\d{4})-\d{4}\s+Academic\s+Year\s*:\s*(Fall|Spring|Summer)\s*Semester/i;

const GRADE_TO_POINTS: Record<string, number | null> = {
  "A+": 4.0, "A": 4.0, "A-": 3.67,
  "B+": 3.33, "B": 3.0, "B-": 2.67,
  "C+": 2.33, "C": 2.0, "C-": 1.67,
  "D+": 1.33, "D": 1.0, "F": 0.0,
  "P": null, "W": null, "I": null, "NG": null,
};

function normalizeCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

function isCourseCode(s: string): boolean {
  return /^[A-Z]{2,4}\d{4}(-L)?$/i.test(s.trim());
}

function isGrade(s: string): boolean {
  return VALID_GRADES.has(s.trim().toUpperCase());
}

function isCreditValue(s: string): boolean {
  return /^\d+\.\d{2}$/.test(s.trim());
}

function parseSemesterHeader(header: string): { term: "fall" | "spring" | "summer"; year: number } | null {
  const m = header.match(SEMESTER_PATTERN);
  if (!m) return null;
  const year = parseInt(m[1]);
  const term = m[2].toLowerCase() as "fall" | "spring" | "summer";
  return { term, year };
}

function yBucket(y: number, tolerance = 3): number {
  return Math.round(y / tolerance) * tolerance;
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
        allItems.push({
          str: item.str.trim(),
          x: tx[4],
          y: tx[5],
          width: item.width,
          height: item.height,
        });
      }
    }
  }

  allItems.sort((a, b) => a.y - b.y || a.x - b.x);

  // Group into rows by y-bucket
  const rows: TextItem[][] = [];
  let currentRow: TextItem[] = [];
  let lastY = -Infinity;

  for (const item of allItems) {
    const bucket = yBucket(item.y);
    if (bucket !== lastY && currentRow.length > 0) {
      rows.push(currentRow);
      currentRow = [];
    }
    currentRow.push(item);
    lastY = bucket;
  }
  if (currentRow.length > 0) rows.push(currentRow);

  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
  }

  // Find semester boundaries
  const semesterRowIndices: { index: number; label: string; term: "fall" | "spring" | "summer"; year: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const rowText = rows[i].map((r) => r.str).join(" ");
    const m = rowText.match(SEMESTER_PATTERN);
    if (m) {
      const year = parseInt(m[1]);
      const term = m[2].toLowerCase() as "fall" | "spring" | "summer";
      semesterRowIndices.push({ index: i, label: rowText.trim(), term, year });
    }
  }

  // For each semester section, extract courses
  const semesters: ParsedSemester[] = [];

  for (let s = 0; s < semesterRowIndices.length; s++) {
    const startRow = semesterRowIndices[s].index + 1;
    const endRow = s + 1 < semesterRowIndices.length ? semesterRowIndices[s + 1].index : rows.length;
    const sectionRows = rows.slice(startRow, endRow);

    // Collect all text items in this section
    const codes: { text: string; y: number }[] = [];
    const titles: { text: string; y: number }[] = [];
    const grades: { text: string; y: number }[] = [];
    const credits: { text: string; y: number }[] = [];

    for (const row of sectionRows) {
      // Stop at "Term Totals" or "Career Totals"
      const rowText = row.map((r) => r.str).join(" ");
      if (/Term Totals|Career Totals|Division Career/i.test(rowText)) break;

      for (const item of row) {
        const t = item.str.trim();
        if (!t) continue;

        if (isCourseCode(t)) {
          codes.push({ text: normalizeCode(t), y: item.y });
        } else if (isGrade(t)) {
          grades.push({ text: t.toUpperCase(), y: item.y });
        } else if (isCreditValue(t)) {
          // First credit column is "Rpt Hrs Att" = the course credit hours
          // We take the first credit value per unique y-bucket
          credits.push({ text: t, y: item.y });
        }
      }

      // Titles: items that are not codes, not grades, not credits, not headers
      // They're the longer text strings
      for (const item of row) {
        const t = item.str.trim();
        if (
          t.length > 2 &&
          !isCourseCode(t) &&
          !isGrade(t) &&
          !isCreditValue(t) &&
          !/Term Totals|Career Totals|Honors|CR Type|Hrs |GPA|Division/i.test(t) &&
          !SEMESTER_PATTERN.test(t)
        ) {
          titles.push({ text: t, y: item.y });
        }
      }
    }

    if (codes.length === 0) continue;

    // Match by y-position: for each code, find the closest title, grade, and first credit
    const courses: ParsedCourse[] = [];

    for (const code of codes) {
      // Find closest title by y
      let bestTitle = "";
      let bestTitleDist = Infinity;
      for (const title of titles) {
        const dist = Math.abs(title.y - code.y);
        if (dist < bestTitleDist) {
          bestTitleDist = dist;
          bestTitle = title.text;
        }
      }

      // Find closest grade by y
      let bestGrade = "";
      let bestGradeDist = Infinity;
      for (const grade of grades) {
        const dist = Math.abs(grade.y - code.y);
        if (dist < bestGradeDist) {
          bestGradeDist = dist;
          bestGrade = grade.text;
        }
      }

      // Find first credit at same y-bucket (only take first match per code)
      let bestCredit = 0;
      let bestCreditDist = Infinity;
      for (const credit of credits) {
        const dist = Math.abs(credit.y - code.y);
        if (dist < bestCreditDist) {
          bestCreditDist = dist;
          bestCredit = parseFloat(credit.text);
        }
      }

      if (bestGrade && (bestGrade === "NG" || bestGrade === "W")) {
        // Skip non-graded / withdrawn courses
        continue;
      }

      courses.push({
        code: code.text,
        title: bestTitle || code.text,
        credits: bestCredit || 3,
        grade: bestGrade || "P",
      });
    }

    if (courses.length > 0) {
      semesters.push({
        label: semesterRowIndices[s].label,
        term: semesterRowIndices[s].term,
        year: semesterRowIndices[s].year,
        courses,
      });
    }
  }

  return semesters;
}

export function gradeToPoints(grade: string): number | null {
  return GRADE_TO_POINTS[grade.toUpperCase()] ?? null;
}
