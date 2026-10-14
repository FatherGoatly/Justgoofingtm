import architecture from "./architecture.js";
import moduleAnatomy from "./module-anatomy.js";
import macroToModule from "./macro-to-module.js";
import capstoneLesson from "./capstone.js";

export const lessons = [architecture, moduleAnatomy, macroToModule, capstoneLesson];

export const tier = {
  number: 9,
  title: "Expert Macro Engineering and Module Development",
  objective: "Design complex automation independently and move from macro author to module developer: layered architecture with plugins, adapters, state machines and schemas; module anatomy from manifest to release; macro-to-module migration with data migrations, security, localization, accessibility and CI; and an independent expert capstone.",
  graduation: "A documented, tested, versioned Foundry automation package with a coherent architecture and a verified compatibility statement, designed and built independently from a natural-language problem.",
  lessons: lessons.map(l => l.id),
  capstone: "t9-capstone",
  achievements: ["independent-builder", "expert-macro-engineer"]
};
