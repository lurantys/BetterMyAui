import catalog from "../../data/catalog/aui_catalog_data.json";
import bacs from "../../public/assets/degree requirements/bacs.json";
import bais from "../../public/assets/degree requirements/bais.json";
import bba from "../../public/assets/degree requirements/bba.json";
import bscsc from "../../public/assets/degree requirements/bscsc.json";
import bsems from "../../public/assets/degree requirements/bsems.json";
import bsge from "../../public/assets/degree requirements/bsge.json";
import bsrese from "../../public/assets/degree requirements/bsrese.json";
import { coursePrerequisitesMet, withoutStanding } from "./prerequisites";
import { courseKey, semesterLimits, semesterLoad } from "./semester-load";

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
  mode?: "earlier" | "balanced";
  maxCourses?: number;
  includeSummer?: boolean;
  maxSummerTerms?: number;
  includeFrench?: boolean;
  preferences?: string;
  targetFinish?: TermDate;
  variation?: number;
};
export type DegreePlanSettings = Pick<PlannerInput, "mode" | "maxCourses" | "targetSemesters" | "targetFinish" | "includeSummer" | "maxSummerTerms" | "includeFrench" | "specialization">;
type RequirementCourse = { details?: string; code?: string; title?: string; credits?: number; requirement?: string; courses?: RequirementCourse[] };
type Group = {
  forProgram?: string;
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
  const minorName = normalize(input.minor ?? "");
  const minorDefinitions = [
    ...Object.entries(program.requirements.minors?.groups ?? {}),
    ...programs.flatMap(({ requirements }) => Object.entries(requirements.minors?.groups ?? {})),
  ];
  const usedMinor = minorDefinitions.find(([name, definition]) => normalize(name) === minorName
    && (!definition.forProgram || definition.forProgram === program.program))?.[1];

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
          && (minorName !== "businessadministration" || key !== "ECO1300")
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
    .flatMap((term) => term.courses.filter(({ grade }) => pending(grade) && grade?.toUpperCase() !== "I"))
    .filter(({ code }) => !completed.has(courseKey(code))));
  return { completed, current };
}

