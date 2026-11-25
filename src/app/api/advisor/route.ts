import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";

interface Course {
  code: string;
  title: string;
  credits: number;
  prerequisite_raw: string | null;
  prerequisite_courses: string[];
  corequisite_courses?: string[];
  description: string;
}

interface Catalog { courses: Course[] }
interface DegreeRequirementNode {
  program: string;
  name: string;
  catalog: string;
  totalCredits: number | number[];
  requirements: Record<string, unknown>;
}
interface ProposedChange { action: "add" | "remove" | "update_meeting" | "set_grade" | "set_major" | "set_minor"; term?: "fall" | "spring" | "summer"; year?: number; code?: string; grade?: string; value?: string; daysOfWeek?: number[]; startTime?: string; endTime?: string; location?: string; meetingLine?: number }
let catalogCache: Catalog | null = null;
let degreeCache: DegreeRequirementNode[] | null = null;

function getCatalog(): Catalog {
  if (!catalogCache) {
    catalogCache = JSON.parse(readFileSync(join(process.cwd(), "data", "catalog", "aui_catalog_data.json"), "utf8")) as Catalog;
  }
  return catalogCache;
}

const DEGREE_FILES = ["bacs.json", "bais.json", "bba.json", "bscsc.json", "bsems.json", "bsge.json", "bsrese.json"];

