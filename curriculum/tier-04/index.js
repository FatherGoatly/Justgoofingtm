import readingEditingMacros from "./reading-editing-macros.js";
import asyncAwait from "./async-await.js";
import dialogsInput from "./dialogs-input.js";
import chatFormatting from "./chat-formatting.js";
import diceAnnouncer from "./dice-announcer.js";
import gmTools from "./gm-tools.js";
import gmUtilityMenu from "./gm-utility-menu.js";

export const lessons = [readingEditingMacros, asyncAwait, dialogsInput, chatFormatting, diceAnnouncer, gmTools, gmUtilityMenu];

export const tier = {
  number: 4,
  title: "Your First Real Macro Library",
  objective: "Build reusable macros that solve common GM problems: read and edit existing macros, handle asynchronous work and errors, build dialogs, format chat safely, roll dice, and assemble a documented tool library.",
  graduation: "A personal GM utility menu containing at least five working, validated, permission-aware tools behind one data-driven dialog, exported as a Macro document.",
  lessons: lessons.map(l => l.id),
  capstone: "t4-gm-utility-menu",
  achievements: ["macro-mechanic"]
};
