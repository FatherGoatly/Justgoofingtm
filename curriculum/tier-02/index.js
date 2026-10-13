import forLoops from "./for-loops.js";
import forOf from "./for-of.js";
import whileLoops from "./while-loops.js";
import arrayMethods from "./array-methods.js";
import nestedLogic from "./nested-logic.js";
import encounterUtility from "./encounter-utility.js";

export const lessons = [forLoops, forOf, whileLoops, arrayMethods, nestedLogic, encounterUtility];

export const tier = {
  number: 2,
  title: "Control Flow and Problem Solving",
  objective: "Make code respond to many situations: loops, array methods, termination, validation, pseudocode and algorithm design, with every concept tied to a tabletop problem.",
  graduation: "A multi-target encounter utility that walks every token on the scene, groups and flags them, handles the empty and missing-data cases, and posts a readable GM report.",
  lessons: lessons.map(l => l.id),
  capstone: "t2-encounter-utility",
  achievements: ["loop-wrangler"]
};
