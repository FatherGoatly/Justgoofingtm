import stackTraces from "./stack-traces.js";
import testing from "./testing.js";
import refactoringReview from "./refactoring-review.js";
import repairSuite from "./repair-suite.js";

export const lessons = [stackTraces, testing, refactoringReview, repairSuite];

export const tier = {
  number: 8,
  title: "Professional Debugging and Software Quality",
  objective: "Diagnose unfamiliar code and verify correctness: read stack traces and developer tools, reproduce and reduce bugs, write unit, integration, regression and permission tests with fixtures and mocks, refactor safely, review with a checklist, document, and keep macros under version control.",
  graduation: "A deliberately broken automation suite repaired with every root cause explained in writing and regression tests added so the faults cannot return.",
  lessons: lessons.map(l => l.id),
  capstone: "t8-repair-suite",
  achievements: ["debugging-detective", "refactoring-expert"]
};
