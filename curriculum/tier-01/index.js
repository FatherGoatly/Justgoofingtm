import variables from "./variables.js";
import stringsTemplates from "./strings-templates.js";
import numbersOperators from "./numbers-operators.js";
import conditions from "./conditions.js";
import arraysObjects from "./arrays-objects.js";
import functions from "./functions.js";
import scope from "./scope.js";
import combatHelper from "./combat-helper.js";

export const lessons = [variables, stringsTemplates, numbersOperators, conditions, arraysObjects, functions, scope, combatHelper];

export const tier = {
  number: 1,
  title: "JavaScript Foundations",
  objective: "Learn the building blocks of programming through tabletop problems: variables, strings, numbers, conditions, arrays, objects, functions and scope.",
  graduation: "A basic combat helper that validates input, resolves a hit, applies and clamps damage without mutating its inputs, and reports clearly.",
  lessons: lessons.map(l => l.id),
  capstone: "t1-combat-helper",
  achievements: ["variable-virtuoso", "logic-architect"]
};
