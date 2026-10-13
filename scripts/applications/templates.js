import { MODULE_ID } from "../core/constants.js";

const base = `modules/${MODULE_ID}/templates`;

/** Template paths, preloaded at init so dynamic partials resolve. */
export const TEMPLATES = Object.freeze({
  nav: `${base}/nav.hbs`,
  content: `${base}/content.hbs`,
  dashboard: `${base}/views/dashboard.hbs`,
  curriculum: `${base}/views/curriculum.hbs`,
  lesson: `${base}/views/lesson.hbs`,
  glossary: `${base}/views/glossary.hbs`,
  progress: `${base}/views/progress.hbs`,
  debug: `${base}/views/debug.hbs`,
  diagnostics: `${base}/views/diagnostics.hbs`,
  help: `${base}/views/help.hbs`,
  workshopHeader: `${base}/workshop/header.hbs`,
  workshopEditor: `${base}/workshop/editor.hbs`,
  workshopResults: `${base}/workshop/results.hbs`,
  workshopSide: `${base}/workshop/side.hbs`,
});
