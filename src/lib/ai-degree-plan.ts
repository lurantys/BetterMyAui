import { MAX_SUMMER_TERMS } from "./semester-load";
import { degreeAudit, degreePlanChoices, makeDegreePlans, type PlannerInput, type Term } from "./degree-planner";

export function degreePreferences(request: string) {
  const numbers = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const durationMatch = request.match(new RegExp(`\\b(\\d{1,2}|${numbers.join("|")})\\s+(?:regular\\s+)?(semesters?|years?)\\b`, "i"));
  const amount = durationMatch ? Number(durationMatch[1]) || numbers.indexOf(durationMatch[1].toLowerCase()) : 0;
  const duration = durationMatch && amount > 0 ? amount * (/^year/i.test(durationMatch[2]) ? 2 : 1) : undefined;
  const finishMatch = request.match(/\b(?:by|before|finish in|graduate in)\s+(fall|spring|summer)\s+(20\d{2})\b/i);
  const courseCount = request.match(new RegExp(`\\b([1-6]|${numbers.slice(1, 7).join("|")})\\s+(?:counted\\s+)?courses?\\s+(?:per|each|a)\\s+(?:semester|term)\\b`, "i"));
  const maxCourses = courseCount ? Number(courseCount[1]) || numbers.indexOf(courseCount[1].toLowerCase()) : undefined;
  const includeFrench = /\b(?:no|without|exclude|skip|omit|remove)\s+(?:the\s+)?French\b/i.test(request) ? false
    : /\b(?:include|add|schedule|take)\s+(?:the\s+|my\s+)?French\b/i.test(request) ? true : undefined;
  const summerCount = request.match(new RegExp(`\\b(\\d{1,2}|${numbers.slice(1).join("|")})\\s+summers?(?:\\s+(?:sessions?|terms?|semesters?))?\\b`, "i"));
  const summerAmount = summerCount ? Number(summerCount[1]) || numbers.indexOf(summerCount[1].toLowerCase()) : 0;
  const maxSummerTerms = summerAmount >= 1 && summerAmount <= MAX_SUMMER_TERMS ? summerAmount : undefined;
  const includeSummer = /\b(?:no|without|exclude|skip|omit|remove|drop)\s+(?:the\s+)?summer\b/i.test(request) ? false
    : /\b(?:include|add|use|take|schedule|allow|with)\s+(?:the\s+)?summer\b/i.test(request) || maxSummerTerms ? true : undefined;
  const mode = /\b(?:graduate (?:early|earlier|sooner)|fastest|as soon as possible|earliest|graduate sooner)\b/i.test(request) ? "earlier" as const
    : /\b(?:lighter|balanced|less heavy|reduce (?:the )?workload)\b/i.test(request) ? "balanced" as const : undefined;
  return {
    ...(maxCourses && { maxCourses }),
    ...(finishMatch && { targetFinish: { term: finishMatch[1].toLowerCase() as Term, year: Number(finishMatch[2]) } }),
    ...(duration && duration <= 24 && { targetSemesters: duration }),
    ...(includeFrench !== undefined && { includeFrench }),
    ...(includeSummer !== undefined && { includeSummer }),
    ...(maxSummerTerms && { maxSummerTerms }),
    ...(mode && { mode }),
  };
}

export async function createDegreePlan(input: PlannerInput, instructions: string) {
  const audit = degreeAudit(input);
  const request = instructions.trim().slice(0, 2000);
  const options = {
    ...degreePreferences(request),
    ...input,
    specialization: audit.specializations.find((name) => request.toLowerCase().includes(name.toLowerCase())) ?? input.specialization,
  };

  let preferredCodes = [...request.matchAll(/\b[A-Z]{2,5}\s*\d{4}(?:-L)?\b/g)].map(([code]) => code);
  let note = "";
  const apiKey = process.env.NVIDIA_API_KEY;
  if (apiKey) {
    try {
      const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.NVIDIA_MODEL ?? "nvidia/nemotron-3.5-bolt-e4b",
          messages: [
            { role: "system", content: 'Return only JSON {"preferredCodes":[]}. Choose course codes from the supplied requirement options that match the student?s interests. When no interests are stated, favor coherent electives that complement the selected field. Planning settings are supplied by the app and are outside your role.' },
            { role: "user", content: JSON.stringify({ request, program: audit.program, minor: input.minor, selectedSpecialization: options.specialization, specializations: audit.specializations, requirementOptions: degreePlanChoices(options, request) }) },
          ],
          max_tokens: 600,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error("Model unavailable");
      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content?.match(/\{[\s\S]*\}/)?.[0];
      const result = JSON.parse(raw ?? "{}");
      if (!raw) throw new Error("Missing preferences");
      if (Array.isArray(result.preferredCodes)) preferredCodes = [...preferredCodes, ...result.preferredCodes.filter((code: unknown) => typeof code === "string").slice(0, 15)];
    } catch {
      note = "AI preference interpretation was unavailable. The draft uses the selected options and recognized course codes.";
    }
  } else if (request) {
    note = "The draft uses the selected options and recognized course codes. AI preference interpretation requires a configured Advisor.";
  }
  const settings = { mode: options.mode ?? "earlier" as const,
    maxCourses: options.maxCourses, targetSemesters: options.targetSemesters, targetFinish: options.targetFinish,
    includeSummer: options.includeSummer, maxSummerTerms: options.maxSummerTerms, includeFrench: options.includeFrench, specialization: options.specialization };
  const result = makeDegreePlans({ ...input, ...settings }, preferredCodes);
  return { ...result, settings, specialization: options.specialization, note };
}
