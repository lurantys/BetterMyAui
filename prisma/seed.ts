import { PrismaClient } from "../src/generated/prisma";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

interface CatalogData {
  disciplines: Record<string, string>;
  grading_scale: {
    letter_grades: { letter: string; gpa_points: number }[];
  };
  courses: {
    code: string;
    title: string;
    credits: number;
    level: string;
    prerequisite_raw: string | null;
    prerequisite_courses: string[];
    corequisite_raw: string | null;
    corequisite_courses: string[];
    classification_requirement: string | null;
    other_requirement_notes: string | null;
    description: string;
  }[];
}

async function main() {
  console.log("Seeding database...");

  const data: CatalogData = JSON.parse(
    readFileSync(join(__dirname, "..", "aui_catalog_data.json"), "utf-8")
  );

  // Seed disciplines
  const disciplineEntries = Object.entries(data.disciplines);
  for (const [code, name] of disciplineEntries) {
    await prisma.discipline.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
  }
  console.log(`Seeded ${disciplineEntries.length} disciplines`);

  // Seed grading scale
  const { letter_grades } = data.grading_scale;
  for (const g of letter_grades) {
    await prisma.gradingScale.upsert({
      where: { letterGrade: g.letter },
      update: { gpaPoints: g.gpa_points },
      create: { letterGrade: g.letter, gpaPoints: g.gpa_points },
    });
  }
  // Also seed special marks
  const specialMarks = [
    { letterGrade: "P", gpaPoints: 0 },
    { letterGrade: "CR", gpaPoints: 0 },
    { letterGrade: "AU", gpaPoints: 0 },
    { letterGrade: "W", gpaPoints: 0 },
    { letterGrade: "WF", gpaPoints: 0 },
    { letterGrade: "I", gpaPoints: 0 },
    { letterGrade: "NP", gpaPoints: 0 },
  ];
  for (const g of specialMarks) {
    await prisma.gradingScale.upsert({
      where: { letterGrade: g.letterGrade },
      update: { gpaPoints: g.gpaPoints },
      create: g,
    });
  }
  console.log(`Seeded ${letter_grades.length + specialMarks.length} grading scale entries`);

  // Cache discipline lookups
  const disciplineMap = new Map<string, string>();
  const allDisciplines = await prisma.discipline.findMany();
  for (const d of allDisciplines) {
    disciplineMap.set(d.code, d.id);
  }

  // Seed courses
  let courseCount = 0;
  let skipped = 0;
  for (const c of data.courses) {
    // Extract discipline code from course code (e.g., "ACC 2301" -> "ACC")
    const disciplineCode = c.code.split(" ")[0];
    const disciplineId = disciplineMap.get(disciplineCode);

    if (!disciplineId) {
      console.warn(
        `Skipping ${c.code}: discipline ${disciplineCode} not found`
      );
      skipped++;
      continue;
    }

    await prisma.course.upsert({
      where: { code: c.code },
      update: {
        title: c.title,
        credits: c.credits,
        description: c.description,
        disciplineId,
        prerequisiteRaw: c.prerequisite_raw,
        prerequisiteCourses: c.prerequisite_courses,
        corequisiteRaw: c.corequisite_raw,
        corequisiteCourses: c.corequisite_courses,
        classificationRequirement: c.classification_requirement,
        otherRequirementNotes: c.other_requirement_notes,
      },
      create: {
        code: c.code,
        title: c.title,
        credits: c.credits,
        description: c.description,
        disciplineId,
        prerequisiteRaw: c.prerequisite_raw,
        prerequisiteCourses: c.prerequisite_courses,
        corequisiteRaw: c.corequisite_raw,
        corequisiteCourses: c.corequisite_courses,
        classificationRequirement: c.classification_requirement,
        otherRequirementNotes: c.other_requirement_notes,
      },
    });
    courseCount++;
  }
  console.log(`Seeded ${courseCount} courses (${skipped} skipped)`);
  console.log("Seeding complete!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
