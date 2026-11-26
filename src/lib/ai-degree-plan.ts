import { degreeAudit, degreePlanChoices, makeDegreePlans, type PlannerInput, type Term } from "./degree-planner";

export async function createDegreePlan(input: PlannerInput, instructions: string) {
  const audit = degreeAudit(input);
  const request = instructions.trim().slice(0, 2000);
  const numbers = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const durationMatch = request.match(new RegExp(`\\b(\\d{1,2}|${numbers.join("|")})\\s+(?:regular\\s+)?(semesters?|years?)\\b`, "i"));
  const amount = durationMatch ? Number(durationMatch[1]) || numbers.indexOf(durationMatch[1].toLowerCase()) : 0;
  const duration = durationMatch && amount > 0 ? amount * (/^year/i.test(durationMatch[2]) ? 2 : 1) : undefined;
  const finishMatch = request.match(/\b(?:by|before|finish in|graduate in)\s+(fall|spring|summer)\s+(20\d{2})\b/i);
  const options = {
    ...input,
    targetFinish: finishMatch ? { term: finishMatch[1].toLowerCase() as Term, year: Number(finishMatch[2]) } : input.targetFinish,
    targetSemesters: duration && duration <= 24 ? duration : input.targetSemesters,
    includeFrench: /\b(?:no|without|exclude|skip|omit|remove)\s+(?:the\s+)?French\b/i.test(request)
      ? false : input.includeFrench === true || /\b(?:include|add|schedule|take)\s+(?:the\s+|my\s+)?French\b/i.test(request),
    includeSummer: /\b(?:no|without|exclude|skip)\s+(?:the\s+)?summer\b/i.test(request)
      ? false : /\bsummer\b/i.test(request) || input.includeSummer,
    specialization: audit.specializations.find((name) => request.toLowerCase().includes(name.toLowerCase())) ?? input.specialization,
  };

  let preferredCodes = [...request.matchAll(/\b[A-Z]{2,5}\s*\d{4}(?:-L)?\b/g)].map(([code]) => code);
  let note = "";
  let balanceRequested = /\b(?:lighter|lighter workload|balanced workload|reduce (?:the )?workload)\b/i.test(request);
  const apiKey = process.env.NVIDIA_API_KEY;
  if (apiKey) {
    try {
      const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.NVIDIA_MODEL ?? "nvidia/nemotron-3.5-bolt-e4b",
          messages: [
            { role: "system", content: 'Interpret degree-planning preferences. Return only JSON {"preferredCodes":[],"specialization":"","targetSemesters":null,"includeSummer":null,"favorBalance":false}. Use a listed specialization only if the user requests it or asks you to choose one. Pick preferred course codes from the supplied requirement options when they suit the request. When no preferences are given, favor coherent electives that complement the selected field and keep the path to graduation practical. targetSemesters is the total number of regular semesters from entry, and may change only if the request specifies a total duration. Include summer only if requested. Set favorBalance to true only if the user explicitly prioritizes lighter terms. You cannot waive requirements or change course limits.' },
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
      if (!options.specialization && audit.specializations.includes(result.specialization)) options.specialization = result.specialization;
      if (!duration && Number.isInteger(result.targetSemesters) && result.targetSemesters >= 1 && result.targetSemesters <= 24) options.targetSemesters = result.targetSemesters;
      if (result.favorBalance === true && request) balanceRequested = true;
      if (!/\bsummer\b/i.test(request) && typeof result.includeSummer === "boolean") options.includeSummer = result.includeSummer;
    } catch {
      note = "AI preference interpretation was unavailable. The drafts use the selected options and recognized course codes.";
    }
  } else if (request) {
    note = "The drafts use the selected options and recognized course codes. AI preference interpretation requires a configured Advisor.";
  }
  const result = makeDegreePlans(options, preferredCodes);
  if (balanceRequested) result.plans.sort((a, b) =>
    Number(!!b.finish) - Number(!!a.finish) || a.remaining.length - b.remaining.length || a.peakCredits - b.peakCredits);
  return { ...result, specialization: options.specialization, note };
}
