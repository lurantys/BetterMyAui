import assert from "node:assert/strict";
import { test } from "node:test";
import { gradeToPoints } from "../src/lib/transcript-parser";

test("gradeToPoints uses the existing AUI letter-grade scale", () => {
  const grades: [string, number][] = [
    ["A+", 4.0], ["A", 4.0], ["A-", 3.67],
    ["B+", 3.33], ["B", 3.0], ["B-", 2.67],
    ["C+", 2.33], ["C", 2.0], ["C-", 1.67],
    ["D+", 1.33], ["D", 1.0], ["F", 0.0],
  ];

  for (const [grade, points] of grades) {
    assert.equal(gradeToPoints(grade), points, `${grade} should map to ${points}`);
  }
});

test("gradeToPoints excludes non-GPA transcript statuses", () => {
  for (const grade of ["P", "W", "I", "NG", "WIP"]) {
    assert.equal(gradeToPoints(grade), null, `${grade} should not produce GPA points`);
  }
});

test("gradeToPoints returns null for invalid and unsupported grades", () => {
  for (const grade of ["", "X", "A++", "constructor", "toString", "__proto__"]) {
    assert.equal(gradeToPoints(grade), null, `${JSON.stringify(grade)} is not a supported grade`);
  }
});

test("gradeToPoints ignores letter case and surrounding whitespace", () => {
  assert.equal(gradeToPoints(" a+ "), 4.0);
  assert.equal(gradeToPoints("  w  "), null);
});
