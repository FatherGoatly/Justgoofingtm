/**
 * Curriculum loader. Lessons are plain data objects grouped by tier; the loader only imports and assembles them.
 * Third-party packs are registered at runtime through the module API (see docs/curriculum-authoring.md).
 */
import { CURRICULUM_SCHEMA_VERSION } from "../scripts/core/constants.js";

export async function loadCurriculum() {
  const tierModules = await Promise.all([
    import("./tier-00/index.js"), import("./tier-01/index.js"), import("./tier-02/index.js"), import("./tier-03/index.js"), import("./tier-04/index.js"),
    import("./tier-05/index.js"), import("./tier-06/index.js"), import("./tier-07/index.js"), import("./tier-08/index.js"), import("./tier-09/index.js")
  ]);
  const { GLOSSARY } = await import("./glossary.js");
  const { BROKEN_MACROS } = await import("./broken-macros.js");
  const tiers = tierModules.map(m => m.tier);
  const lessons = tierModules.flatMap(m => m.lessons);
  return { version: CURRICULUM_SCHEMA_VERSION, packs: ["core"], tiers, lessons, glossary: GLOSSARY, brokenMacros: BROKEN_MACROS };
}
