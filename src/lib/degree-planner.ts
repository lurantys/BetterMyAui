import catalog from "../../data/catalog/aui_catalog_data.json";
import bacs from "../../public/assets/degree requirements/bacs.json";
import bais from "../../public/assets/degree requirements/bais.json";
import bba from "../../public/assets/degree requirements/bba.json";
import bscsc from "../../public/assets/degree requirements/bscsc.json";
import bsems from "../../public/assets/degree requirements/bsems.json";
import bsge from "../../public/assets/degree requirements/bsge.json";
import bsrese from "../../public/assets/degree requirements/bsrese.json";
import { coursePrerequisitesMet, withoutStanding } from "./prerequisites";
import { courseKey, MAX_COUNTED_COURSES, MAX_SEMESTER_CREDITS, semesterLoad } from "./semester-load";

export type Term = "spring" | "summer" | "fall";
export type TermDate = { term: Term; year: number };
export type StudentCourse = { code: string; credits: number; grade?: string | null; title?: string };
export type StudentTerm = TermDate & { courses: StudentCourse[] };
export type PlannerInput = {
  major: string;
  minor?: string | null;
  specialization?: string;
  semesters: StudentTerm[];
  targetSemesters?: number;
  includeSummer?: boolean;
  includeFrench?: boolean;
  preferences?: string;
  targetFinish?: TermDate;
};
type RequirementCourse = { details?: string; code?: string; title?: string; credits?: number; requirement?: string; courses?: RequirementCourse[] };
type Group = {
  label: string;
  courses?: RequirementCourse[];
  groups?: Record<string, Group>;
  choose?: number;
  minimumCredits?: number;
  credits?: number | number[] | null;
  rule?: string;
  notes?: string[];
  options?: string[];
};
type Program = { program: string; name: string; catalog: string; totalCredits: number | number[]; requirements: Record<string, Group | null> };
export type PlanCourse = { code: string; title: string; credits: number; prerequisite_courses: string[] };
type Course = PlanCourse & {
  prerequisite_raw: string | null;
  corequisite_courses: string[];
  corequisite_raw: string | null;
  level?: string;
  catalogOnly?: boolean;
};
type Slot = { label: string; keys: Set<string>; credits?: number; rules?: string };
const programs: Program[] = [bacs, bais, bba, bscsc, bsems, bsge, bsrese];
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const passed = (grade?: string | null) => !!grade && /^(?:[ABCD][+-]?|P)$/i.test(grade);
const pending = (grade?: string | null) => !grade || /^(?:WIP|I|NG)$/i.test(grade);
const isFrench = (key: string) => /^(?:FRN|FRE)\d/.test(key);
const nonDegree = /^(?:FAS0210|FRN(?:[012]\d{3}|3(?:[01]\d{2}|20\d)))$/;
const order: Record<Term, number> = { spring: 0, summer: 1, fall: 2 };
export const termIndex = ({ term, year }: TermDate) => year * 3 + order[term];
export const formatTerm = ({ term, year }: TermDate) => `${term[0].toUpperCase()}${term.slice(1)} ${year}`;
function fromIndex(index: number): TermDate {
  return { term: (["spring", "summer", "fall"] as const)[index % 3], year: Math.floor(index / 3) };
}
export function currentTerm(date = new Date()): TermDate {
  return { year: date.getFullYear(), term: date.getMonth() < 5 ? "spring" : date.getMonth() < 7 ? "summer" : "fall" };
}

function getProgram(major: string): Program | undefined {
  const key = normalize(major);
  return programs.find((program) => [program.program, program.name].some((value) => normalize(value) === key))
    ?? (["cs", "bscs"].includes(key) ? bscsc : undefined);
}

function codeSet(courses: StudentCourse[]) {
  return new Map(courses.map((course) => [courseKey(course.code), course]));
}