function degreeCredits(courses: ReadonlyMap<string, StudentCourse>) {
  return [...courses].reduce((sum, [key, course]) => sum + (nonDegree.test(key) ? 0 : course.credits), 0);
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
  const earnedCredits = degreeCredits(completed);
  const assumedPlacementCredits = placement?.credits ?? 0;
  const attemptingCredits = degreeCredits(new Map([...current].filter(([key]) => !credited.has(key))));
  return {
    program: program.name, catalog: program.catalog, totalCredits: program.totalCredits,
    earnedCredits, attemptingCredits, assumedPlacementCredits,
    projectedCredits: earnedCredits + attemptingCredits + assumedPlacementCredits,
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

export type PlanTerm = TermDate & {
  courses: PlanCourse[];
  credits: number;
  counted: number;
  projectedCredits: number;
  remainingRequirements: number;
};
export type DegreePlan = {
  label: string;
  terms: PlanTerm[];
  remaining: string[];
  review: string[];
  finish: string | null;
  projectedCredits: number;
  peakCredits: number;
  peakCourses: number;
  withinTarget: boolean;
  canSave: boolean;
};

export type DegreePlanEdit =
  | { action: "move"; code: string; term: Term; year: number }
  | { action: "replace"; code: string; replacementCode: string };

const capstoneKey = "EGR4402";
const internshipKey = "EGR4300";

export function reviseDegreePlan(input: PlannerInput, plan: DegreePlan, edits: DegreePlanEdit[], deadline: string, now = currentTerm()): DegreePlan {
  const { program, courses, slots, issues } = assemble(input);
  const internshipRequired = slots.some((slot) => slot.keys.has(internshipKey));
  const { completed, current } = collect(input, now);
  const nowIndex = termIndex(now);
  const starting = new Map([...completed, ...current]);
  const placement = frenchPlacementCredit(input, slots, completed);
  if (placement) starting.set("FRN3210", placement);
  const original = new Map(starting);
  const terms = new Map<number, { date: TermDate; selected: Map<string, Course> }>();
  const saved = new Map<string, { index: number; course: StudentCourse }>();
  for (const term of input.semesters.filter((term) => termIndex(term) > nowIndex)) {
    for (const course of term.courses.filter(({ grade }) => passed(grade) || pending(grade))) {
      saved.set(courseKey(course.code), { index: termIndex(term), course });
    }
  }
  const locations = new Map<string, number>();
  for (const term of plan.terms) {
    const index = termIndex(term);
    if (!Number.isInteger(index) || index <= nowIndex || terms.has(index)) throw new Error("The previous draft has stale or duplicate terms. Generate a fresh draft.");
    const selected = new Map<string, Course>();
    for (const { code } of term.courses) {
      const key = courseKey(code);
      const course = courses.get(key);
      const locked = saved.get(key);
      if (!course || locations.has(key) || (locked && locked.index !== index) || (starting.has(key) && starting.get(key) !== placement)) {
        throw new Error("The previous draft no longer matches Career. Generate a fresh draft.");
      }
      const record = locked ? { ...course, ...locked.course } : course;
      locations.set(key, index);
      selected.set(key, record);
      original.set(key, record);
    }
    terms.set(index, { date: { term: term.term, year: term.year }, selected });
  }
  if ([...saved.keys()].some((key) => !locations.has(key))) throw new Error("Career has saved courses missing from this draft. Generate a fresh draft.");

  for (const edit of edits) {
    const key = courseKey(edit.code);
    const index = locations.get(key);
    const origin = index === undefined ? undefined : terms.get(index);
    const course = origin?.selected.get(key);
    if (!origin || !course || index === undefined) throw new Error(`${edit.code} is absent from the draft.`);
    if (saved.has(key)) throw new Error(`${course.code} is already saved in Career. Edit its saved semester to move it.`);
    if (edit.action === "replace") {
      const replacementKey = courseKey(edit.replacementCode);
      const replacement = courses.get(replacementKey);
      if (replacementKey === key) continue;
      if (!replacement || starting.has(replacementKey) || locations.has(replacementKey)) {
        throw new Error(`${edit.replacementCode} is unavailable or already accounted for.`);
      }
      origin.selected.delete(key);
      locations.delete(key);
      origin.selected.set(replacementKey, replacement);
      locations.set(replacementKey, index);
    } else {
      const target = termIndex(edit);
      if (!Number.isInteger(target) || target <= nowIndex) throw new Error("Choose a future term for the move.");
      if (target === index) continue;
      const destination = terms.get(target) ?? { date: { term: edit.term, year: edit.year }, selected: new Map<string, Course>() };
      origin.selected.delete(key);
      destination.selected.set(key, course);
      locations.set(key, target);
      terms.set(target, destination);
    }
  }

  const known = new Map(starting);
  const creditTarget = Array.isArray(program.totalCredits) ? Math.min(...program.totalCredits) : program.totalCredits;
  let finish: TermDate | undefined;
  const revised: PlanTerm[] = [];
  const balanced = input.mode === "balanced";
  const finalTerm = Math.max(...[...terms].filter(([, { selected }]) => selected.size).map(([index]) => index));
  const capstoneTerm = locations.get(capstoneKey);
  if (capstoneTerm !== undefined && capstoneTerm !== finalTerm) {
    throw new Error(`Capstone Design must be in the final planned semester, ${formatTerm(fromIndex(finalTerm))}.`);
  }
  if (input.includeSummer && input.maxSummerTerms !== undefined) {
    const savedSummerCount = new Set([...saved.values()].map(({ index }) => index)
      .filter((index) => fromIndex(index).term === "summer")).size;
    const summerCount = [...terms.values()].filter(({ date, selected }) => date.term === "summer" && selected.size > 0).length;
    if (summerCount > Math.max(input.maxSummerTerms, savedSummerCount)) {
      throw new Error(`That change would exceed your limit of ${input.maxSummerTerms} summer terms.`);
    }
  }
  for (const [, { date, selected }] of [...terms].sort(([a], [b]) => a - b)) {
    if (!selected.size) continue;
    const load = semesterLoad([...selected.values()]);
    const limits = semesterLimits(date.term);
    const countCap = date.term === "summer" ? limits.counted : Math.min(limits.counted, input.maxCourses ?? limits.counted);
    if (load.counted > countCap || load.credits > limits.credits
      || (balanced && date.term !== "summer" && (load.credits < 12 || load.credits > 17))) {
      throw new Error(`That change would put ${formatTerm(date)} outside your selected workload limits.`);
    }
    const previous = new Set(known.keys());
    const together = new Set([...previous, ...selected.keys()]);
    for (const [key, item] of selected) {
      if (key === capstoneKey && internshipRequired && !previous.has(internshipKey)) {
        throw new Error("Internship must be completed in an earlier semester before Capstone Design.");
      }
      if (!saved.has(key) && ((key === "EGR4300" && date.term !== "fall")
        || (!input.includeFrench && isFrench(key)) || (date.term === "summer" && !input.includeSummer))) {
        throw new Error(`${item.code} cannot be planned in ${formatTerm(date)} with your current settings.`);
      }
      if (!prerequisitesMet(item, previous, !input.includeFrench) || !corequisitesMet(item, together)) {
        if (key === internshipKey && !previous.has("ENG2303")) {
          throw new Error(`Internship in ${formatTerm(date)} requires completing ENG 2303 in an earlier semester.`);
        }
        throw new Error(`${item.code} would have unmet prerequisites or corequisites in ${formatTerm(date)}.`);
      }
      known.set(key, item);
    }
    const projectedCredits = degreeCredits(known);
    const remainingRequirements = slots.length - match(slots, known).size;
    revised.push({ ...date, ...load, projectedCredits, remainingRequirements, courses: [...selected.values()].map(
      ({ code, title, credits, prerequisite_courses }) => ({ code, title, credits, prerequisite_courses })) });
    if (!finish && !remainingRequirements && projectedCredits >= creditTarget && !issues.length) finish = date;
  }

  const covered = match(slots, known);
  const projectedCredits = degreeCredits(known);
  if ([...match(slots, original).keys()].some((index) => !covered.has(index))
    || projectedCredits < Math.min(creditTarget, degreeCredits(original))) {
    throw new Error("That replacement would leave a degree requirement or the credit minimum unmet. Try another course.");
  }
  const remaining = [...new Set(slots.flatMap((slot, index) => covered.has(index) ? [] : [slot.label]))];
  if (projectedCredits < creditTarget) remaining.push(`${creditTarget - projectedCredits} credits short of the catalog total`);
  const [targetTerm, targetYear] = deadline.toLowerCase().split(" ");
  const targetIndex = termIndex({ term: targetTerm as Term, year: Number(targetYear) });
  return { ...plan, terms: revised, remaining, projectedCredits, finish: finish ? formatTerm(finish) : null,
    withinTarget: !!finish && termIndex(finish) <= targetIndex, canSave: true,
    review: [...new Set([...plan.review.filter((note) => !note.includes("The planner could not fill this term further")),
      ...issues, "Confirm future course offerings and any required approvals."])],
    peakCredits: Math.max(0, ...revised.map(({ credits }) => credits)),
    peakCourses: Math.max(0, ...revised.map(({ counted }) => counted)) };
}

export function moveDegreeCourse(input: PlannerInput, plan: DegreePlan, edit: Extract<DegreePlanEdit, { action: "move" }>, deadline: string, now = currentTerm()) {
  if (courseKey(edit.code) === internshipKey && termIndex(edit) > termIndex(now)) {
    if (edit.term !== "fall") throw new Error("Internship is planned for Fall. Choose a Fall semester.");
    const { completed, current } = collect(input, now);
    const englishBeforeInternship = completed.has("ENG2303") || current.has("ENG2303") || plan.terms.some((term) =>
      termIndex(term) < termIndex(edit) && term.courses.some(({ code }) => courseKey(code) === "ENG2303"));
    if (!englishBeforeInternship) throw new Error(`Internship in ${formatTerm(edit)} requires completing ENG 2303 in an earlier semester.`);
  }
  try {
    return reviseDegreePlan(input, plan, [edit], deadline, now);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("workload limits")) throw error;
    const source = plan.terms.find((term) => term.courses.some(({ code }) => courseKey(code) === courseKey(edit.code)));
    const target = plan.terms.find((term) => termIndex(term) === termIndex(edit));
    if (!source || !target) throw error;
    const alternatives = [...target.courses].sort((a, b) => a.credits - b.credits);
    for (const other of alternatives) {
      try {
        return reviseDegreePlan(input, plan, [edit, { action: "move", code: other.code, term: source.term, year: source.year }], deadline, now);
      } catch (candidateError) {
        if (!(candidateError instanceof Error)) throw candidateError;
      }
    }
    throw new Error(`${error.message} I couldn't make room by swapping a course back to ${formatTerm(source)}.`);
  }
}

export function increaseDegreeTermLoad(input: PlannerInput, plan: DegreePlan, requested: TermDate, from: TermDate | undefined, deadline: string, now = currentTerm()) {
  const index = termIndex(requested);
  const target = plan.terms.find((term) => termIndex(term) === index);
  if (!target || index <= termIndex(now)) throw new Error("Choose a future semester from the draft to make heavier.");
  const limits = semesterLimits(requested.term);
  const cap = input.mode === "balanced" && requested.term !== "summer" ? 17 : limits.credits;
  if (target.credits >= cap) throw new Error(`${formatTerm(target)} already has its maximum of ${cap} credits.`);
  const others = plan.terms.filter((term) => termIndex(term) !== index && (!from || termIndex(term) === termIndex(from)));
  for (const source of [...others].reverse()) {
    for (const course of [...source.courses].sort((a, b) => b.credits - a.credits)) {
      try {
        const result = moveDegreeCourse(input, plan, { action: "move", code: course.code, term: requested.term, year: requested.year }, deadline, now);
        const updated = result.terms.find((term) => termIndex(term) === index);
        if (updated && updated.credits > target.credits) return result;
      } catch (error) {
        if (!(error instanceof Error)) throw error;
      }
    }
  }
  throw new Error(`I couldn't move an eligible course into ${formatTerm(target)} while keeping both terms within your workload limits and preserving prerequisites.`);
}

export function placeDegreeElective(input: PlannerInput, plan: DegreePlan, requested: TermDate & { code: string; swapWith?: string }, deadline: string, now = currentTerm()): DegreePlan {
  const { slots } = assemble(input);
  const key = courseKey(requested.code);
  const origin = plan.terms.find((term) => term.courses.some((course) => courseKey(course.code) === key));
  const target = plan.terms.find((term) => termIndex(term) === termIndex(requested));
  const planned = plan.terms.flatMap((term) => term.courses.map((course) => ({ ...course, term: term.term, year: term.year })));
  const currentIndex = termIndex(now);
  const saved = new Set(input.semesters.filter((term) => termIndex(term) > currentIndex)
    .flatMap((term) => term.courses.map(({ code }) => courseKey(code))));
  const choiceGroups = slots.filter((slot) => slot.keys.size > 1 && slot.keys.has(key))
    .sort((a, b) => a.keys.size - b.keys.size);
  const matchesSameChoice = choiceGroups.filter((slot) => slot.keys.size === choiceGroups[0]?.keys.size);
  const replacements = origin ? [{ code: requested.code, term: origin.term, year: origin.year }]
    : planned.filter(({ code }) => !saved.has(courseKey(code))
      && matchesSameChoice.some((slot) => slot.keys.has(courseKey(code))));
  if (!replacements.length) throw new Error(`I couldn't identify a draft elective that ${requested.code} can replace.`);

  const namedCourse = requested.swapWith ? courseKey(requested.swapWith) : null;
  const namedDisplacement = namedCourse === capstoneKey && !target?.courses.some(({ code }) => courseKey(code) === capstoneKey)
    ? null : namedCourse;
  const targetCourses = target?.courses.filter(({ code }) => courseKey(code) !== key && !saved.has(courseKey(code))) ?? [];
  const displaced = namedDisplacement ? targetCourses.filter(({ code }) => courseKey(code) === namedDisplacement) : targetCourses;
  const finalTerm = plan.terms.at(-1);
  for (const replacement of replacements) {
    const edits: DegreePlanEdit[] = origin ? [] : [{ action: "replace", code: replacement.code, replacementCode: requested.code }];
    edits.push({ action: "move", code: requested.code, term: requested.term, year: requested.year });
    const moveCapstoneLast: DegreePlanEdit[] = finalTerm && !saved.has(capstoneKey)
      && planned.some((course) => courseKey(course.code) === capstoneKey && termIndex(course) !== termIndex(finalTerm))
      ? [{ action: "move", code: "EGR 4402", term: finalTerm.term, year: finalTerm.year }] : [];
    const attempts = [...(namedDisplacement ? [] : [edits]), ...displaced.map((course) => [
      ...edits,
      { action: "move" as const, code: course.code, term: replacement.term, year: replacement.year },
    ])];
    for (const attempt of attempts) {
      try {
        return reviseDegreePlan(input, plan, [...attempt, ...moveCapstoneLast], deadline, now);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
      }
    }
  }
  throw new Error(`I couldn't fit ${requested.code} into ${formatTerm(requested)} by swapping courses while preserving requirements, prerequisites, and semester limits.`);
}

export function makeDegreePlans(input: PlannerInput, preferredCodes: string[] = [], now = currentTerm()) {
  const { program, courses, slots, issues } = assemble(input);
  const { completed, current } = collect(input, now);
  const nowIndex = termIndex(now);
  const target = input.targetSemesters ?? 8;
  const balancedRequested = input.mode === "balanced";
  const internshipRequired = slots.some((slot) => slot.keys.has(internshipKey));
  const limitsFor = (term: Term) => {
    const limits = semesterLimits(term);
    return term === "summer" ? limits : { ...limits, counted: Math.min(limits.counted, input.maxCourses ?? limits.counted) };
  };
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
  const savedSummerCount = [...saved].filter(([index, courses]) => fromIndex(index).term === "summer" && courses.size).length;
  const preferred = new Set(preferredCodes.map(courseKey));
  const variationOrder = new Map<string, number>();
  if (input.variation !== undefined) {
    for (const key of courses.keys()) {
      let hash = input.variation;
      for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
      variationOrder.set(key, hash >>> 0);
    }
  }
  const creditTarget = Array.isArray(program.totalCredits) ? Math.min(...program.totalCredits) : program.totalCredits;
  const placement = frenchPlacementCredit(input, slots, completed);
  const starting = new Map([...completed, ...current]);
  if (placement) starting.set("FRN3210", placement);
  const canTake = (course: Course, previous: Set<string>) =>
    (!internshipRequired || courseKey(course.code) !== capstoneKey || previous.has(internshipKey))
    && prerequisitesMet(course, previous, !input.includeFrench);
  const limit = Math.max(nowIndex + 30, Math.min(deadline + 6, nowIndex + 66), ...saved.keys());
  const allowsSuggestion = (key: string) => input.includeFrench === true || !isFrench(key);
  const options = slots.map((slot) => [...slot.keys].filter((key) => courses.has(key) && allowsSuggestion(key)));
  const exact = new Set(options.filter((keys) => keys.length === 1).flat());

  const earliestMin = 17;
  const balancedMin = 12;
  const balancedMax = 17;
  function draft(balanced: boolean, workloadDeadline = deadline, balancedCap = balancedMax, summerCap = Infinity): DegreePlan {
    const known = new Map(starting);
    const scheduled: { date: TermDate; selected: Map<string, Course> }[] = [];
    const blockers = new Set<string>();
    const newSummerLimit = Math.max(0, Math.min(summerCap, input.maxSummerTerms ?? Infinity) - savedSummerCount);
    let scheduledSummers = 0;
    for (let index = nowIndex + 1; index <= limit; index++) {
      const date = fromIndex(index);
      const limits = limitsFor(date.term);
      const locked = saved.get(index);
      if (date.term === "summer" && (!input.includeSummer || scheduledSummers >= newSummerLimit) && !locked?.size) continue;
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
      const softLimit = balanced && date.term !== "summer"
        ? Math.min(balancedCap, regularLeft > 1 ? Math.max(balancedMin, Math.ceil((creditTarget - degreeCredits(known)) / regularLeft) + 1) : balancedCap)
        : limits.credits;
      const weights = new Map<string, number>();
      function score(key: string, weight: number, visited = new Set<string>()) {
        if (!allowsSuggestion(key) || previous.has(key) || visited.has(key)) return;
        visited.add(key);
        weights.set(key, (weights.get(key) ?? 0) + weight);
        const course = courses.get(key);
        if (!course || canTake(course, previous)) return;
        const prerequisites = course.prerequisite_courses.map(courseKey);
        if (key === capstoneKey && internshipRequired) prerequisites.push(internshipKey);
        const missing = prerequisites.filter((code) => !previous.has(code));
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
        Number(a === capstoneKey) - Number(b === capstoneKey)
        || (bWeight + (preferred.has(b) ? 15 : 0)) - (aWeight + (preferred.has(a) ? 15 : 0))
        || (courses.get(a)?.credits ?? 0) - (courses.get(b)?.credits ?? 0)
        || (variationOrder.get(a) ?? 0) - (variationOrder.get(b) ?? 0) || a.localeCompare(b));
      // Internship is normally presented in Fall, following the summer placement.
      const fitsTerm = (key: string) => key !== "EGR4300" || date.term === "fall";
      let filled = match(slots, new Map([...futureReserved, ...selected])).size;
      for (const [key, weight] of ranking) {
        const course = courses.get(key);
        if (!course || !fitsTerm(key) || previous.has(key) || selected.has(key) || reserved.has(key) || !canTake(course, previous)) continue;
        const bundle = new Map([[key, course]]);
        const together = new Set([...previous, ...selected.keys(), key]);
        function addCorequisites(item: Course): boolean {
          if (corequisitesMet(item, together)) return true;
          for (const code of item.corequisite_courses.map(courseKey)) {
            if (together.has(code)) continue;
            const companion = courses.get(code);
            if (!allowsSuggestion(code) || !fitsTerm(code) || !companion || reserved.has(code) || !canTake(companion, previous)) return false;
            bundle.set(code, companion);
            together.add(code);
            if (!addCorequisites(companion)) return false;
            if (corequisitesMet(item, together)) return true;
          }
          return corequisitesMet(item, together);
        }
        if (!addCorequisites(course)) continue;
        const load = semesterLoad([...selected.values(), ...bundle.values()]);
        if (load.credits > limits.credits || load.counted > limits.counted) continue;
        if (balanced && load.credits > softLimit) continue;
        const withBundle = new Map([...futureReserved, ...selected, ...bundle]);
        const newFilled = match(slots, withBundle).size;
        if ([...bundle.keys()].includes(capstoneKey)) {
          const throughThisTerm = new Map([...known, ...selected, ...bundle]);
          const hasLaterSavedCourses = [...saved].some(([on, courses]) => on > index && courses.size > 0);
          if (hasLaterSavedCourses || match(slots, throughThisTerm).size < slots.length) continue;
        }
        if (newFilled <= filled && weight <= 32) continue;
        for (const [code, item] of bundle) {
          selected.set(code, item);
        }
        filled = newFilled;
      }
      if (!selected.size) continue;
      if (date.term === "summer" && !locked?.size) scheduledSummers++;
      const load = semesterLoad([...selected.values()]);
      if (load.credits > limits.credits || load.counted > limits.counted) {
        blockers.add(`${formatTerm(date)} exceeds the semester load limits in the saved schedule.`);
      }
      const together = new Set([...previous, ...selected.keys()]);
      for (const [code, course] of selected) {
        if (!corequisitesMet(course, together)) blockers.add(`${course.code} (${formatTerm(date)}): corequisites are unmet.`);
        known.set(code, course);
      }
      scheduled.push({ date, selected });
    }

    if (!blockers.size) {
      function prerequisitesStayValid(omitted?: string) {
        const previous = new Set(starting.keys());
        return scheduled.every(({ selected }) => {
          const retained = [...selected].filter(([key]) => key !== omitted);
          const together = new Set([...previous, ...retained.map(([key]) => key)]);
          const valid = retained.every(([, course]) => canTake(course, previous) && corequisitesMet(course, together));
          for (const [key] of retained) previous.add(key);
          return valid;
        });
      }

      const minimumCredits = Math.min(creditTarget, degreeCredits(known));
      const originalCoverage = match(slots, known);
      const removable = scheduled.flatMap(({ date, selected }) => [...selected.keys()].flatMap((key) =>
        reserved.has(key) ? [] : [{ date, selected, key }]));
      removable.sort((a, b) => Number(preferred.has(a.key)) - Number(preferred.has(b.key))
        || termIndex(b.date) - termIndex(a.date));
      for (const { selected, key } of removable) {
        const reduced = new Map(known);
        reduced.delete(key);
        if (degreeCredits(reduced) < minimumCredits) continue;
        const coverage = match(slots, reduced);
        if ([...originalCoverage.keys()].some((index) => !coverage.has(index))) continue;

        if (!prerequisitesStayValid(key)) continue;
        selected.delete(key);
        known.delete(key);
      }

      if (!balanced && scheduled.length > 1) {
        // Fill gaps left by pruning without adding credits or moving saved classes.
        const last = termIndex(scheduled[scheduled.length - 1].date);
        const byTerm = new Map(scheduled.map((semester) => [termIndex(semester.date), semester]));
        for (let index = nowIndex + 1; index < last; index++) {
          const date = fromIndex(index);
          if (!byTerm.has(index) && (date.term !== "summer" || (input.includeSummer && input.maxSummerTerms === undefined))) {
            scheduled.push({ date, selected: new Map() });
          }
        }
        scheduled.sort((a, b) => termIndex(a.date) - termIndex(b.date));
        for (const [index, target] of scheduled.entries()) {
          for (const source of scheduled.slice(index + 1)) {
            for (const [key, course] of [...source.selected]) {
              if (reserved.has(key) || (key === "EGR4300" && target.date.term !== "fall")) continue;
              if (key === capstoneKey && (source.selected.size > 1 || scheduled.slice(index + 1).some(
                (semester) => semester !== source && semester.selected.size > 0))) continue;
              const load = semesterLoad([...target.selected.values(), course]);
              const limits = limitsFor(target.date.term);
              if (load.credits > limits.credits || load.counted > limits.counted) continue;

              source.selected.delete(key);
              target.selected.set(key, course);
              if (!prerequisitesStayValid()) {
                target.selected.delete(key);
                source.selected.set(key, course);
              }
            }
          }
        }
      }

      const creditsFor = (selected: Map<string, Course>) => semesterLoad([...selected.values()]).credits;
      const creditsBeforeFinish = new Map(starting);
      const finishIndex = scheduled.findIndex(({ selected }) => {
        for (const [key, course] of selected) creditsBeforeFinish.set(key, course);
        return degreeCredits(creditsBeforeFinish) >= creditTarget && match(slots, creditsBeforeFinish).size === slots.length;
      });
      const beforeFinish = finishIndex < 0 ? scheduled : scheduled.slice(0, finishIndex + 1);
      const targetUnits = (term: Term) => term === "summer"
        ? semesterLimits(term).counted
        : balanced ? balancedMin : semesterLimits(term).credits;
      const units = (term: Term, load: ReturnType<typeof semesterLoad>) => term === "summer" ? load.counted : load.credits;

      function fitsLoad(term: Term, load: ReturnType<typeof semesterLoad>) {
        const limits = limitsFor(term);
        const cap = balanced && term !== "summer" ? balancedMax : limits.credits;
        return load.credits <= cap && load.counted <= limits.counted;
      }

      function movable(key: string, term: Term) {
        return !reserved.has(key) && key !== capstoneKey && (key !== "EGR4300" || term === "fall");
      }

      function fillFrom(target: typeof scheduled[number], source: typeof scheduled[number]) {
        const targetTerm = target.date.term;
        const sourceTerm = source.date.term;
        const targetBefore = semesterLoad([...target.selected.values()]);
        const sourceBefore = semesterLoad([...source.selected.values()]);
        const movesRegularWorkForward = !balanced && targetTerm !== "summer" && sourceTerm !== "summer"
          && termIndex(target.date) < termIndex(source.date);
        const donorFloor = !balanced && targetTerm === "summer" && sourceTerm !== "summer"
          ? earliestMin : targetUnits(sourceTerm);
        const sourceFloor = movesRegularWorkForward ? 0 : Math.min(units(sourceTerm, sourceBefore), donorFloor);

        for (const [key, course] of [...source.selected]) {
          if (!movable(key, targetTerm)) continue;
          const returns = [undefined, ...[...target.selected].filter(([code]) => movable(code, sourceTerm))];
          for (const returned of returns) {
            const targetAfter = semesterLoad([...target.selected].flatMap(([code, item]) => code === returned?.[0] ? [] : [item]).concat(course));
            const sourceAfter = semesterLoad([...source.selected].flatMap(([code, item]) => code === key ? [] : [item]).concat(returned ? [returned[1]] : []));
            const gained = units(targetTerm, targetAfter) - units(targetTerm, targetBefore);
            const makesRoom = targetTerm === "summer" && gained === 0 && targetAfter.credits < targetBefore.credits;
            if ((!makesRoom && gained <= 0) || units(sourceTerm, sourceAfter) < sourceFloor
              || !fitsLoad(targetTerm, targetAfter) || !fitsLoad(sourceTerm, sourceAfter)) continue;

            source.selected.delete(key);
            target.selected.set(key, course);
            if (returned) {
              target.selected.delete(returned[0]);
              source.selected.set(...returned);
            }
            if (prerequisitesStayValid()) return true;
            target.selected.delete(key);
            source.selected.set(key, course);
            if (returned) {
              source.selected.delete(returned[0]);
              target.selected.set(...returned);
            }
          }
        }
        return false;
      }

      const targets = [...beforeFinish].sort((a, b) => Number(b.date.term === "summer") - Number(a.date.term === "summer"));
      for (const target of targets) {
        const term = target.date.term;
        if (!target.selected.size) continue;
        const sources = (balanced && term !== "summer" ? beforeFinish : [...beforeFinish].reverse()).filter((source) => source !== target);
        while (units(term, semesterLoad([...target.selected.values()])) < targetUnits(term)) {
          if (!sources.some((source) => fillFrom(target, source))) break;
        }
      }

      // Skip a short optional summer if its courses can fit in already active terms.
      for (const source of beforeFinish) {
        if (source.date.term !== "summer" || !source.selected.size
          || semesterLoad([...source.selected.values()]).counted >= targetUnits("summer")
          || [...source.selected.keys()].some((key) => reserved.has(key))) continue;
        const moving = [...source.selected];
        const destinations = beforeFinish.filter((term) => term !== source && term.selected.size > 0);
        let attemptsLeft = 1200;
        function placeRemaining(index: number): boolean {
          if (index === moving.length) return prerequisitesStayValid();
          const [key, course] = moving[index];
          for (const target of destinations) {
            if (attemptsLeft-- <= 0) return false;
            if (!movable(key, target.date.term) || !fitsLoad(target.date.term, semesterLoad([...target.selected.values(), course]))) continue;
            target.selected.set(key, course);
            if (placeRemaining(index + 1)) return true;
            target.selected.delete(key);
          }
          return false;
        }
        source.selected.clear();
        if (!placeRemaining(0)) {
          for (const [key, course] of moving) source.selected.set(key, course);
        }
      }

      if (balanced) {
        // A short final term can disappear if its courses fit together in another term.
        for (const source of scheduled) {
          if (source.date.term === "summer" || !source.selected.size || creditsFor(source.selected) >= balancedMin
            || [...source.selected.keys()].some((key) => key === capstoneKey || reserved.has(key))) continue;
          const moving = [...source.selected];
          for (const target of scheduled) {
            if (target === source || !target.selected.size
              || (source.selected.has("EGR4300") && target.date.term !== "fall")) continue;
            const load = semesterLoad([...target.selected.values(), ...source.selected.values()]);
            const limits = limitsFor(target.date.term);
            if (load.credits > limits.credits || load.counted > limits.counted
              || (target.date.term !== "summer" && (load.credits < balancedMin || load.credits > balancedMax))) continue;
            source.selected.clear();
            for (const [key, course] of moving) target.selected.set(key, course);
            if (prerequisitesStayValid()) break;
            for (const [key, course] of moving) {
              target.selected.delete(key);
              source.selected.set(key, course);
            }
          }
        }
      }
    }

    const terms: PlanTerm[] = [];
    const review = new Set(issues);
    const standing = new Set<string>();
    const retained = new Map(starting);
    let coverageTerm: TermDate | undefined = match(slots, retained).size === slots.length && degreeCredits(retained) >= creditTarget ? now : undefined;
    for (const { date, selected } of scheduled) {
      if (!selected.size) continue;
      const load = semesterLoad([...selected.values()]);
      const shortSummer = date.term === "summer" && load.counted < semesterLimits("summer").counted;
      const lightRegular = date.term !== "summer" && load.credits < (balanced ? balancedMin : earliestMin);
      if (shortSummer || lightRegular) {
        const workload = shortSummer ? `${load.counted} counted courses` : `${load.credits} credits`;
        review.add(`${formatTerm(date)} has ${workload}. The planner could not fill this term further within the remaining requirements, prerequisites, and load limits.`);
      }
      for (const [code, course] of selected) {
        retained.set(code, course);
        if (course.catalogOnly) review.add(`${course.code}: verify prerequisites and offering details for this degree-map entry.`);
        const recorded = course.prerequisite_raw ?? "";
        const raw = withoutStanding(recorded);
        if (raw !== recorded.trim()) standing.add(course.code);
        if (/placement|approval|consent|permission|equivalent|minimum|grade|clearance|completion|or higher|test|credits?\s+(?:earned|hours?)/i.test(raw)
          || /internship|capstone|special topics/i.test(course.title)) {
          review.add(`${course.code}: confirm any placement, approval, or other catalog conditions.`);
        }
        if (/^(?:ARB|ARA|FRN)/.test(code) && !reserved.has(code)) review.add(`${course.code}: confirm language placement or exemption.`);
      }
      const projectedCredits = degreeCredits(retained);
      const remainingRequirements = slots.length - match(slots, retained).size;
      terms.push({ ...date, ...load, projectedCredits, remainingRequirements, courses: [...selected.values()].map(({ code, title, credits, prerequisite_courses }) => ({
        code, title, credits, prerequisite_courses,
      })) });
      if (!coverageTerm && !remainingRequirements && projectedCredits >= creditTarget) coverageTerm = date;
    }
    if (standing.size) review.add(`Confirm class standing for ${[...standing].join(", ")}.`);
    if (terms.some((term, index) => index < terms.length - 1
      && term.courses.some(({ code }) => courseKey(code) === capstoneKey))) {
      blockers.add("Capstone Design is saved before the final planned semester. Move it to the final term in Career.");
    }
    const final = match(slots, retained);
    const remaining = [...new Set(slots.flatMap((slot, index) => final.has(index) ? [] : [slot.label]))];
    const projectedCredits = degreeCredits(retained);
    if (projectedCredits < creditTarget) remaining.push(`${creditTarget - projectedCredits} credits short of the catalog total`);
    remaining.push(...blockers);
    const finishTerm = !remaining.length && !issues.length ? coverageTerm : undefined;
    return {
      label: balanced ? "Balanced workload" : "Graduate sooner",
      terms,
      remaining,
      projectedCredits,
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
  const balancedDrafts = balancedRequested ? [balancedMax, 16, 15].flatMap((cap) =>
    [nowIndex, balancingDeadline, balancingDeadline + 3].flatMap((targetTerm) =>
      (input.includeSummer ? [Infinity, 1, 0] : [0]).map((summerCap) => draft(true, targetTerm, cap, summerCap)))) : [];
  const shortSummers = (plan: DegreePlan) => plan.terms.filter(({ term, counted }) =>
    term === "summer" && counted < semesterLimits(term).counted).length;
  const usesSummer = (plan: DegreePlan) => plan.terms.some(({ term }) => term === "summer");
  const balanced = balancedDrafts.filter((plan) => plan.terms.length > 0 && plan.remaining.length <= earlier.remaining.length
    && plan.terms.every(({ term, credits, counted }) => {
      const limits = limitsFor(term);
      return counted <= limits.counted && (term === "summer" ? credits <= limits.credits : credits >= balancedMin && credits <= balancedMax);
    }))
    .sort((a, b) => Number(!!b.finish) - Number(!!a.finish)
      || a.remaining.length - b.remaining.length
      || shortSummers(a) - shortSummers(b)
      || (input.includeSummer ? Number(usesSummer(b)) - Number(usesSummer(a)) : 0)
      || termIndex(a.terms.at(-1)!) - termIndex(b.terms.at(-1)!)
      || a.projectedCredits - b.projectedCredits || a.peakCredits - b.peakCredits)[0];
  const selected = balancedRequested ? balanced : earlier;
  const plans = selected ? [selected] : [];
  return {
    plans,
    deadline: formatTerm(fromIndex(deadline)),
    assumptions: "Assumes current and planned courses are passed. Future course offerings are unverified. The draft preserves saved future courses."
      + (input.includeFrench ? "" : " French placement credit is assumed when French courses are excluded.")
      + (input.includeSummer && input.maxSummerTerms !== undefined && savedSummerCount > input.maxSummerTerms
        ? ` Career already has ${savedSummerCount} summer terms, so this draft keeps them and adds no new summers.` : "")
      + (balancedRequested && !balanced ? " No balanced draft could satisfy the 12 to 17 regular-term credit range with your course limit, requirements, and saved semesters." : ""),
  };
}
