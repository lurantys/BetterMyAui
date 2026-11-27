import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../src/app/api/advisor/route";
import { degreeAudit, makeDegreePlans } from "../src/lib/degree-planner";
import { countsTowardCourseLimit } from "../src/lib/semester-load";

test("Advisor recommends, revises, and prepares a Career proposal for a first-year student", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-27T12:00:00Z") });
  const apiKey = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = "regression-test";
  t.after(() => {
    if (apiKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = apiKey;
  });
  const tool = (name: string, args: object) => ({ name, arguments: JSON.stringify(args) });
  const originalCourses = ["ARB 1201", "ART 1301", "BIO 1400", "COM 1301", "CSC 1401", "FYE 1102", "MTH 1388"];
  const recommendation = tool("recommend_semester", { termLabel: "Spring 2027", courseCodes: originalCourses });
  const toolCalls = [
    recommendation, recommendation,
    tool("revise_semester", { removeCode: "ART 1301", addCode: "ART 1303" }),
    tool("revise_semester", { removeCode: originalCourses[0] }),
    tool("save_semester_draft", {}),
    tool("propose_planned_changes", { changes: [{ action: "remove", term: "fall", year: 2026, code: "ENG 1301" }] }),
  ];
  const model = t.mock.method(globalThis, "fetch", async () => {
    const next = toolCalls.shift();
    assert(next);
    return Response.json({ choices: [{ message: { tool_calls: [{ function: next }] } }] });
  });

  const currentSemester = {
    term: "fall",
    year: 2026,
    courses: [
      { code: "ENG 1301", credits: 3, grade: null },
      { code: "FYE 1101", credits: 1, grade: null },
      { code: "MTH 1303", credits: 3, grade: null },
    ],
  };
  let studentContext = JSON.stringify({ currentSemester, plannedSemesters: [currentSemester] });
  let semesterDraft: unknown;
  async function send(message: string, history: { role: string; content: string }[] = []) {
    const response = await POST(new Request("http://localhost/api/advisor", {
      method: "POST",
      body: JSON.stringify({ message, studentContext, history, semesterDraft }),
    }));
    assert.equal(response.status, 200);
    return response.json();
  }

  const request = { role: "user", content: "build me a semester plan for next semester" };
  const result = await send(request.content);
  assert.match(result.answer, /^\*\*Spring 2027/);
  assert.match(result.answer, /Requires passing ENG 1301 before this term/);
  assert.equal(result.proposal, undefined);
  const codes = (answer: string) => Array.from(answer.matchAll(/^- \*\*([A-Z]+ \d{4}(?:-L)?)/gm), ([, code]) => code);
  const original = codes(result.answer);
  assert.equal(original.filter((code) => countsTowardCourseLimit({ code })).length, 6);
  for (const course of currentSemester.courses) assert(!original.includes(course.code));

  const clarification = await send("Spring 2027", [request, { role: "assistant", content: "Which semester?" }]);
  assert.equal(clarification.answer, result.answer);

  const history = [request, { role: "assistant", content: result.answer }];
  const art = original.find((code) => code.startsWith("ART "));
  assert(art);
  const replacement = art === "ART 1301" ? "ART 1303" : "ART 1301";
  semesterDraft = result.semesterDraft;
  const swapped = await send(`Replace ${art} with ${replacement} in this draft`);
  const revised = [...original.filter((code) => code !== art), replacement];
  assert.deepEqual(codes(swapped.answer).sort(), revised.sort());
  assert.equal(swapped.proposal, undefined);

  const dropped = await send(`Remove ${original[0]} from this draft`, history);
  assert.deepEqual(codes(dropped.answer), original.slice(1));
  assert.equal(dropped.proposal, undefined);

  semesterDraft = swapped.semesterDraft;
  const saved = await send("Save this semester draft to Career", [
    ...history,
    { role: "user", content: `Replace ${art} with ${replacement} in this draft` },
    { role: "assistant", content: swapped.answer },
  ]);
  assert.deepEqual(saved.proposal.map(({ code }: { code: string }) => code).sort(), revised);
  assert(saved.proposal.every(({ action, term, year }: { action: string; term: string; year: number }) =>
    action === "add" && term === "spring" && year === 2027
  ));
  studentContext = JSON.stringify({ currentSemester, plannedSemesters: [currentSemester, {
    term: "spring", year: 2027, courses: [{ code: "COM 1301", credits: 3, grade: null }],
  }] });
  const rejected = await send("Remove ENG 1301 from my Fall 2026 Career schedule");
  assert.equal(rejected.proposal, undefined);
  assert.match(rejected.answer, /COM 1301/);
  assert.equal(model.mock.callCount(), 6);

});