function assemble(input: PlannerInput) {
  const found = getProgram(input.major);
  if (!found) throw new Error("Select a supported major in My Career.");
  const program: Program = found;
  const courses = new Map<string, Course>(catalog.courses.map((course) => [courseKey(course.code), course]));
  // The Business Administration degree map accepts either introductory computing course for MIS 3301.
  const managementSystems = courses.get("MIS3301");
  if (managementSystems) courses.set("MIS3301", {
    ...managementSystems,
    prerequisite_raw: "MGT 3301, CSC 1300 or CSC 1401",
    prerequisite_courses: ["MGT 3301", "CSC 1300", "CSC 1401"],
  });
  const slots: Slot[] = [];
  const issues: string[] = [];
  const specializationGroup = program.requirements.concentrations;
  const specializations = Object.keys(specializationGroup?.groups ?? {}).length
    ? Object.keys(specializationGroup?.groups ?? {}) : specializationGroup?.options ?? [];
  const selected = specializations.find((name) => normalize(name) === normalize(input.specialization ?? ""));
  if (specializations.length && !selected) issues.push("Choose a specialization or concentration to include its requirements.");
  const usedMinor = input.minor
    ? programs.flatMap(({ requirements }) => Object.entries(requirements.minors?.groups ?? {}))
      .find(([name]) => normalize(name) === normalize(input.minor!))?.[1]
    : undefined;

  function addCourse(entry: RequirementCourse, group: Group) {
    if (!entry.code) return;
    const key = courseKey(entry.code);
    if (key.includes("X") || courses.has(key)) return;
    const credits = entry.credits ?? (typeof group.credits === "number" && group.choose === 1 ? group.credits : Number(key.match(/\d(\d)\d{2}$/)?.[1]));
    if (!Number.isFinite(credits)) return;
    const prerequisite = entry.details?.match(/prerequisites?\s*:\s*(.+)/i)?.[1] ?? null;
    const prerequisiteCodes = prerequisite?.match(/\b[A-Z]{2,5}\s*\d{4}(?:-L)?\b/g) ?? [];
    courses.set(key, {
      code: entry.code, title: entry.title ?? entry.code, credits,
      prerequisite_courses: prerequisiteCodes, prerequisite_raw: prerequisite, corequisite_courses: [], corequisite_raw: null,
      catalogOnly: true,
    });
  }

  function addGroup(group: Group, parent = "", free = false) {
    const label = parent ? `${parent} / ${group.label}` : group.label;
    const entries = group.courses ?? [];
    const groups = Object.values(group.groups ?? {});
    for (const entry of entries) addCourse(entry, group);
    function options(entry: RequirementCourse) {
      const code = entry.code ? courseKey(entry.code) : "";
      if (code.includes("XX")) {
        const prefix = /^CSC[34]/.test(code) ? "CSC[34]" : code.replace(/X/g, "\\d");
        return [...courses.keys()].filter((key) => new RegExp(`^${prefix}${prefix === "CSC[34]" ? "\\d{3}" : ""}$`).test(key));
      }
      return code ? [code] : [];
    }
    if (free) {
      const excluded = /^(?:FAS0|FYE|CIP|SLP)|-L$/;
      const businessExcluded = /^(?:ARB|ARA|FRN|ECO1300$|ECO2310$|(?:SSC|STA)2401$|MTH1388$)/;
      for (const entry of entries) {
        const credits = entry.credits ?? 3;
        const keys = [...courses].filter(([key, course]) => course.credits >= credits && !excluded.test(key) && !nonDegree.test(key)
          && (program.program !== "BBA" || !businessExcluded.test(key))
          && (program.program !== "BSCSC" || key !== "CSC1300")
          && course.level === "undergraduate");
        slots.push({ label, keys: new Set(keys.map(([key]) => key)), credits });
      }
    } else if (group.choose && groups.length) {
      // Placement branches require one course from the applicable pathway.
      const alternatives = groups.flatMap((child) => (child.courses ?? []).flatMap((entry) => {
        addCourse(entry, child);
        return options(entry);
      }));
      slots.push({ label, keys: new Set(alternatives), credits: typeof group.credits === "number" ? group.credits : undefined, rules: "Confirm the applicable placement pathway." });
    } else {
      if (group.choose || group.minimumCredits) {
        const count = group.choose ?? Math.ceil(group.minimumCredits! / 3);
        const keys = new Set(entries.flatMap(options));
        const credits = count === 1 && typeof group.credits === "number" ? group.credits : undefined;
        for (let i = 0; i < count; i++) slots.push({ label, keys, credits, rules: group.rule });
      } else {
        for (const entry of entries) {
          if (entry.courses) {
            for (const child of entry.courses) {
              addCourse(child, group);
              slots.push({ label, keys: new Set(options(child)) });
            }
          } else {
            slots.push({ label: entry.requirement ? `${label} / ${entry.requirement}` : label, keys: new Set(options(entry)), rules: group.rule });
          }
        }
      }
      for (const child of groups) addGroup(child, label);
    }
  }

  for (const [key, group] of Object.entries(program.requirements)) {
    if (!group || key === "minors" || key === "freeElectives" || key === "concentrations") continue;
    addGroup(group);
  }
  if (selected && specializationGroup?.groups?.[selected]) {
    addGroup(specializationGroup.groups[selected], specializationGroup.label);
  } else if (specializationGroup?.options?.length) {
    issues.push("The local map lists thematic areas without their course lists.");
  }
  if (usedMinor) addGroup(usedMinor, "Minor");
  else if (program.requirements.minors || input.minor) issues.push(input.minor
    ? `The local maps do not define the ${input.minor} minor.`
    : "Choose a minor or confirm the program’s alternate pathway with your advisor.");
  if (program.requirements.freeElectives) addGroup(program.requirements.freeElectives, "", true);

  // Reserve exact requirements before assigning shared options and free electives.
  slots.sort((a, b) => a.keys.size - b.keys.size);
  return { program, courses, slots, issues, specializations };
}

