export function withoutStanding(value: string): string {
  return value.replace(/(?:\s*,\s*|\s+and\s+)?\b(?:freshman|sophomore|junior|senior)(?:\s+or\s+(?:freshman|sophomore|junior|senior))*\s+(?:classification|standing)\b/gi, "").trim();
}

export function coursePrerequisitesMet(course: { prerequisite_courses?: string[]; prerequisites?: string[]; prerequisite_raw?: string | null; prerequisiteNotes?: string | null }, completedCodes: Set<string>): boolean {
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

  const alternativeGroups = raw.split(/\s+and\s+(?![^()]*\))/i);
  if (alternativeGroups.length > 1 && alternativeGroups.every((group) => !group.includes(",") && group.includes("(or "))) {
    const groups = alternativeGroups.map((group) =>
      prerequisites.filter((code) => group.replace(/\s+/g, "").toUpperCase().includes(code)));
    if (groups.every((group) => group.length)) return groups.every((group) => group.some((code) => completedCodes.has(code)));
  }

  const clauses = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (clauses.slice(1).every((clause) => /^or\b/i.test(clause)) && clauses.length > 1) {
    return prerequisites.some((code) => completedCodes.has(code));
  }
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
