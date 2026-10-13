import actorData from "./actor-data.js";
import itemsActivities from "./items-activities.js";
import rolls from "./rolls.js";
import damageConditions from "./damage-conditions.js";
import combat from "./combat.js";
import combatAssistant from "./combat-assistant.js";

export const lessons = [actorData, itemsActivities, rolls, damageConditions, combat, combatAssistant];

export const tier = {
  number: 5,
  title: "D&D 5e Automation",
  objective: "Automate the primary worked-example system correctly: read verified actor and item data paths, use dnd5e 6 activities and roll workflows, apply damage and conditions through system methods, drive the combat tracker, and assemble a configurable combat assistant.",
  graduation: "A configurable combat assistant that selects eligible targets, rolls system saving throws, applies typed damage through dnd5e workflows and posts one honest report, verified in preview and on the live practice fixtures.",
  lessons: lessons.map(l => l.id),
  capstone: "t5-combat-assistant",
  achievements: []
};