function match(slots: Slot[], available: Map<string, StudentCourse>) {
  const assigned = new Map<number, string>();
  const used = new Map<string, number>();
  function assign(index: number, visited: Set<string>): boolean {
    const slot = slots[index];
    const candidates = slot.keys.size > available.size
      ? [...available.keys()].filter((key) => slot.keys.has(key)) : slot.keys;
    for (const key of candidates) {
      const course = available.get(key);
      if (visited.has(key) || !course || course.credits < (slot.credits ?? 0)) continue;
      visited.add(key);
      const previous = used.get(key);
      if (previous !== undefined && !assign(previous, visited)) continue;
      used.set(key, index);
      assigned.set(index, key);
      return true;
    }
    return false;
  }
  for (let index = 0; index < slots.length; index++) assign(index, new Set());
  return assigned;
}

function collect(input: PlannerInput, now: TermDate) {
  const completed = codeSet(input.semesters.filter((term) => termIndex(term) <= termIndex(now))
    .flatMap((term) => term.courses.filter(({ grade }) => passed(grade))));
  const current = codeSet(input.semesters.filter((term) => termIndex(term) === termIndex(now))
    .flatMap((term) => term.courses.filter(({ grade }) => pending(grade)))
    .filter(({ code }) => !completed.has(courseKey(code))));
  return { completed, current };
}

function frenchPlacementCredit(input: PlannerInput, slots: Slot[], completed: Map<string, StudentCourse>): StudentCourse | undefined {
  if (input.includeFrench || completed.has("FRN3210") || !slots.some((slot) => slot.keys.has("FRN3210"))) return undefined;
  return { code: "FRN 3210", title: "French placement credit", credits: 2, grade: "P" };
}