function getDegreePrograms(): DegreeRequirementNode[] {
  if (!degreeCache) {
    const directory = join(process.cwd(), "public", "assets", "degree requirements");
    degreeCache = DEGREE_FILES.map((file) => JSON.parse(readFileSync(join(directory, file), "utf8")) as DegreeRequirementNode);
  }
  return degreeCache;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchDegreeProgram(major: string | null | undefined, programs: DegreeRequirementNode[]): DegreeRequirementNode | null {
  if (!major?.trim()) return null;
  const value = normalizeText(major);
  const aliases: Record<string, string[]> = {
    bacs: ["communication", "communicationstudies", "bacs"],
    bais: ["internationalstudies", "bais"],
    bba: ["businessadministration", "business", "bba"],
    bscsc: ["computerscience", "bscsc", "bscs", "cs"],
    bsems: ["engineeringandmanagementscience", "engineeringmanagementscience", "bsems"],
    bsge: ["generalengineering", "bsge"],
    bsrese: ["renewableenergy", "renewableenergysystemsengineering", "bsrese"],
  };
  return programs.find((program) => {
    const name = normalizeText(program.name);
    const programCode = normalizeText(program.program);
    return value === name || value === programCode || (aliases[programCode] ?? []).some((alias) => value === alias || (alias.length > 3 && value.includes(alias)));
  }) ?? null;
}

function inferMajorFromConversation(history: { role: "user" | "assistant"; content: string }[], message: string): string | null {
  // A student may tell the advisor their major in chat without first filling
  // out the profile. Only use explicit first-person major statements here.
  const userText = [...history.filter((item) => item.role === "user").map((item) => item.content), message].join("\n");
  const patterns: [RegExp, string][] = [
    [/\b(?:i(?:'m| am)|my major is|i(?:'m| am) majoring in)\s+(?:a\s+)?(?:computer science|computer|cs)\s+major\b/i, "Computer Science"],
    [/\b(?:i(?:'m| am)|my major is|i(?:'m| am) majoring in)\s+(?:an?\s+)?(?:business administration|business)\s+major\b/i, "Business Administration"],
    [/\b(?:i(?:'m| am)|my major is|i(?:'m| am) majoring in)\s+(?:an?\s+)?(?:international studies)\s+major\b/i, "International Studies"],
    [/\b(?:i(?:'m| am)|my major is|i(?:'m| am) majoring in)\s+(?:a\s+)?(?:communication studies|communications?)\s+major\b/i, "Communication Studies"],
    [/\b(?:i(?:'m| am)|my major is|i(?:'m| am) majoring in)\s+(?:a\s+)?(?:general engineering)\s+major\b/i, "General Engineering"],
    [/\b(?:i(?:'m| am)|my major is|i(?:'m| am) majoring in)\s+(?:an?\s+)?(?:engineering and management science|engineering management science)\s+major\b/i, "Engineering and Management Science"],
    [/\b(?:i(?:'m| am)|my major is|i(?:'m| am) majoring in)\s+(?:a\s+)?(?:renewable energy(?: systems engineering)?)\s+major\b/i, "Renewable Energy Systems Engineering"],
  ];
  for (const [pattern, major] of patterns) if (pattern.test(userText)) return major;
  return null;
}

function withoutStanding(value: string): string {
  return value.replace(/(?:\s*,\s*|\s+and\s+)?\b(?:freshman|sophomore|junior|senior)(?:\s+or\s+(?:freshman|sophomore|junior|senior))*\s+(?:classification|standing)\b/gi, "").trim();
}

function compactRequirements(value: unknown): unknown {
  if (typeof value === "string") return withoutStanding(value);
  if (Array.isArray(value)) return value.map(compactRequirements);
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const compact: Record<string, unknown> = {};
  // Requirement section keys (for example commonCore, majorCore, and
  // concentrations) carry the actual degree map, so preserve them as well as
  // the nested course/group fields.
  for (const [key, child] of Object.entries(source)) {
    if (child !== undefined && child !== null) compact[key] = compactRequirements(child);
  }
  return compact;
}

function coursePrerequisitesMet(course: { prerequisite_courses?: string[]; prerequisites?: string[]; prerequisite_raw?: string | null; prerequisiteNotes?: string | null }, completedCodes: Set<string>): boolean {
  const prerequisites = (course.prerequisite_courses ?? course.prerequisites ?? []).map((code) => code.replace(/\s+/g, "").toUpperCase());
  if (!prerequisites.length) return true;
  const raw = withoutStanding(course.prerequisite_raw ?? course.prerequisiteNotes ?? "");
  const pathways = raw.split(/;\s*or\s+/i);
  if (pathways.length > 1) {
    const groups = pathways.map((pathway) =>
      prerequisites.filter((code) => pathway.replace(/\s+/g, "").toUpperCase().includes(code))
    );
    if (groups.every((group) => group.length)) {
      return groups.some((group) => group.every((code) => completedCodes.has(code)));
    }
  }
  if (!/\bor\b/i.test(raw)) return prerequisites.every((code) => completedCodes.has(code));

  const clauses = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (clauses.length === 1) {
    const parentheticalAlternatives = raw.match(/^\s*([A-Z]{2,5}\s*\d{4})\s*\(\s*or\s+((?:[A-Z]{2,5}\s*\d{4}\s*(?:or\s+)?)*)\)\s*$/i);
    if (parentheticalAlternatives) return prerequisites.some((code) => completedCodes.has(code));
    const alternatives = raw.split(/\bor\b/i);
    const choices = alternatives.map((clause) => prerequisites.filter((code) => clause.replace(/\s+/g, "").toUpperCase().includes(code)));
    if (choices.every((choice) => choice.length === 1) && !/\band\b/i.test(raw)) {
      return choices.some(([code]) => completedCodes.has(code));
    }
    return prerequisites.every((code) => completedCodes.has(code));
  }
  return clauses.every((clause) => {
    const normalizedClause = clause.replace(/\s+/g, "").toUpperCase();
    const mentioned = prerequisites.filter((code) => normalizedClause.includes(code));
    if (!mentioned.length) return true;
    return /\bor\b/i.test(clause)
      ? mentioned.some((code) => completedCodes.has(code))
      : mentioned.every((code) => completedCodes.has(code));
  });
}

function getCatalogMinorDefinitions(programs: DegreeRequirementNode[]) {
  // Minor requirements live in the catalog's program sheets, and each sheet can
  // list minors offered by other schools. Merge all sheets so students can be
  // matched against the whole catalog regardless of their major's own sheet.
  const definitions = new Map<string, { name: string; sourceProgram: string; sourceCatalog: string; node: unknown; year: number }>();
  for (const program of programs) {
    const minorRoot = program.requirements.minors as { groups?: Record<string, unknown> } | null;
    for (const [name, node] of Object.entries(minorRoot?.groups ?? {})) {
      const key = normalizeText(name);
      const year = Number(program.catalog.match(/\d{4}/)?.[0] ?? 0);
      const existing = definitions.get(key);
      if (!existing || year > existing.year) {
        definitions.set(key, { name, sourceProgram: program.name, sourceCatalog: program.catalog, node, year });
      }
    }
  }
  return [...definitions.values()];
}

function parseExplicitScheduleDetails(message: string): { daysOfWeek: number[]; startTime: string; endTime: string } {
  const text = message.toLowerCase();
  const days = new Set<number>();
  const dayPattern = /\b(mwf|mw|wf|tth|tr|tuesdays?|tues?|thursdays?|thurs?|mondays?|mons?|wednesdays?|weds?|fridays?|fris?)\b/gi;
  for (const match of text.matchAll(dayPattern)) {
    const token = match[0].toLowerCase();
    if (token === "mwf") [1, 3, 5].forEach((day) => days.add(day));
    else if (token === "mw") [1, 3].forEach((day) => days.add(day));
    else if (token === "wf") [3, 5].forEach((day) => days.add(day));
    else if (token === "tth" || token === "tr") [2, 4].forEach((day) => days.add(day));
    else if (/^mon/.test(token)) days.add(1);
    else if (/^tue/.test(token)) days.add(2);
    else if (/^wed/.test(token)) days.add(3);
    else if (/^thu/.test(token)) days.add(4);
    else if (/^fri/.test(token)) days.add(5);
  }
  if (/\bt\s+(?:from\s+)?\d{1,2}:\d{2}/i.test(message)) days.add(2);

  const timeRange = text.match(/(?:from\s+)?\b(\d{1,2}):(\d{2})\s*(am|pm)?\s*(?:to|until|[-\u2012-\u2015\u2212])\s*(\d{1,2}):(\d{2})(?!\d)\s*(am|pm)?/i);
  if (!timeRange) return { daysOfWeek: [...days], startTime: "", endTime: "" };
  const to24h = (hourText: string, minuteText: string | undefined, periodText?: string) => {
    const rawHour = Number(hourText);
    if (rawHour > 23 || (periodText && (rawHour < 1 || rawHour > 12)) || Number(minuteText) > 59) return "";
    const hour = periodText ? rawHour % 12 + (periodText.toLowerCase() === "pm" ? 12 : 0) : rawHour;
    return `${String(hour).padStart(2, "0")}:${minuteText ?? "00"}`;
  };
  const period = timeRange[3] ?? timeRange[6];
  return {
    daysOfWeek: [...days],
    startTime: to24h(timeRange[1], timeRange[2], period),
    endTime: to24h(timeRange[4], timeRange[5], timeRange[6] ?? period),
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.NVIDIA_API_KEY;

  let body: { message?: string; history?: { role: "user" | "assistant"; content: string }[]; studentContext?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message || message.length > 4000) {
    return NextResponse.json({ error: "Enter a message under 4,000 characters." }, { status: 400 });
  }

  let studentData: { profile?: { major?: string | null; minor?: string | null }; careerSummary?: { cumulativeGpa?: number; cumulativeQualityPoints?: number; cumulativeGpaCredits?: number; totalCareerCredits?: number; gradingScale?: { grade: string; points: number | null }[] }; currentSemester?: { term: string; year: number; courses?: { code: string; title?: string; credits?: number; grade?: string | null }[] } | null; plannedSemesters?: { term: string; year: number; courses?: { code: string; credits?: number; grade?: string | null }[] }[]; completedSemesters?: { term?: string; year?: number; courses?: { code: string; credits?: number; grade?: string | null }[] }[] } = {};
  try { studentData = JSON.parse(body.studentContext ?? "{}"); } catch {}
  if (!apiKey) {
    return NextResponse.json({ error: "Advisor is not configured. Add NVIDIA_API_KEY to .env.local and restart the app." }, { status: 503 });
  }
  const degreePrograms = getDegreePrograms();
  const history = (body.history ?? []).slice(-10).filter((item) =>
    (item.role === "user" || item.role === "assistant") && typeof item.content === "string"
  ).map(({ role, content }) => ({ role, content: content.slice(0, 4000) }));
  const statedMajor = inferMajorFromConversation(history, message);
  const effectiveMajor = studentData.profile?.major?.trim() || statedMajor;
  const degreeProgram = matchDegreeProgram(effectiveMajor, degreePrograms);
  const catalogMinorDefinitions = getCatalogMinorDefinitions(degreePrograms);
  const savedSemesters = [...(studentData.completedSemesters ?? []), ...(studentData.plannedSemesters ?? [])];
  const completedCodes = savedSemesters.flatMap((semester) => semester.courses ?? [])
    .filter((course) => course.grade && !["F", "W", "I", "NG", "WIP"].includes(course.grade.toUpperCase()))
    .map((course) => course.code);
  const completedCodeSet = new Set(completedCodes.map((code) => code.replace(/\s+/g, "").toUpperCase()));
  const completedCoursesForContext = completedCodes;
  const allPlannedCoursesForContext = (studentData.plannedSemesters ?? []).flatMap((semester) =>
    (semester.courses ?? []).filter(({ grade }) => grade?.toUpperCase() !== "W")
      .map((course) => ({ term: semester.term, year: semester.year, code: course.code }))
  );
  const advisorStudentContext = {
    ...studentData,
    courseStatusForPlanning: {
      currentSemester: studentData.currentSemester
        ? { term: studentData.currentSemester.term, year: studentData.currentSemester.year, courses: studentData.currentSemester.courses ?? [] }
        : null,
      otherPlannedCourses: allPlannedCoursesForContext,
      completedCourses: completedCoursesForContext,
      doNotRecommendAgain: [...new Set([...completedCoursesForContext, ...allPlannedCoursesForContext.map((course) => course.code)])],
    },
  };
  const minorRequirementContext = catalogMinorDefinitions.map(({ name, sourceProgram, sourceCatalog, node }) => ({
    name, sourceProgram, sourceCatalog, requirements: compactRequirements(node),
  }));
  const degreeContext = degreeProgram ? {
    program: degreeProgram.program,
    name: degreeProgram.name,
    catalogYear: degreeProgram.catalog,
    totalCredits: degreeProgram.totalCredits,
    requirements: compactRequirements(degreeProgram.requirements),
  } : null;

  const catalog = getCatalog().courses;
  const courseKey = (code: string) => code.replace(/\s+/g, "").toUpperCase();
  const termPattern = /\b(spring|summer|fall)\s+(20\d{2})\b/i;
  const current = studentData.currentSemester;
  const nextRegularTerm = current
    ? `${current.term === "fall" ? "spring" : "fall"} ${current.year + (current.term === "fall" ? 1 : 0)}`
    : "";
  const targetTerm = message.match(termPattern)
    ?? [...history].reverse().filter((item) => item.role === "user").map((item) => item.content.match(termPattern)).find(Boolean)
    ?? nextRegularTerm.match(termPattern);
  const termOrder = { spring: 0, summer: 1, fall: 2 } as const;
  const termIndex = (term: string, year: number) => year * 3 + termOrder[term.toLowerCase() as keyof typeof termOrder];
  const targetIndex = targetTerm ? termIndex(targetTerm[1], Number(targetTerm[2])) : undefined;
  const earlierCourses = new Map(
    current && targetIndex !== undefined && termIndex(current.term, current.year) < targetIndex
      ? (current.courses ?? []).filter(({ grade }) => !grade || grade.toUpperCase() === "WIP").map(({ code }) => [courseKey(code), code] as const)
      : []
  );
  const projectedCodes = new Set([...completedCodeSet, ...earlierCourses.keys()]);
  const unavailable = new Set([
    ...completedCodes,
    ...allPlannedCoursesForContext.map(({ code }) => code),
    ...(studentData.currentSemester?.courses ?? []).filter(({ grade }) => grade?.toUpperCase() !== "W").map(({ code }) => code),
  ].map(courseKey));
  const planningAreas = new Map<string, Set<string>>();
  const chooseOneGroups = new Map<string, Set<string>>();
  function indexRequirements(value: unknown, area: string, section?: string) {
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    const label = typeof node.label === "string" ? node.label : section;
    if (label && node.choose === 1 && Array.isArray(node.courses)) {
      chooseOneGroups.set(label, new Set(node.courses.flatMap((course) =>
        typeof course?.code === "string" ? [courseKey(course.code)] : []
      )));
    }
    if (typeof node.code === "string") {
      const key = courseKey(node.code);
      const areas = planningAreas.get(key) ?? new Set<string>();
      areas.add(area);
      if (label) areas.add(label);
      planningAreas.set(key, areas);
    }
    for (const child of Object.values(node)) indexRequirements(child, area, label);
  }
  indexRequirements(degreeProgram?.requirements.majorCore, "Major core");
  indexRequirements(degreeProgram?.requirements.commonCore, "Common core");
  indexRequirements(degreeProgram?.requirements.generalEducation, "General education");
  const minorName = normalizeText(studentData.profile?.minor ?? "");
  const economicsRestriction = JSON.stringify(degreeProgram?.requirements.generalEducation ?? {})
    .includes("This course is designed only for students that are NOT majoring or minoring in Business Administration");
  if (economicsRestriction && [minorName, normalizeText(effectiveMajor ?? "")]
    .some((name) => ["businessadministration", "humanresourcedevelopment", "humanresourcesdevelopment"].includes(name))) {
    planningAreas.delete("ECO1300");
  }
  for (const minor of catalogMinorDefinitions) {
    if (normalizeText(minor.name) === minorName) indexRequirements(minor.node, "Declared minor");
  }
  const planningCandidates = catalog.flatMap((course) => {
    const key = courseKey(course.code);
    const areas = planningAreas.get(key);
    if (!areas || unavailable.has(key) || [...chooseOneGroups.values()].some((group) =>
      group.has(key) && [...group].some((code) => completedCodeSet.has(code) || earlierCourses.has(code))
    ) || !coursePrerequisitesMet(course, projectedCodes)
      || /capstone|internship/i.test(course.title)) return [];
    const needed = new Set(projectedCodes);
    for (const priorCode of earlierCourses.keys()) {
      if (completedCodeSet.has(priorCode)) continue;
      needed.delete(priorCode);
      if (!coursePrerequisitesMet(course, needed)) needed.add(priorCode);
    }
    const conditionalOn = [...earlierCourses]
      .filter(([code]) => needed.has(code) && !completedCodeSet.has(code))
      .map(([, code]) => code);
    return [{ code: course.code, title: course.title, credits: course.credits, areas: [...areas], conditionalOn }];
  });
  const eligibleByCode = new Map(planningCandidates.map((course) => [courseKey(course.code), course]));
  const courseCatalogContext = catalog.map((course) => ({
    recordedPrerequisitesMet: coursePrerequisitesMet(course, completedCodeSet),
    prerequisitesMetIfCurrentCoursesPass: coursePrerequisitesMet(course, projectedCodes),
    passedPrerequisites: course.prerequisite_courses.filter((code) => completedCodeSet.has(courseKey(code))),
    inProgressPrerequisites: course.prerequisite_courses.filter((code) => !completedCodeSet.has(courseKey(code)) && earlierCourses.has(courseKey(code))),
    alreadySaved: unavailable.has(courseKey(course.code)),
    code: course.code, title: course.title, credits: course.credits,
    prerequisites: course.prerequisite_courses, prerequisiteNotes: withoutStanding(course.prerequisite_raw ?? ""),
    corequisites: course.corequisite_courses,
    description: course.description.slice(0, 150),
  }));
  const creditPattern = /\b(\d{1,2})\s+credits?\b/i;
  const targetCredits = Number(message.match(creditPattern)?.[1]
    ?? [...history].reverse().filter((item) => item.role === "user").map((item) => item.content.match(creditPattern)?.[1]).find(Boolean) ?? 0);
  const requestsScheduleEdit = /\b(?:add|remove|save|apply)\b/i.test(message)
    || /\b(?:edit|update|change)\b[\s\S]*\b(?:times?|timings?|meetings?|schedule)\b/i.test(message)
    || /\bplan\s+(?:it|this|that|them)\b[\s\S]*\b(?:in|into|for|to)\b[\s\S]*\b(?:planned|schedule|spring|summer|fall|semester)\b/i.test(message)
    || /\b(?:put|move)\b[\s\S]*\b(?:in|into|to)\b[\s\S]*\b(?:plan(?:ned)?|schedule|semester|spring|summer|fall)\b/i.test(message);
  const requestedSubject = message.match(/\b(?:another|a different|one more)\s+([A-Z]{2,5})\s+course\b/i)?.[1]?.toUpperCase();
  const previousPlan = [...history].reverse().find((item) =>
    item.role === "assistant" && /^\*\*(?:Spring|Summer|Fall) 20\d{2}.*credits\*\*/i.test(item.content)
  );
  const previousPlanCodes = new Set(
    [...(previousPlan?.content ?? "").matchAll(/^[-*]\s+\*\*([A-Z]{2,5}\s*\d{4}(?:-L)?)\b/gm)]
      .map((match) => courseKey(match[1]))
  );
  const subjectSwap = !requestsScheduleEdit && requestedSubject && previousPlanCodes.size
    && catalog.some(({ code }) => code.split(/\s+/)[0] === requestedSubject)
    ? { subject: requestedSubject, previousCodes: [...previousPlanCodes] }
    : null;
  const dropName = message.match(/\b(?:don['’]?t want to take|drop|replace|skip)\s+([^,.!?\n]+)/i)?.[1]?.trim();
  const dropMatches = dropName ? catalog.filter((course) => previousPlanCodes.has(courseKey(course.code))
    && (courseKey(dropName) === courseKey(course.code) || course.title.toLowerCase().includes(dropName.toLowerCase()))) : [];
  const requestedDrop = dropMatches.length === 1 ? courseKey(dropMatches[0].code) : null;
  const isSemesterRequest = !requestsScheduleEdit && (subjectSwap !== null
    || /\b(?:plan|suggest|recommend|balanced|semester|courses?\s+should\s+I\s+consider)\b/i.test(message));
  const planningContext = {
    major: degreeProgram?.name ?? effectiveMajor ?? null,
    minor: studentData.profile?.minor ?? null,
    catalogYear: degreeProgram?.catalog ?? null,
    targetSemester: targetTerm ? `${targetTerm[1]} ${targetTerm[2]}` : null,
    passedCourses: completedCodes,
    currentSemester: current ?? null,
    plannedCourses: allPlannedCoursesForContext,
    subjectSwap,
  };
  const meetingLines = message.split(/\r?\n/).map((line) => ({
    ...parseExplicitScheduleDetails(line),
    name: line.split(/\b(?:MWF|MW|WF|TR|TTH|T)\s+(?=\d)/i)[0].trim(),
    title: normalizeText(line.split(/\b(?:MWF|MW|WF|TR|TTH|T)\s+(?=\d)/i)[0]),
  })).filter((line) => line.startTime);
  const selectedSemester = advisorStudentContext as { selectedScheduleSemester?: { term: string; year: number } };
  const defaultSemester = /\b(?:current|this) semester\b/i.test(message)
    ? studentData.currentSemester
    : selectedSemester.selectedScheduleSemester ?? studentData.currentSemester;
  const explicitTerm = message.match(termPattern);
  const meetingSemester = explicitTerm
    ? { term: explicitTerm[1].toLowerCase(), year: Number(explicitTerm[2]) }
    : defaultSemester;
  const savedMeetingCourses = studentData.plannedSemesters?.find((semester) =>
    semester.term === meetingSemester?.term && semester.year === meetingSemester?.year
  )?.courses ?? [];
  const isBatchMeetingEdit = requestsScheduleEdit && meetingLines.length > 1;
  const reachableCredits = new Set([0]);
  for (const { credits } of eligibleByCode.values()) {
    for (const total of [...reachableCredits]) reachableCredits.add(total + credits);
  }
  const balanceAreas = ["Major core", "Common core", "General education", "Declared minor"];
  const areaMask = (areas: string[]) => balanceAreas.reduce(
    (mask, area, index) => areas.includes(area) ? mask | (1 << index) : mask, 0
  );
  const availableMask = planningCandidates.reduce((mask, course) => mask | areaMask(course.areas), 0);
  const combinations = new Map<string, typeof planningCandidates>([["0:0", []]]);
  if (targetCredits && isSemesterRequest) {
    const candidateGroups = new Map<string, typeof planningCandidates>();
    for (const course of planningCandidates) {
      const group = [...chooseOneGroups].find(([, codes]) => codes.has(courseKey(course.code)))?.[0] ?? course.code;
      candidateGroups.set(group, [...(candidateGroups.get(group) ?? []), course]);
    }
    for (const group of candidateGroups.values()) {
      const previous = [...combinations];
      for (const course of group) for (const [key, courses] of previous) {
        const [total, mask] = key.split(":").map(Number);
        const next = total + course.credits;
        if (next <= targetCredits) {
          const nextKey = `${next}:${mask | areaMask(course.areas)}`;
          if (!combinations.has(nextKey)) combinations.set(nextKey, [...courses, course]);
        }
      }
    }
  }
  const example = combinations.get(`${targetCredits}:${availableMask}`);
  let revisionFeedback = "";
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.NVIDIA_MODEL ?? "nvidia/nemotron-3.5-bolt-e4b",
          messages: isBatchMeetingEdit ? [
            { role: "system", content: `The student wants to edit meeting times for existing courses. Match their names to these saved courses and call propose_planned_changes with one update_meeting per line. Use the saved course codes, including labs. This is a schedule edit. The recommendation list and prerequisites are irrelevant. For each change include meetingLine, the 1-based index of the matching request line. Use the review card for confirmation.\nTarget semester: ${JSON.stringify(meetingSemester)}\nSaved courses: ${JSON.stringify(savedMeetingCourses)}\nParsed meeting lines (in request order): ${JSON.stringify(meetingLines)}\n${revisionFeedback}` },
            { role: "user", content: message },
          ] : !requestsScheduleEdit && (revisionFeedback || isSemesterRequest) ? [
            { role: "system", content: `Use this saved student context: ${JSON.stringify(planningContext)}. Do not ask the student to repeat fields supplied here. A null minor means no minor is recorded and does not prevent a recommendation. Treat current courses as expected passes for future-term planning. Courses with conditionalOn may be recommended now for the target semester; state what must be passed before it starts. Answer the student's actual question using the available choices.` },
            ...(subjectSwap ? [{ role: "system", content: `Replace only the course the student wants to drop with a different ${subjectSwap.subject} course. Preserve the other courses. If no eligible replacement meets the request, explain that directly.` }] : []),
            { role: "system", content: example
              ? `An exact-credit composition covering the available subject areas exists: ${example.map(({ code }) => code).join(", ")}. Use it as a starting point. Choose and return the best eligible mix for the student.`
              : "Respect the degree categories and explain any constraint that prevents the requested subject mix." },
            { role: "system", content: `Help the student plan a semester. Use recommend_semester to return a plan. The courseCodes field must be an array of unique code strings. Only use codes from the eligible list below. Balance major core, math or science, general education, and the declared minor as requested. Do not change the schedule. If no exact total is possible, use the closest achievable credit total and explain the difference.\nIgnore legacy class-standing restrictions. Distinguish already scheduled courses from missing prerequisites. Eligible courses: ${JSON.stringify([...eligibleByCode.values()])}\nCredit totals possible before degree choice limits: ${[...reachableCredits].sort((a, b) => a - b).join(", ")}\n${revisionFeedback}` },
            ...history,
            { role: "user", content: message },
          ] : [
            { role: "system", content: `You are the Jenzabar+ student planning assistant for Al Akhawayn University. Give practical, concise advice grounded in the supplied course catalog, selected degree map, and student context. Never invent degree requirements, prerequisites, course availability, or graduation eligibility. The app supplies the student's Career page cumulative GPA, current semester courses, grades, and grading scale in Student context. Answer GPA questions from that context. For a cumulative GPA projection, use cumulativeQualityPoints and cumulativeGpaCredits from Student context, add the hypothetical term quality points and credits, and compute the weighted result. For a hypothetical semester GPA, use the courses and credits for the semester the student names, apply the supplied grading scale to their hypothetical grades, and compute the credit-weighted GPA. Do not answer a semester-specific or hypothetical GPA question with the cumulative GPA. The student's major is ${effectiveMajor ?? "not known"}. Use the supplied degree map whenever present; do not claim you lack the Computer Science requirements when the Computer Science degree map is supplied. The selected degree map is from catalog year ${degreeProgram?.catalog ?? "unknown because no matching major is set"}; explain that requirements may depend on the student's catalog year. When the student asks about GenEd, list the specific course alternatives under each category and honor choose counts. For majors/electives, use the matching program map. If no major maps to a provided program, ask which program/catalog applies rather than guessing. Minor definitions are merged from the minor requirement sections across all program catalog sheets. When discussing minors, compare the student's passed courses with the supplied minor requirement maps from all catalog program sheets. Do not count courses required by the student's major as minor evidence unless the catalog explicitly allows double-counting. Treat any inferred minor as a possibility, cite the matching courses and source catalog, and never claim it is officially declared. Use recommend_semester for semester planning advice and revisions. Schedule changes require a separate explicit request. Follow the quantity and credit target the student requests. Recommend only individual catalog courses, never category labels or placeholders such as 'Computing Elective'. Do not recommend courses from an unselected concentration/specialization. Never recommend a course already present in courseStatusForPlanning.doNotRecommendAgain unless the student explicitly asks to repeat it. Treat the entire current-semester course list as unavailable for the requested future semester. For future-term planning, use the supplied projected prerequisite evidence. Recommend eligible courses whose prerequisites are in progress in an earlier term and note which courses must be passed first. For a balanced plan, use the student's requested subject mix and declared minor, and spread recommendations across those areas instead of filling the list with one subject. Give only the requested number of courses and a short reason for each; avoid long apologies and repeated summaries. The catalog has no live offering data. Treat term availability as unknown. A local semester plan can include catalog courses regardless of whether offering data exists. Never refuse a local edit on availability grounds. A course missing from the target semester is a normal addition. Meeting days and times are optional. Call propose_planned_changes only when the student explicitly asks to modify their schedule, set a grade, or change their major/minor. An ordinary request like 'can you add Database Systems' is explicit. Call the tool directly; never ask the student to name it. For a concrete change request, immediately produce the tool proposal so the app can display its confirmation card. Never ask for separate confirmation in chat before showing the card, even if the student says not to ask for confirmation. Only propose courses present in the supplied catalog. For removals and grade changes, target courses present in the supplied schedule. Grade must be one of A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F, P, W, I, NG, WIP. Student app data (Career GPA totals, current semester, transcript, grades, and plan): ${JSON.stringify(advisorStudentContext)}\nFull local course catalog with course descriptions and prerequisite data: ${JSON.stringify(courseCatalogContext)}\nDegree map: ${JSON.stringify(degreeContext)}\nMinor requirement maps from the full catalog: ${JSON.stringify(minorRequirementContext)}\n` },
            { role: "system", content: `For every semester recommendation or revision, use recommend_semester and choose only from these eligible courses: ${JSON.stringify(planningCandidates)}. For a balanced semester, include major core, math or science, and general education when options exist, plus declared minor courses when requested. Give each area meaningful representation before adding more courses from the same area. Honor the requested credit load or course count when feasible. Use degree-map choice limits and skip already satisfied choices. Never assert prerequisite completion from earlier assistant messages. The tool is read-only. Use plain chat for other questions.` },
            { role: "system", content: "Use the latest student app snapshot as the source of truth for saved courses and grades. A course absent from that snapshot cannot be described as completed or enrolled based on chat history. Treat historical messages as conversation and preferences, never as saved records." },
            { role: "system", content: "Answer the latest user message. Treat a greeting or small talk as its own turn. For next-semester advice with no explicit term, use the next regular term after the current semester. When asked why a course is excluded, explain its actual saved-course status or prerequisite evidence, including whether a current course would make it eligible if passed. If prerequisitesMetIfCurrentCoursesPass is true and the course can be recommended for the target semester, say that it is a valid future option and mention the condition. Avoid answering solely about eligibility today. Never cite absence from the recommendation list as the reason. Resume an earlier request only if the latest message refers to it. Previous assistant replies are not evidence of tool capabilities. The schedule tool supports meeting days, start and end times, and location. For an existing course use update_meeting. For a new course use add with the meeting fields. A valid tool proposal opens the confirmation card. If the student asks to add a catalog course by code to the current semester, pass that code and the current term to the tool. The app validates prerequisites and duplicates. Catalog courses do not need to appear in the read-only recommendation list to be added." },
            { role: "system", content: "Carry the requested term, credit target, and subject mix into revisions unless the student changes them. A credit count or request for a different mix after a semester recommendation is a revision. Use recommend_semester for the revised list. Ignore legacy class-standing restrictions, including any mentioned in prior chat. When catalog prerequisites list alternative paths, one fully satisfied applicable path is enough. Use recordedPrerequisitesMet and explain the satisfied path without requiring courses from other paths." },
            ...history.filter((item) => item.role === "user" || !/\bpropose_planned_changes\b/.test(item.content)),
            { role: "system", content: "When the student asks to put the latest proposed semester in their schedule, use propose_planned_changes with the exact course list from the latest proposal and the requested term. Preserve the accepted total. Earlier recommendation targets do not apply to saving that list. Show the review card without asking again in chat." },
            ...(revisionFeedback ? [{ role: "system", content: revisionFeedback }] : []),
            { role: "user", content: message },
          ],
          temperature: 0.2,
          max_tokens: 1000,
          stream: false,
          chat_template_kwargs: { enable_thinking: false },
          tools: [{ type: "function", function: {
            name: "propose_planned_changes",
            description: "Propose the requested local schedule change for the confirmation card. An add targets a catalog course absent from the semester. No offering lookup or meeting details are required. Use update_meeting for an existing course and add for a new course. When a title matches several codes, prefer the eligible match relevant to the major or minor. Use recordedPrerequisitesMet and ask which code if multiple matches remain plausible. Both support daysOfWeek (Monday=1 through Friday=5), startTime and endTime (HH:mm), and location. Use currentSemester for a request about the current term. Use selectedScheduleSemester when the student refers to the semester open in Schedule. Also supports explicit grade and profile edits.",
            parameters: {
              type: "object",
              properties: { changes: { type: "array", minItems: 1, maxItems: 8, items: { type: "object", properties: { action: { type: "string", enum: ["add", "remove", "update_meeting", "set_grade", "set_major", "set_minor"] }, term: { type: "string", enum: ["fall", "spring", "summer"] }, year: { type: "integer", minimum: 2020, maximum: 2040 }, code: { type: "string" }, grade: { type: "string" }, value: { type: "string" }, daysOfWeek: { type: "array", items: { type: "integer", minimum: 1, maximum: 5 } }, startTime: { type: "string" }, endTime: { type: "string" }, location: { type: "string" }, meetingLine: { type: "integer", minimum: 1, description: "1-based index for a batch meeting edit" } }, required: ["action"], additionalProperties: false } } },
              required: ["changes"], additionalProperties: false,
            },
          } }, { type: "function", function: {
            name: "recommend_semester",
            description: "Show a semester recommendation in chat without modifying the schedule.",
            parameters: {
              type: "object",
              properties: {
                termLabel: { type: "string", description: "Semester, for example Spring 2027" },
                courseCodes: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true },
              },
              required: ["termLabel", "courseCodes"],
              additionalProperties: false,
            },
          } }],
          tool_choice: "auto",
        }),
        signal: AbortSignal.timeout(45_000),
      });

      if (!response.ok) {
        console.error("NVIDIA advisor request failed", response.status, await response.text());
        return NextResponse.json({ error: [401, 403].includes(response.status) ? "NVIDIA rejected the Advisor credentials. Check the local API key." : response.status === 429 ? "The model is busy or rate limited. Try again shortly." : "The advisor could not reach the model. Try again shortly." }, { status: 502 });
      }

      const data = await response.json();
      const assistantMessage = data.choices?.[0]?.message;
      const recommendation = assistantMessage?.tool_calls?.find((call: { function?: { name?: string } }) => call.function?.name === "recommend_semester");
      const printedCall = typeof assistantMessage?.content === "string"
        ? assistantMessage.content.match(/\brecommend_semester\s*\(\s*termLabel\s*=\s*("(?:[^"\\]|\\.)*")\s*,\s*courseCodes\s*=\s*(\[[^\]]*\])\s*\)/)
        : null;
      if (recommendation || printedCall) {
        if (requestsScheduleEdit) {
          revisionFeedback = "The student asked to save the existing plan. Use propose_planned_changes with the latest accepted course list. Do not generate a new recommendation.";
          continue;
        }
        let selection;
        try {
          selection = recommendation
            ? JSON.parse(recommendation.function.arguments)
            : { termLabel: JSON.parse(printedCall![1]), courseCodes: JSON.parse(printedCall![2]) };
        } catch { selection = null; }
        const codes: unknown[] = Array.isArray(selection?.courseCodes) ? selection?.courseCodes : [];
        const courses = codes.map((code) => typeof code === "string" ? eligibleByCode.get(courseKey(code)) : undefined);
        if (!courses.length || courses.some((course) => !course) || new Set(courses).size !== courses.length) {
          revisionFeedback = `The previous attempt used missing, repeated, or ineligible codes: ${JSON.stringify(codes)}. Select unique codes from the eligible list using recommend_semester. If you cannot meet the request, explain the constraint without inventing courses.`;
          continue;
        }
        const selected = courses.filter((course) => course !== undefined);
        if (subjectSwap) {
          const newCourses = selected.filter((course) => !previousPlanCodes.has(courseKey(course.code)));
          if (selected.length !== previousPlanCodes.size || newCourses.length !== 1
            || newCourses[0].code.split(/\s+/)[0] !== subjectSwap.subject
            || (requestedDrop && selected.some((course) => courseKey(course.code) === requestedDrop))) {
            revisionFeedback = `Keep the other courses and make exactly one substitution with a new ${subjectSwap.subject} course. If no eligible substitution exists, explain why.`;
            continue;
          }
        }
        if ([...chooseOneGroups.values()].some((group) => selected.filter((course) => group.has(courseKey(course.code))).length > 1)) {
          revisionFeedback = "The previous selection used multiple courses from a choose-one requirement. Use different requirement groups.";
          continue;
        }
        const credits = selected.reduce((sum, course) => sum + course.credits, 0);
        const closestDistance = targetCredits
          ? Math.min(...[...reachableCredits].filter((total) => total > 0).map((total) => Math.abs(total - targetCredits)))
          : 0;
        if (targetCredits && Math.abs(credits - targetCredits) > closestDistance) {
          revisionFeedback = `The previous recommendation totaled ${credits} credits. Select eligible courses that add to ${targetCredits} credits with the requested subject mix, or explain why you could not reach the target.`;
          continue;
        }
        if (/\bbalanced\b/i.test(message) && selected.length >= 3) {
          const missingAreas = ["Major core", "Common core", "General education"].filter((area) =>
            planningCandidates.some((course) => course.areas.includes(area)) &&
            !selected.some((course) => course.areas.includes(area))
          );
          if (missingAreas.length) {
            revisionFeedback = `The previous selection omitted these areas with eligible options: ${missingAreas.join(", ")}. Include a course from each missing area while keeping the requested total.`;
            continue;
          }
        }
        const label = targetTerm
          ? `${targetTerm[1][0].toUpperCase()}${targetTerm[1].slice(1).toLowerCase()} ${targetTerm[2]}`
          : typeof selection.termLabel === "string" ? selection.termLabel.replace(/[\r\n]/g, " ").slice(0, 60) : "Semester";
        const rows = selected.map((course) => {
          const condition = course.conditionalOn.length ? ` · Requires passing ${course.conditionalOn.join(", ")} before this term` : "";
          return `- **${course.code} — ${course.title}** (${course.credits} cr) · ${course.areas.join(", ")}${condition}`;
        });
        const creditNote = targetCredits && credits !== targetCredits
          ? `\n\nThe closest total I could validate is ${credits} credits (target: ${targetCredits}).`
          : "";
        return NextResponse.json({ answer: `**${label} · ${credits} credits**\n\n${rows.join("\n")}${creditNote}\n\nCheck course offerings before registering.` });
      }
      const toolCall = assistantMessage?.tool_calls?.find((call: { function?: { name?: string } }) => call.function?.name === "propose_planned_changes");
      if (toolCall) {
        let requested: { changes: ProposedChange[] };
        try { requested = JSON.parse(toolCall.function.arguments); }
        catch { return NextResponse.json({ answer: assistantMessage.content || "I couldn't prepare a valid change proposal. Please try again." }); }
        let planned: { term: string; year: number; courses: { code: string; title?: string; credits?: number; daysOfWeek?: number[]; startTime?: string; endTime?: string; location?: string }[] }[] = [];
        try { planned = JSON.parse(body.studentContext ?? "{}").plannedSemesters ?? []; } catch {}
        const normalizedCatalog = new Map(catalog.map((course) => [course.code.replace(/\s+/g, "").toUpperCase(), course]));
        const explicitDetails = parseExplicitScheduleDetails(message);
        const usedMeetingLines = new Set<number>();
        const validGrades = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F", "P", "W", "I", "NG", "WIP"];
        if (!Array.isArray(requested?.changes)) return NextResponse.json({ error: "The Advisor returned an invalid schedule proposal." }, { status: 502 });
        const prerequisiteFailures = new Set<string>();
        const changes = requested.changes.slice(0, 8).flatMap<Record<string, unknown>>((change) => {
          if (!change || typeof change !== "object") return [];
          if (change.action === "update_meeting" && !message.match(termPattern) && defaultSemester) {
            const { term, year } = defaultSemester;
            if (term === "spring" || term === "summer" || term === "fall") change = { ...change, term, year };
          }
          if (/\b(?:current|this) semester\b/i.test(message) && studentData.currentSemester && (change.action === "add" || change.action === "update_meeting")) {
            const { term, year } = studentData.currentSemester;
            if (term === "spring" || term === "summer" || term === "fall") change = { ...change, term, year };
          }
          if (change.action === "set_major" || change.action === "set_minor") {
            const value = change.value?.trim();
            return value ? [{ action: change.action, value: value.slice(0, 80) }] : [];
          }
          if (change.action === "set_grade") {
            if (!change.term || !["fall", "spring", "summer"].includes(change.term) || !Number.isInteger(change.year) || !change.code || !change.grade || !validGrades.includes(change.grade.toUpperCase())) return [];
            const courseCode = change.code.replace(/\s+/g, "").toUpperCase();
            const inSchedule = planned.some((semester) => semester.term === change.term && semester.year === change.year && semester.courses.some((item) => item.code.replace(/\s+/g, "").toUpperCase() === courseCode));
            let inHistory = false;
            try { inHistory = (JSON.parse(body.studentContext ?? "{}").completedSemesters ?? []).some((semester: { term: string; year: number; courses: { code: string }[] }) => semester.term === change.term && semester.year === change.year && semester.courses.some((item) => item.code.replace(/\s+/g, "").toUpperCase() === courseCode)); } catch {}
            if (!inSchedule && !inHistory) return [];
            return [{ action: change.action, term: change.term, year: change.year, code: change.code, grade: change.grade.toUpperCase() }];
          }
          if ((change.action !== "add" && change.action !== "remove" && change.action !== "update_meeting") || !change.term || !["fall", "spring", "summer"].includes(change.term) || !Number.isInteger(change.year) || (change.year ?? 0) < 2020 || (change.year ?? 0) > 2040 || !change.code) return [];
          const key = courseKey(change.code);
          const inPlan = planned.find((semester) => semester.term === change.term && semester.year === change.year)?.courses.find((item) => courseKey(item.code) === key);
          const course = normalizedCatalog.get(key) ?? (inPlan ? {
            code: inPlan.code, title: inPlan.title ?? inPlan.code, credits: inPlan.credits ?? 0,
            prerequisite_courses: [], prerequisite_raw: null,
          } : undefined);
          if (!course) return [];
          if ((change.action === "remove" || change.action === "update_meeting") && !inPlan) return [];
          const conditionalOn = change.action === "add" && !inPlan && targetIndex !== undefined
            && termIndex(change.term, Number(change.year)) === targetIndex
            ? eligibleByCode.get(courseKey(course.code))?.conditionalOn ?? []
            : [];
          if (change.action === "add" && !inPlan && !conditionalOn.length && !coursePrerequisitesMet(course, completedCodeSet)) {
            prerequisiteFailures.add(`${course.code} (${course.title}): ${withoutStanding(course.prerequisite_raw ?? "") || course.prerequisite_courses.join(", ")}`);
            return [];
          }
          const modelDays = Array.isArray(change.daysOfWeek) ? [...new Set(change.daysOfWeek.filter((day) => Number.isInteger(day) && day >= 1 && day <= 5))] : [];
          const validStart = typeof change.startTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(change.startTime) ? change.startTime : "";
          const validEnd = typeof change.endTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(change.endTime) ? change.endTime : "";
          let details = explicitDetails;
          if (meetingLines.length > 1) {
            const names = [course.title, inPlan?.title ?? "", course.code].map(normalizeText).filter(Boolean);
            const namedIndex = meetingLines.findIndex((line, i) => !usedMeetingLines.has(i) && names.includes(line.title));
            const mappedIndex = Number.isInteger(change.meetingLine) ? Number(change.meetingLine) - 1 : -1;
            const index = namedIndex >= 0 ? namedIndex : mappedIndex >= 0 ? mappedIndex : meetingLines.findIndex((line, i) => !usedMeetingLines.has(i)
              && line.startTime === validStart && line.endTime === validEnd);
            if (index === -1 || usedMeetingLines.has(index) || !meetingLines[index]?.daysOfWeek.length) return [];
            details = meetingLines[index];
            usedMeetingLines.add(index);
          }
          if (change.action === "add" && inPlan && !(modelDays.length || details.daysOfWeek.length || details.startTime || validStart || change.location)) return [];
          return [{ action: change.action === "add" && inPlan ? "update_meeting" : change.action, term: change.term, year: change.year, code: course.code, title: course.title, credits: course.credits, conditionalOn, daysOfWeek: details.daysOfWeek.length ? details.daysOfWeek : modelDays.length ? modelDays : inPlan?.daysOfWeek ?? [], startTime: details.startTime || validStart || inPlan?.startTime || "", endTime: details.endTime || validEnd || inPlan?.endTime || "", location: typeof change.location === "string" ? change.location.slice(0, 80) : inPlan?.location ?? "" }];
        });
        if (changes.length && changes.length === requested.changes.length
          && (meetingLines.length <= 1 || changes.length === meetingLines.length)) {
          return NextResponse.json({ answer: "", proposal: changes });
        }
        if (meetingLines.length > 1) {
          revisionFeedback = `Prepare one update_meeting change per line (${meetingLines.length} total). Match the names to exact codes in the saved semester, including imported labs missing from the course catalog. Keep each line's own days and 24-hour time range. T alone is Tuesday; TR is Tuesday and Thursday.`;
          continue;
        }
        if (prerequisiteFailures.size) return NextResponse.json({ answer: `Your saved grades don't satisfy the catalog prerequisites for the selected course:\n\n${[...prerequisiteFailures].map((item) => `- ${item}`).join("\n")}` });
        return NextResponse.json({ error: "The Advisor could not validate the schedule change. Check the target course, semester, and any prerequisites." }, { status: 422 });
      }
      const answer = assistantMessage?.content;
      if (isBatchMeetingEdit && savedMeetingCourses.length && attempt < 2) {
        revisionFeedback = "The saved course list above contains the course codes. Use the schedule tool to create the review card.";
        continue;
      }
      if (typeof answer !== "string" || !answer.trim()) throw new Error("Model returned an empty answer");
      if (/\brecommend_semester\s*\(/.test(answer)) {
        revisionFeedback = "The previous reply printed an unreadable tool call. Return the semester selection through the recommend_semester tool.";
        continue;
      }
      const proposedCodes = new Set(
        [...answer.matchAll(/(?:^|\n)\s*(?:[-*]\s+|\d+[.)]\s+)?\*{0,2}([A-Z]{2,5}\s*\d{4})\b/g)]
          .map((match) => courseKey(match[1]))
      );
      if (requestsScheduleEdit && proposedCodes.size > 1 && /\b(?:plan|recommend|suggest|semester|credits)\b/i.test(answer)) {
        revisionFeedback = "The student asked to save the prior list. Repeating the list in chat cannot create a review card. Use propose_planned_changes with the prior courses and requested term.";
        continue;
      }
      if (proposedCodes.size > 1 && /\b(?:plan|recommend|suggest|semester|credits)\b/i.test(answer)
        && [...proposedCodes].some((code) => !eligibleByCode.has(code))) {
        revisionFeedback = "The previous reply listed ineligible courses in chat. Use recommend_semester with unique course codes from the eligible list, or explain which constraint prevents a valid recommendation.";
        continue;
      }
      return NextResponse.json({ answer: answer.trim() });
    }
    return NextResponse.json({ answer: requestsScheduleEdit
      ? "I couldn't prepare a review card for the selected courses."
      : "I couldn't assemble a validated semester with those constraints from the eligible courses in your current record." });
  } catch (error) {
    console.error("NVIDIA advisor error", error);
    return NextResponse.json({ error: "The model did not return a usable response. Please try again." }, { status: 502 });
  }
}
