/** Validate every lesson, glossary term, tier and broken macro against the curriculum schema. */
import { loadCurriculum } from "../curriculum/index.js";
import { validateCurriculum } from "../scripts/curriculum/schema.js";

const bundle = await loadCurriculum();
const issues = validateCurriculum(bundle);
if ( issues.length ) {
  console.error(`Curriculum validation failed with ${issues.length} issue(s):`);
  for ( const i of issues ) console.error(` - ${i.path}: ${i.message}`);
  process.exit(1);
}
const exercises = bundle.lessons.reduce((n, l) => n + l.exercises.length + 1, 0) + bundle.brokenMacros.length;
console.log(`Curriculum OK: ${bundle.tiers.length} tiers, ${bundle.lessons.length} lessons, ${exercises} exercises, ${bundle.glossary.length} glossary terms, ${bundle.brokenMacros.length} broken macros.`);