export function degreeAudit(input: PlannerInput, now = currentTerm()) {
  const { program, courses, slots, issues, specializations } = assemble(input);
  const { completed, current } = collect(input, now);
  function describeCourse(key: string, recorded?: StudentCourse) {
    const catalogEntry = courses.get(key);
    const code = catalogEntry?.code ?? recorded?.code ?? key.replace(/^(\D+)(\d)/, "$1 $2");
    const title = [catalogEntry?.title, recorded?.title].find((name) => name?.trim() && courseKey(name) !== key);
    return { code, title: title ?? null };
  }
  const placement = frenchPlacementCredit(input, slots, completed);
  const credited = new Map(completed);
  if (placement) credited.set("FRN3210", placement);
  const earned = match(slots, credited);
  const projected = match(slots.map((slot, index) => earned.has(index) ? { ...slot, keys: new Set<string>() } : slot), current);
  const rows = slots.map((slot, index) => {
    const key = earned.get(index) ?? projected.get(index);
    const course = key ? (earned.has(index) ? credited : current).get(key) : undefined;
    return {
      label: slot.label, course: key && course && course !== placement ? describeCourse(key, course) : null,
      status: earned.has(index) ? "Completed" : course ? "In progress" : "Remaining",
      options: slot.keys.size <= 24 ? [...slot.keys].map((code) => describeCourse(code)) : [],
      rule: placement && course === placement ? "French placement credit assumed." : slot.rules,
    };
  });
  const allocated = new Set(earned.values());
  return {
    program: program.name, catalog: program.catalog, totalCredits: program.totalCredits,
    earnedCredits: [...completed].reduce((sum, [key, course]) => sum + (nonDegree.test(key) ? 0 : course.credits), 0),
    assumedPlacementCredits: placement?.credits ?? 0,
    rows, issues, specializations,
    unallocated: [...completed].filter(([key]) => !allocated.has(key)).map(([key, course]) => describeCourse(key, course)),
  };
}

export function additionalDegreeCourses(major: string, minor?: string | null, specialization?: string) {
  const { courses } = assemble({ major, minor, specialization, semesters: [] });
  return [...courses.values()].filter((course) => course.catalogOnly);
}

export function degreePlanChoices(input: PlannerInput, preferences: string, now = currentTerm()) {
  const { courses, slots } = assemble(input);
  const { completed, current } = collect(input, now);
  const assigned = match(slots, new Map([...completed, ...current]));
  const terms = preferences.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [];
  const byLabel = new Map<string, { code: string; title: string }[]>();
  for (const [index, slot] of slots.entries()) {
    if (assigned.has(index) || slot.keys.size < 2 || byLabel.has(slot.label)) continue;
    const options = [...slot.keys].flatMap((key) => {
      const course = courses.get(key);
      if (!course || completed.has(key) || current.has(key) || (!input.includeFrench && isFrench(key))) return [];
      const score = terms.filter((term) => course.title.toLowerCase().includes(term)).length;
      return [{ code: course.code, title: course.title, score }];
    }).sort((a, b) => b.score - a.score);
    byLabel.set(slot.label, options.slice(0, slot.keys.size > 30 ? 15 : 25).map(({ code, title }) => ({ code, title })));
  }
  return [...byLabel].map(([requirement, options]) => ({ requirement, options }));
}

function corequisitesMet(course: Course, available: Set<string>) {
  return coursePrerequisitesMet({
    prerequisite_courses: course.corequisite_courses,
    prerequisite_raw: course.corequisite_raw,
  }, available);
}

function prerequisitesMet(course: Course, previous: Set<string>, assumeFrenchPlacement: boolean) {
  // The code list is checked separately from the catalog's placement and approval notes.
  if (courseKey(course.code) === "ENG2303"
    && /all FAS courses/i.test(course.prerequisite_raw ?? "")
    && (!previous.has("FAS0210") || !previous.has("FAS1220"))) return false;
  if (courseKey(course.code) === "EGR4402"
    && (!(assumeFrenchPlacement || previous.has("FRN3210")) || ![...previous].some((code) => /^(?:ARB|ARA)/.test(code)))) return false;
  if (assumeFrenchPlacement && courseKey(course.code) === "EGR4300") {
    return coursePrerequisitesMet(course, new Set([...previous, "FRN3310"]));
  }
  return coursePrerequisitesMet(course, previous);
}

export type PlanTerm = TermDate & { courses: PlanCourse[]; credits: number; counted: number };
export type DegreePlan = {
  label: string;
  terms: PlanTerm[];
  remaining: string[];
  review: string[];
  finish: string | null;
  peakCredits: number;
  peakCourses: number;
  withinTarget: boolean;
  canSave: boolean;
};

