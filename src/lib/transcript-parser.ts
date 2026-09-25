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

const SEMESTER_RE = /(\d{4})\s*[-–]\s*\d{4}\s+Academic\s+Year\s*:?\s*(Fall|Spring|Summer)\s+Semester/i;
const COURSE_RE = /^[A-Z]{2,5}\s*\d{4}(?:-L)?$/i;
const GRADE_RE = /^(?:A\+?|A-|B\+?|B-|C\+?|C-|D\+?|D-|F|P|W|I|NG)$/i;
const EXCLUDED_TITLE_RE = /^(?:course\s+)?(?:number|title|grade|credits?|cr|type|repeat|hours?|gpa|semester|academic\s+year|totals?)\b/i;

interface TextItem {
  str: string;
  x: number;
  y: number;
  page: number;
}

interface TextLine {
  text: string;
  y: number;
  page: number;
  items: TextItem[];
}

function buildLines(items: TextItem[]): TextLine[] {
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lines: TextLine[] = [];

  for (const item of sorted) {
    let line = lines[lines.length - 1];
    if (!line || line.page !== item.page || Math.abs(line.y - item.y) > 3) {
      line = { text: "", y: item.y, page: item.page, items: [] };
      lines.push(line);
    }
    line.items.push(item);
    line.items.sort((a, b) => a.x - b.x);
    line.text = line.items.map((part) => part.str).join(" ");
  }
  return lines;
}

function normalizeCode(value: string): string {
  return value.replace(/\s+/g, " ").replace(/^([A-Z]{2,5})(\d)/i, "$1 $2").toUpperCase();
}

function isCourseCode(value: string): boolean {
  return COURSE_RE.test(value.replace(/\s+/g, ""));
}

function parseCourseLine(line: TextLine): ParsedCourse | null {
  const codeItem = line.items.find((item) => isCourseCode(item.str));
  const gradeItem = [...line.items].reverse().find((item) => GRADE_RE.test(item.str.trim()));
  if (!codeItem || !gradeItem) return null;

  const code = normalizeCode(codeItem.str);
  const grade = gradeItem.str.trim().toUpperCase();
  const between = line.items.filter((item) => item.x > codeItem.x && item.x < gradeItem.x);
  const numbers = between
    .map((item) => ({ item, value: Number.parseFloat(item.str.replace(/,/g, "")) }))
    .filter(({ item, value }) => Number.isFinite(value) && value > 0 && value <= 6 && /^\d+(?:\.\d+)?$/.test(item.str));
  const creditItem = numbers.find(({ item }) => /(?:cr|credit)/i.test(item.str)) ?? numbers[0];
  const titleParts = between
    .filter(({ x }) => x !== creditItem?.item.x)
    .map((item) => item.str)
    .filter((part) => !EXCLUDED_TITLE_RE.test(part));
  const title = titleParts.join(" ").replace(/\s+/g, " ").trim();

  return {
    code,
    title: title || code,
    credits: creditItem?.value ?? 0,
    grade,
  };
}

export async function parseTranscript(file: File): Promise<ParsedSemester[]> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Please select a PDF transcript.");
  }

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const items: TextItem[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      items.push({
        str: item.str.trim(),
        x: item.transform[4],
        y: item.transform[5],
        page: pageNumber,
      });
    }
  }

  const lines = buildLines(items);
  const semesters: ParsedSemester[] = [];
  let current: ParsedSemester | null = null;
  const seen = new Set<string>();

  for (const line of lines) {
    const header = line.text.match(SEMESTER_RE);
    if (header) {
      current = {
        label: header[0],
        year: Number.parseInt(header[1], 10),
        term: header[2].toLowerCase() as ParsedSemester["term"],
        courses: [],
      };
      semesters.push(current);
      continue;
    }

    if (!current) continue;
    const course = parseCourseLine(line);
    if (!course || course.grade === "NG" || course.grade === "W") continue;

    const key = `${current.term}-${current.year}-${course.code}-${course.grade}`;
    if (seen.has(key)) continue;
    seen.add(key);
    current.courses.push(course);
  }

  return semesters.filter((semester) => semester.courses.length > 0);
}

export function gradeToPoints(grade: string): number | null {
  const map: Record<string, number | null> = {
    "A+": 4.0, A: 4.0, "A-": 3.67,
    "B+": 3.33, B: 3.0, "B-": 2.67,
    "C+": 2.33, C: 2.0, "C-": 1.67,
    "D+": 1.33, D: 1.0, "D-": 0.67, F: 0.0,
    P: null, W: null, I: null, NG: null,
  };
  return map[grade.toUpperCase()] ?? null;
}
