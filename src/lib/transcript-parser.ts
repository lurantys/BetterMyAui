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

const VALID_GRADES = new Set([
  "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F", "P", "W", "I", "NG",
]);

const SEMESTER_RE = /(\d{4})-\d{4}\s+Academic\s+Year\s*:?\s*(Fall|Spring|Summer)\s*Semester/i;
const COURSE_CODE_RE = /\b([A-Z]{2,4}\d{4}(?:-L)?)\b/g;
const GRADE_RE = /\b(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D|F|P|W|I|NG)\b/g;

const SKIPPED_TERMS = new Set([
  "Term", "Totals", "Career", "Division", "Honors", "Dean", "Course", "Number",
  "Title", "Type", "Grade", "Rpt", "Hrs", "Att", "Ern", "Gpa", "Qual", "Pts",
  "GPA", "LG", "LC", "PF", "NG", "Page",
]);

interface TextItem {
  str: string;
  x: number;
  y: number;
}

function isCourseCode(s: string): boolean {
  return /^[A-Z]{2,4}\d{4}(-L)?$/i.test(s);
}

function isGrade(s: string): boolean {
  return VALID_GRADES.has(s.toUpperCase());
}

function isCreditStr(s: string): boolean {
  return /^\d+\.\d{2}$/.test(s);
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

  // pdfjs-dist y is bottom-up, sort by y descending (top of page first), then x ascending
  allItems.sort((a, b) => b.y - a.y || a.x - b.x);

  // Build lines: group items that are on the same horizontal band
  // Use a generous y tolerance since pdf.js can vary
  const lines: { text: string; y: number; items: TextItem[] }[] = [];
  let currentLine: TextItem[] = [];
  let lastY = -Infinity;
  const Y_TOLERANCE = 4;

  for (const item of allItems) {
    if (Math.abs(item.y - lastY) > Y_TOLERANCE && currentLine.length > 0) {
      currentLine.sort((a, b) => a.x - b.x);
      lines.push({
        text: currentLine.map((it) => it.str).join(" "),
        y: currentLine[0].y,
        items: [...currentLine],
      });
      currentLine = [];
    }
    currentLine.push(item);
    lastY = item.y;
  }
  if (currentLine.length > 0) {
    currentLine.sort((a, b) => a.x - b.x);
    lines.push({
      text: currentLine.map((it) => it.str).join(" "),
      y: currentLine[0].y,
      items: [...currentLine],
    });
  }

  // Also build a full concatenated text for regex scanning
  const fullText = lines.map((l) => l.text).join("\n");

  // Strategy: scan the full text for semester headers, then extract courses between them
  const semesterMatches: { match: RegExpMatchArray; position: number }[] = [];
  let m: RegExpMatchArray | null;
  const semRe = new RegExp(SEMESTER_RE.source, "gi");
  while ((m = semRe.exec(fullText)) !== null) {
    semesterMatches.push({ match: m, position: m.index! });
  }

  if (semesterMatches.length === 0) {
    // Fallback: try scanning each line's individual items for split headers
    // Sometimes "2024-2025" is one item and "Academic Year : Fall Semester" is another nearby
    for (let i = 0; i < lines.length; i++) {
      for (const item of lines[i].items) {
        const yearMatch = item.str.match(/(\d{4})-\d{4}/);
        if (yearMatch) {
          // Look at surrounding items and next few lines for the semester name
          const nearby = lines
            .slice(i, Math.min(i + 3, lines.length))
            .map((l) => l.text)
            .join(" ");
          const fullMatch = nearby.match(SEMESTER_RE);
          if (fullMatch) {
            const pos = fullText.indexOf(item.str);
            if (pos >= 0) {
              semesterMatches.push({ match: fullMatch, position: pos });
            }
          }
        }
      }
    }
  }

  // Deduplicate semesters by year+term
  const seen = new Set<string>();
  const uniqueMatches = semesterMatches.filter(({ match }) => {
    const year = parseInt(match[1]);
    const term = match[2].toLowerCase();
    const key = `${year}-${term}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const semesters: ParsedSemester[] = [];

  for (let s = 0; s < uniqueMatches.length; s++) {
    const { match, position } = uniqueMatches[s];
    const nextPos = s + 1 < uniqueMatches.length ? uniqueMatches[s + 1].position : fullText.length;

    // Extract the section text between this semester and the next
    const sectionText = fullText.substring(position, nextPos);

    // Find all course codes in this section
    const codeMatches: { code: string; pos: number }[] = [];
    const codeRe = new RegExp(COURSE_CODE_RE.source, "g");
    let cm: RegExpMatchArray | null;
    while ((cm = codeRe.exec(sectionText)) !== null) {
      // Skip codes that appear in header-like positions
      const idx = cm.index!;
      const before = sectionText.substring(Math.max(0, idx - 50), idx);
      if (/Course\s*Number/i.test(before)) continue;
      codeMatches.push({ code: cm[1].toUpperCase(), pos: idx });
    }

    if (codeMatches.length === 0) continue;

    // Find all grades in this section (excluding those in "CR Type" column headers)
    const gradeMatches: { grade: string; pos: number }[] = [];
    const gradeRe = new RegExp(GRADE_RE.source, "g");
    let gm: RegExpMatchArray | null;
    while ((gm = gradeRe.exec(sectionText)) !== null) {
      const grade = gm[1].toUpperCase();
      const gmIdx = gm.index!;
      // Skip if this is part of "NG" in CR Type column context or header text
      const context = sectionText.substring(Math.max(0, gmIdx - 30), gmIdx + gm[0].length + 10);
      if (/CR\s*Type|Hrs|GPA|Grade\s*Rpt/i.test(context)) continue;
      gradeMatches.push({ grade, pos: gmIdx });
    }

    // Find credit values - first occurrence per course is "Rpt Hrs Att" (attempted hours = course credits)
    const creditMatches: { value: number; pos: number }[] = [];
    const creditRe = /\b(\d+\.\d{2})\b/g;
    let crm: RegExpMatchArray | null;
    while ((crm = creditRe.exec(sectionText)) !== null) {
      const val = parseFloat(crm[1]);
      // Only take credit-like values (0-6 range, typically 1-5)
      if (val > 0 && val <= 6) {
        creditMatches.push({ value: val, pos: crm.index! });
      }
    }

    // Find course titles - text that is NOT a code, grade, credit, or keyword
    // Titles appear after course codes in the text
    const titleMatches: { title: string; pos: number }[] = [];
    // Split section into words/items and find title-like sequences
    const sectionLines = sectionText.split("\n");
    for (const line of sectionLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Title: contains letters and spaces, is reasonably long, not a known keyword
      if (
        trimmed.length > 3 &&
        /^[A-Za-z\s\-:&.,\/']+$/.test(trimmed) &&
        !SEMESTER_RE.test(trimmed) &&
        !/Term Totals|Career Totals|Division|Honors|Dean|Course Number|CR Type|Hrs |GPA/i.test(trimmed) &&
        !SKIPPED_TERMS.has(trimmed)
      ) {
        const pos = sectionText.indexOf(trimmed);
        titleMatches.push({ title: trimmed, pos });
      }
    }

    // Match courses by position proximity
    const courses: ParsedCourse[] = [];
    const usedGrades = new Set<number>();
    const usedCredits = new Set<number>();
    const usedTitles = new Set<number>();

    for (const codeMatch of codeMatches) {
      // Find closest unused grade by position
      let bestGradeIdx = -1;
      let bestGradeDist = Infinity;
      for (let gi = 0; gi < gradeMatches.length; gi++) {
        if (usedGrades.has(gi)) continue;
        const dist = Math.abs(gradeMatches[gi].pos - codeMatch.pos);
        if (dist < bestGradeDist) {
          bestGradeDist = dist;
          bestGradeIdx = gi;
        }
      }

      // Find closest unused credit by position
      let bestCreditIdx = -1;
      let bestCreditDist = Infinity;
      for (let ci = 0; ci < creditMatches.length; ci++) {
        if (usedCredits.has(ci)) continue;
        const dist = Math.abs(creditMatches[ci].pos - codeMatch.pos);
        if (dist < bestCreditDist) {
          bestCreditDist = dist;
          bestCreditIdx = ci;
        }
      }

      // Find closest unused title by position
      let bestTitleIdx = -1;
      let bestTitleDist = Infinity;
      for (let ti = 0; ti < titleMatches.length; ti++) {
        if (usedTitles.has(ti)) continue;
        const dist = Math.abs(titleMatches[ti].pos - codeMatch.pos);
        if (dist < bestTitleDist) {
          bestTitleDist = dist;
          bestTitleIdx = ti;
        }
      }

      const grade = bestGradeIdx >= 0 ? gradeMatches[bestGradeIdx].grade : "";
      if (grade === "NG" || grade === "W") {
        // Skip non-graded / withdrawn, but mark as used
        if (bestGradeIdx >= 0) usedGrades.add(bestGradeIdx);
        if (bestCreditIdx >= 0) usedCredits.add(bestCreditIdx);
        if (bestTitleIdx >= 0) usedTitles.add(bestTitleIdx);
        continue;
      }

      courses.push({
        code: codeMatch.code,
        title: bestTitleIdx >= 0 ? titleMatches[bestTitleIdx].title : codeMatch.code,
        credits: bestCreditIdx >= 0 ? creditMatches[bestCreditIdx].value : 3,
        grade: grade || "P",
      });

      if (bestGradeIdx >= 0) usedGrades.add(bestGradeIdx);
      if (bestCreditIdx >= 0) usedCredits.add(bestCreditIdx);
      if (bestTitleIdx >= 0) usedTitles.add(bestTitleIdx);
    }

    if (courses.length > 0) {
      const year = parseInt(match[1]);
      const term = match[2].toLowerCase() as "fall" | "spring" | "summer";
      semesters.push({
        label: match[0],
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