export function makeDegreePlans(input: PlannerInput, preferredCodes: string[] = [], now = currentTerm()) {
  const { program, courses, slots, issues } = assemble(input);
  const { completed, current } = collect(input, now);
  const nowIndex = termIndex(now);
  const target = input.targetSemesters ?? 8;
  const firstRegular = Math.min(...input.semesters.filter((term) => term.term !== "summer" && termIndex(term) <= nowIndex && term.courses.length).map(termIndex),
    now.term === "summer" ? nowIndex + 1 : nowIndex);
  let deadline = firstRegular;
  for (let count = 1; count < target; count++) deadline += fromIndex(deadline).term === "fall" ? 1 : 2;
  if (input.targetFinish) deadline = termIndex(input.targetFinish);
  const saved = new Map<number, Map<string, StudentCourse>>();
  for (const term of input.semesters) {
    const index = termIndex(term);
    if (index <= nowIndex) continue;
    const existing = saved.get(index) ?? new Map();
    for (const course of term.courses.filter(({ grade }) => passed(grade) || pending(grade))) {
      existing.set(courseKey(course.code), course);
    }
    saved.set(index, existing);
  }
  const reserved = new Set([...saved.values()].flatMap((term) => [...term.keys()]));
  const preferred = new Set(preferredCodes.map(courseKey));
  const creditTarget = Array.isArray(program.totalCredits) ? Math.min(...program.totalCredits) : program.totalCredits;
  const placement = frenchPlacementCredit(input, slots, completed);
  const starting = new Map([...completed, ...current]);
  if (placement) starting.set("FRN3210", placement);
  const canTake = (course: Course, previous: Set<string>) => prerequisitesMet(course, previous, !input.includeFrench);
  const limit = Math.max(nowIndex + 30, Math.min(deadline + 6, nowIndex + 66), ...saved.keys());
  const allowsSuggestion = (key: string) => input.includeFrench === true || !isFrench(key);
  const options = slots.map((slot) => [...slot.keys].filter((key) => courses.has(key) && allowsSuggestion(key)));
  const exact = new Set(options.filter((keys) => keys.length === 1).flat());
  const gained = (known: Map<string, StudentCourse>) => [...known]
    .reduce((sum, [key, course]) => sum + (nonDegree.test(key) ? 0 : course.credits), 0);

  function draft(balanced: boolean, workloadDeadline = deadline): DegreePlan {
    const known = new Map(starting);
    const terms: PlanTerm[] = [];
    const review = new Set(issues);
    const blockers = new Set<string>();
    const suggested = new Set<string>();
    const standing = new Set<string>();
    let coverageTerm: TermDate | undefined = match(slots, known).size === slots.length && gained(known) >= creditTarget ? now : undefined;
    for (let index = nowIndex + 1; index <= limit; index++) {
      const date = fromIndex(index);
      const locked = saved.get(index);
      if (date.term === "summer" && !input.includeSummer && !locked?.size) continue;
      const assigned = match(slots, known);
      const stillNeeded = assigned.size < slots.length;
      if (!stillNeeded && ![...saved.keys()].some((key) => key >= index)) break;
      const previous = new Set(known.keys());
      const selected = new Map<string, Course>();
      for (const [key, stored] of locked ?? []) {
        const catalogCourse = courses.get(key);
        if (!catalogCourse) blockers.add(`${stored.code} (${formatTerm(date)}): prerequisite data unavailable.`);
        selected.set(key, {
          prerequisite_courses: [], prerequisite_raw: null, corequisite_courses: [], corequisite_raw: null,
          ...catalogCourse, code: stored.code, title: stored.title ?? catalogCourse?.title ?? stored.code, credits: stored.credits,
        });
        if (previous.has(key) && (!placement || known.get(key) !== placement)) blockers.add(`${stored.code} is already credited before ${formatTerm(date)}.`);
      }
      const regularLeft = Array.from({ length: Math.max(0, workloadDeadline - index + 1) }, (_, offset) => fromIndex(index + offset))
        .filter((term) => term.term !== "summer" || input.includeSummer).length;
      const softLimit = balanced && regularLeft > 1
        ? Math.min(MAX_SEMESTER_CREDITS, Math.max(12, Math.ceil((creditTarget - gained(known)) / regularLeft) + 1))
        : MAX_SEMESTER_CREDITS;
      const weights = new Map<string, number>();
      function score(key: string, weight: number, visited = new Set<string>()) {
        if (!allowsSuggestion(key) || previous.has(key) || visited.has(key)) return;
        visited.add(key);
        weights.set(key, (weights.get(key) ?? 0) + weight);
        const course = courses.get(key);
        if (!course || canTake(course, previous)) return;
        const missing = course.prerequisite_courses.map(courseKey).filter((code) => !previous.has(code));
        // For a single-course alternative path, prefer the option with the fewest missing prerequisites.
        const alternatives = missing.filter((code) => canTake(course, new Set([...previous, code])));
        const needed = alternatives.length ? alternatives.sort((a, b) =>
          Number(exact.has(b)) - Number(exact.has(a)) || (courses.get(a)?.prerequisite_courses.length ?? 99) - (courses.get(b)?.prerequisite_courses.length ?? 99)).slice(0, 1) : missing;
        for (const code of needed) score(code, weight + 18, visited);
      }
      const futureReserved = new Map(known);
      for (const [on, entries] of saved) if (on >= index) for (const [key, course] of entries) futureReserved.set(key, course);
      const afterSaved = match(slots, futureReserved);
      const broadOptions: number[] = [];
      for (let i = 0; i < slots.length; i++) {
        if (afterSaved.has(i)) continue;
        if (options[i].length > 30) {
          broadOptions.push(i);
          continue;
        }
        for (const key of options[i]) score(key, options[i].length === 1 ? 32 : 18);
      }
      for (const course of selected.values()) {
        if (!canTake(course, previous)) blockers.add(`${course.code} (${formatTerm(date)}): prerequisites are unmet in the saved schedule.`);
      }
      for (const [scheduledIndex, entries] of saved) {
        if (scheduledIndex <= index) continue;
        for (const key of entries.keys()) score(key, 14);
      }
      if (broadOptions.length) {
        const wanted = new Set(broadOptions.flatMap((i) => options[i]));
        for (const key of wanted) {
          const course = courses.get(key)!;
          if (canTake(course, previous) && !course.catalogOnly && !previous.has(key)) score(key, 3);
        }
      }
      if (!broadOptions.length && !stillNeeded) weights.clear();
      const ranking = [...weights].sort(([a, aWeight], [b, bWeight]) =>
        (bWeight + (preferred.has(b) ? 15 : 0)) - (aWeight + (preferred.has(a) ? 15 : 0)) || a.localeCompare(b));
      let filled = match(slots, new Map([...futureReserved, ...selected])).size;
      for (const [key, weight] of ranking) {
        const course = courses.get(key);
        if (!course || previous.has(key) || selected.has(key) || reserved.has(key) || !canTake(course, previous)) continue;
        const bundle = new Map([[key, course]]);
        const together = new Set([...previous, ...selected.keys(), key]);
        function addCorequisites(item: Course): boolean {
          if (corequisitesMet(item, together)) return true;
          for (const code of item.corequisite_courses.map(courseKey)) {
            if (together.has(code)) continue;
            const companion = courses.get(code);
            if (!allowsSuggestion(code) || !companion || reserved.has(code) || !canTake(companion, previous)) return false;
            bundle.set(code, companion);
            together.add(code);
            if (!addCorequisites(companion)) return false;
            if (corequisitesMet(item, together)) return true;
          }
          return corequisitesMet(item, together);
        }
        if (!addCorequisites(course)) continue;
        const load = semesterLoad([...selected.values(), ...bundle.values()]);
        if (load.credits > MAX_SEMESTER_CREDITS || load.counted > MAX_COUNTED_COURSES) continue;
        // Keep the chain moving when the balancing target is below a required bundle.
        if (load.credits > softLimit && (selected.size > 0 || weight <= 32)) continue;
        const withBundle = new Map([...futureReserved, ...selected, ...bundle]);
        const newFilled = match(slots, withBundle).size;
        if (newFilled <= filled && weight <= 32) continue;
        for (const [code, item] of bundle) {
          selected.set(code, item);
          suggested.add(code);
        }
        filled = newFilled;
      }
      if (!selected.size) continue;
      const load = semesterLoad([...selected.values()]);
      if (load.credits > MAX_SEMESTER_CREDITS || load.counted > MAX_COUNTED_COURSES) {
        blockers.add(`${formatTerm(date)} exceeds the semester load limits in the saved schedule.`);
      }
      const together = new Set([...previous, ...selected.keys()]);
      for (const [code, course] of selected) {
        if (!corequisitesMet(course, together)) blockers.add(`${course.code} (${formatTerm(date)}): corequisites are unmet.`);
        known.set(code, course);
        if (course.catalogOnly) review.add(`${course.code}: verify prerequisites and offering details for this degree-map entry.`);
        const recorded = course.prerequisite_raw ?? "";
        const raw = withoutStanding(recorded);
        if (raw !== recorded.trim()) standing.add(course.code);
        if (/placement|approval|consent|permission|equivalent|minimum|grade|clearance|completion|or higher|test|credits?\s+(?:earned|hours?)/i.test(raw)
          || /internship|capstone|special topics/i.test(course.title)) {
          review.add(`${course.code}: confirm any placement, approval, or other catalog conditions.`);
        }
        if (/^(?:ARB|ARA|FRN)/.test(code) && suggested.has(code)) review.add(`${course.code}: confirm language placement or exemption.`);
      }
      terms.push({ ...date, ...load, courses: [...selected.values()].map(({ code, title, credits, prerequisite_courses }) => ({
        code, title, credits, prerequisite_courses,
      })) });
      if (!coverageTerm && match(slots, known).size === slots.length && gained(known) >= creditTarget) coverageTerm = date;
    }
    if (standing.size) review.add(`Confirm class standing for ${[...standing].join(", ")}.`);
    const final = match(slots, known);
    const remaining = [...new Set(slots.flatMap((slot, index) => final.has(index) ? [] : [slot.label]))];
    if (gained(known) < creditTarget) remaining.push(`${creditTarget - gained(known)} credits short of the catalog total`);
    remaining.push(...blockers);
    const finishTerm = !remaining.length && !issues.length ? coverageTerm : undefined;
    return {
      label: balanced ? "Balanced workload" : "Earlier completion",
      terms,
      remaining,
      review: [...review],
      finish: finishTerm ? formatTerm(finishTerm) : null,
      peakCredits: Math.max(0, ...terms.map(({ credits }) => credits)),
      peakCourses: Math.max(0, ...terms.map(({ counted }) => counted)),
      canSave: blockers.size === 0,
      withinTarget: !!finishTerm && termIndex(finishTerm) <= deadline,
    };
  }

  const earlier = draft(false);
  const lastDraftTerm = earlier.terms.at(-1);
  const balancingDeadline = lastDraftTerm ? Math.max(deadline, termIndex(lastDraftTerm)) : deadline;
  let balanced = draft(true, balancingDeadline);
  if (balanced.peakCredits >= earlier.peakCredits && earlier.terms.length > 1) {
    const extended = draft(true, balancingDeadline + (fromIndex(balancingDeadline).term === "fall" ? 1 : 2));
    if (extended.peakCredits < balanced.peakCredits && extended.remaining.length <= balanced.remaining.length) balanced = extended;
  }
  const plans = [earlier, balanced].sort((a, b) =>
    Number(b.withinTarget) - Number(a.withinTarget)
    || Number(!!b.finish) - Number(!!a.finish)
    || (a.withinTarget && b.withinTarget ? a.peakCredits - b.peakCredits : termIndex(a.terms.at(-1) ?? now) - termIndex(b.terms.at(-1) ?? now))
    || a.remaining.length - b.remaining.length);
  return {
    plans,
    deadline: formatTerm(fromIndex(deadline)),
    assumptions: "Assumes current and planned courses are passed. Future course offerings are unverified. Both drafts preserve saved future courses." + (input.includeFrench ? "" : " French placement credit is assumed when French courses are excluded."),
  };
}