test("Advisor can swap in a catalog elective outside the declared minor", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-27T12:00:00Z") });
  const apiKey = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = "regression-test";
  t.after(() => {
    if (apiKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = apiKey;
  });

  t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [{ message: { tool_calls: [{
    function: { name: "revise_semester", arguments: JSON.stringify({ removeCode: "CSC 3315", addCode: "MKT 3301" }) },
  }] } }] }));

  const semesterDraft = { term: "spring", year: 2027, courseCodes: [
    "CHE 1401", "CSC 2305", "CSC 3315", "CSC 3323", "ACC 2302", "MGT 3301",
  ] };
  async function swap(completedCodes: string[]) {
    const response = await POST(new Request("http://localhost/api/advisor", {
      method: "POST",
      body: JSON.stringify({
        message: "replace languages and compilers with principles of marketing",
        semesterDraft,
        studentContext: JSON.stringify({
          profile: { major: "Computer Science", minor: "Business Administration" },
          completedSemesters: [{ term: "spring", year: 2026, courses: completedCodes.map((code) => ({ code, grade: "A", credits: 3 })) }],
          currentSemester: { term: "fall", year: 2026, courses: [{ code: "PHY 1402", credits: 4 }] },
        }),
      }),
    }));
    assert.equal(response.status, 200);
    return response.json();
  }

  const prerequisites = ["ACC 2301", "EGR 2302", "CSC 2302", "CSC 2306"];
  const revised = await swap(prerequisites);
  assert.match(revised.answer, /Spring 2027.*19 credits/);
  assert.match(revised.answer, /Catalog elective \(check degree applicability\)/);
  assert.deepEqual(revised.semesterDraft.courseCodes.sort(), [
    "CHE 1401", "CSC 2305", "MKT 3301", "CSC 3323", "ACC 2302", "MGT 3301",
  ].sort());

  const blocked = await swap(prerequisites.filter((code) => code !== "EGR 2302"));
  assert.equal(blocked.semesterDraft, undefined);
  assert.match(blocked.answer, /MKT 3301 requires.*EGR 2302/);
});

test("Every EMS thematic area can be audited and scheduled", () => {
  const student = { major: "Engineering and Management Science", semesters: [] };
  const now = { term: "fall", year: 2026 } as const;
  const requiredCourses = new Map([
    ["Manufacturing and Logistics Engineering", ["MLE 3301", "MLE 4305", "MLE 3305"]],
    ["Decision Support Systems Engineering", ["EDS 3302", "EDS 4304", "EDS 4306"]],
    ["BioTech", ["BIO 1401", "BIO 2301", "BTC 4355"]],
    ["Finance", ["FIN 3301"]],
  ]);
  assert.deepEqual(degreeAudit(student, now).specializations.sort(), [...requiredCourses.keys()].sort());
  for (const [specialization, expected] of requiredCourses) {
    const [plan] = makeDegreePlans({ ...student, specialization }, [], now).plans;
    assert(plan?.finish, specialization);
    assert.deepEqual(plan.remaining, []);
    const codes = new Set(plan.terms.flatMap(({ courses }) => courses.map(({ code }) => code)));
    for (const code of expected) assert(codes.has(code), `${specialization}: ${code}`);
  }
});

test("An explicit AI specialization request generates a draft over the saved specialization", async (t) => {
  const apiKey = process.env.NVIDIA_API_KEY;
  process.env.NVIDIA_API_KEY = "regression-test";
  t.after(() => {
    if (apiKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = apiKey;
  });

  t.mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    if (!request.tools) return Response.json({ choices: [{ message: { content: '{"preferredCodes":[]}' } }] });
    assert.equal(request.tool_choice, "auto");
    return Response.json({ choices: [{ message: { tool_calls: [{ function: {
      name: "plan_degree",
      arguments: JSON.stringify({ action: "generate", specialization: "Artificial Intelligence" }),
    } }] } }] });
  });

  const response = await POST(new Request("http://localhost/api/advisor", {
    method: "POST",
    body: JSON.stringify({
      message: "generate a degree plan for me with an AI specialization",
      studentContext: JSON.stringify({
        profile: { major: "Computer Science", minor: "Business Administration", specialization: "Software Engineering" },
      }),
      degreeDraft: { plan: { terms: [], review: [] }, deadline: "Spring 2030",
        settings: { specialization: "Software Engineering", maxCourses: 5, includeSummer: true, maxSummerTerms: 1 } },
    }),
  }));
  assert.equal(response.status, 200);
  const { degreeDraft } = await response.json();
  assert.equal(degreeDraft.settings.specialization, "Artificial Intelligence");
  assert.equal(degreeDraft.settings.maxCourses, 5);
  assert.equal(degreeDraft.settings.maxSummerTerms, 1);
});
