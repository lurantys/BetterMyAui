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

const VALID_GRADES = new Set([
  "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F", "P", "W", "I", "NG",
]);

function creditsFromCode(code: string): number {
  const m = code.match(/[A-Z]+\s*(\d{4})/i);
  if (m && m[1].length >= 2) {
    return parseInt(m[1][1], 10) || 3;
  }
  return 3;
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
        });
      }
    }
  }

  // Find semester boundaries using the full text
  // pdfjs y is bottom-up, so sort by y DESCENDING to go top-to-page
  const linesByY = [...allItems].sort((a, b) => b.y - a.y || a.x - b.x);
  const lineTexts: { text: string; y: number }[] = [];
  let lastY = Infinity;
  let currentLine: TextItem[] = [];
  for (const item of linesByY) {
    if (currentLine.length > 0 && Math.abs(item.y - lastY) > 3) {
      currentLine.sort((a, b) => a.x - b.x);
      lineTexts.push({ text: currentLine.map((it) => it.str).join(" "), y: lastY });
      currentLine = [];
    }
    currentLine.push(item);
    lastY = item.y;
  }
  if (currentLine.length > 0) {
    currentLine.sort((a, b) => a.x - b.x);
    lineTexts.push({ text: currentLine.map((it) => it.str).join(" "), y: lastY });
  }

  // Find semester header y-positions
  const semHeaders: { y: number; term: "fall" | "spring" | "summer"; year: number; label: string }[] = [];
  for (const line of lineTexts) {
    const m = line.text.match(SEMESTER_RE);
    if (m) {
      semHeaders.push({
        y: line.y,
        year: parseInt(m[1]),
        term: m[2].toLowerCase() as "fall" | "spring" | "summer",
        label: m[0],
      });
    }
  }

  // Separate items by type using x-position classification
  const codeItems: TextItem[] = [];
  const titleItems: TextItem[] = [];
  const gradeItems: TextItem[] = [];
  const creditItems: TextItem[] = [];

  for (const item of allItems) {
    const t = item.str.trim();
    if (!t) continue;

    // Course codes: leftmost column
    if (item.x < 120 && /^[A-Z]{2,4}\d{4}(-L)?$/i.test(t)) {
      const normalized = t.replace(/^([A-Z]+)(\d)/i, "$1 $2").toUpperCase();
      codeItems.push({ str: normalized, x: item.x, y: item.y });
    }
    // Grades: in the grade column
    else if (item.x >= 275 && item.x < 320 && VALID_GRADES.has(t.toUpperCase())) {
      gradeItems.push({ str: t.toUpperCase(), x: item.x, y: item.y });
    }
    // Credits: in the credit column, first value per row
    else if (item.x >= 330 && item.x < 370 && /^\d+\.\d{2}$/.test(t)) {
      const val = parseFloat(t);
      if (val > 0 && val <= 6) {
        creditItems.push({ str: t, x: item.x, y: item.y });
      }
    }
    // Titles: title column area, exclude keywords
    else if (
      item.x >= 120 && item.x < 260 &&
      t.length > 1 &&
      !/Academic|Year|Semester|Term|Totals|Career|Division|Honors|Dean|Course|Number|CR|Type|Grade|Rpt|Hrs|Att|Ern|Gpa|Qual|Pts|GPA/i.test(t) &&
      !/^\d/.test(t)
    ) {
      titleItems.push({ str: t, x: item.x, y: item.y });
    }
  }

  // For each semester, find codes within its y-range, then match closest grade/credit/title
  const semesters: ParsedSemester[] = [];

  for (let s = 0; s < semHeaders.length; s++) {
    const headerY = semHeaders[s].y;
    // Semester ends at next header (or bottom of page, i.e. very low y in pdfjs coords)
    const nextHeaderY = s + 1 < semHeaders.length ? semHeaders[s + 1].y : -9999;

    // In pdfjs coords, y increases upward. So "below header" means y < headerY, "above next header" means y > nextHeaderY
    const codesInSection = codeItems.filter(
      (c) => c.y < headerY && c.y > nextHeaderY
    );

    // Sort codes top-to-bottom (descending y)
    codesInSection.sort((a, b) => b.y - a.y);

    const usedGrades = new Set<number>();
    const usedCredits = new Set<number>();
    const usedTitles = new Set<number>();

    const courses: ParsedCourse[] = [];

    for (const code of codesInSection) {
      // Find closest grade by y-distance
      let bestGradeIdx = -1;
      let bestGradeDist = Infinity;
      for (let gi = 0; gi < gradeItems.length; gi++) {
        if (usedGrades.has(gi)) continue;
        const dist = Math.abs(gradeItems[gi].y - code.y);
        if (dist < bestGradeDist && dist < 10) {
          bestGradeDist = dist;
          bestGradeIdx = gi;
        }
      }

      // Find closest credit by y-distance
      let bestCreditIdx = -1;
      let bestCreditDist = Infinity;
      for (let ci = 0; ci < creditItems.length; ci++) {
        if (usedCredits.has(ci)) continue;
        const dist = Math.abs(creditItems[ci].y - code.y);
        if (dist < bestCreditDist && dist < 10) {
          bestCreditDist = dist;
          bestCreditIdx = ci;
        }
      }

      // Find all title items close in y, then concatenate them left-to-right
      const nearbyTitles: TextItem[] = [];
      for (let ti = 0; ti < titleItems.length; ti++) {
        if (usedTitles.has(ti)) continue;
        const dist = Math.abs(titleItems[ti].y - code.y);
        if (dist < 10) {
          nearbyTitles.push(titleItems[ti]);
          usedTitles.add(ti);
        }
      }
      nearbyTitles.sort((a, b) => a.x - b.x);
      const title = nearbyTitles.map((t) => t.str).join(" ");

      const grade = bestGradeIdx >= 0 ? gradeItems[bestGradeIdx].str : "";
      const credit = bestCreditIdx >= 0 ? parseFloat(creditItems[bestCreditIdx].str) : 3;

      // Skip non-graded courses
      if (grade === "NG" || grade === "W") {
        if (bestGradeIdx >= 0) usedGrades.add(bestGradeIdx);
        if (bestCreditIdx >= 0) usedCredits.add(bestCreditIdx);
        continue;
      }

      if (grade) {
        courses.push({
          code: code.str,
          title: title || code.str,
          credits: creditsFromCode(code.str) || credit,
          grade,
        });
        if (bestGradeIdx >= 0) usedGrades.add(bestGradeIdx);
        if (bestCreditIdx >= 0) usedCredits.add(bestCreditIdx);
      }
    }

    if (courses.length > 0) {
      semesters.push({
        label: semHeaders[s].label,
        term: semHeaders[s].term,
        year: semHeaders[s].year,
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
