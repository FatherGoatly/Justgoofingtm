import whatIsCode from "./what-is-code.js";
import readingCode from "./reading-code.js";
import readingErrors from "./reading-errors.js";
import whatMacrosTouch from "./what-macros-touch.js";
import welcomeMacro from "./welcome-macro.js";

export const lessons = [whatIsCode, readingCode, readingErrors, whatMacrosTouch, welcomeMacro];

export const tier = {
  number: 0,
  title: "The Zero-Code Gateway",
  objective: "Remove the fear of programming: understand what code and macros are, read a program top to bottom, read an error message, and know what a macro can touch.",
  graduation: "A personalised welcome macro for your campaign: a banner, a session line and a GM-only whisper, built, run, changed and explained.",
  lessons: lessons.map(l => l.id),
  capstone: "t0-welcome-macro",
  achievements: ["first-macro"]
};
