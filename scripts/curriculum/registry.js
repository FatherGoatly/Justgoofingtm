/**
 * In-memory curriculum registry: lessons, tiers and glossary with prerequisite resolution, availability,
 * search and recommendations. Pure JavaScript.
 */
import { validateCurriculum } from "./schema.js";
import { COMPLETED_STATES, LESSON_STATES, CATEGORIES } from "../core/constants.js";
import { slugify } from "../utilities/html.js";

export class CurriculumRegistry {
  /**
   * @param {{tiers:object[], lessons:object[], glossary:object[], version?:number, packs?:string[]}} bundle
   */
  constructor(bundle) {
    this.version = bundle.version ?? 1;
    this.packs = bundle.packs ?? ["core"];
    this.tiers = [...(bundle.tiers ?? [])].sort((a, b) => a.number - b.number);
    this.lessons = new Map((bundle.lessons ?? []).map(l => [l.id, l]));
    this.glossary = new Map((bundle.glossary ?? []).map(g => [g.slug, g]));
    this.exercises = new Map();
    for ( const lesson of this.lessons.values() ) {
      for ( const ex of [...(lesson.exercises ?? []), lesson.challenge].filter(Boolean) ) this.exercises.set(ex.id, { exercise: ex, lesson });
    }
    /** Deliberately broken practice macros (debugging workbench). Their exercises are tracked like lesson exercises. */
    this.brokenMacros = [...(bundle.brokenMacros ?? [])];
    for ( const b of this.brokenMacros ) if ( b?.exercise?.id ) this.exercises.set(b.exercise.id, { exercise: b.exercise, lesson: null });
    this.issues = validateCurriculum(bundle);
  }

  get valid() { return this.issues.length === 0; }

  /** Ordered list of all lessons by tier, then by their position in the tier. */
  get orderedLessons() {
    const out = [];
    for ( const tier of this.tiers ) for ( const id of tier.lessons ) { const l = this.lessons.get(id); if ( l ) out.push(l); }
    for ( const l of this.lessons.values() ) if ( !out.includes(l) ) out.push(l);
    return out;
  }

  getLesson(id) { return this.lessons.get(id) ?? null; }
  getTier(n) { return this.tiers.find(t => t.number === n) ?? null; }
  getExercise(id) { return this.exercises.get(id)?.exercise ?? null; }
  getExerciseLesson(id) { return this.exercises.get(id)?.lesson ?? null; }
  getTerm(slug) { return this.glossary.get(slug) ?? this.glossary.get(slugify(slug)) ?? null; }

  lessonsInTier(n) { return (this.getTier(n)?.lessons ?? []).map(id => this.lessons.get(id)).filter(Boolean); }

  /**
   * Full (transitive) prerequisite set of a lesson.
   * @param {string} id
   * @returns {string[]}
   */
  allPrerequisites(id) {
    const out = new Set();
    const walk = lid => {
      for ( const p of this.lessons.get(lid)?.prerequisites ?? [] ) { if ( !out.has(p) ) { out.add(p); walk(p); } }
    };
    walk(id);
    return [...out];
  }

  /**
   * Which lessons list this one as a direct prerequisite?
   * @param {string} id
   * @returns {object[]}
   */
  dependents(id) {
    return [...this.lessons.values()].filter(l => l.prerequisites.includes(id));
  }

  /**
   * Is the lesson available given the set of completed lesson ids? Locked lessons report which prerequisites
   * are missing so the UI can explain why.
   * @param {string} id
   * @param {Set<string>|string[]} completed
   * @returns {{available:boolean, missing:object[]}}
   */
  availability(id, completed) {
    const done = completed instanceof Set ? completed : new Set(completed ?? []);
    const lesson = this.lessons.get(id);
    if ( !lesson ) return { available: false, missing: [] };
    const missing = lesson.prerequisites.filter(p => !done.has(p)).map(p => this.lessons.get(p) ?? { id: p, title: p });
    return { available: missing.length === 0, missing };
  }

  /**
   * Derive the display state for a lesson from the progress record.
   * @param {string} id
   * @param {object} progress   Progress record (see progress/schema.js)
   * @returns {string} One of LESSON_STATES
   */
  stateOf(id, progress) {
    const rec = progress?.lessons?.[id];
    if ( rec?.state && rec.state !== LESSON_STATES.LOCKED && rec.state !== LESSON_STATES.NOT_STARTED ) return rec.state;
    const completed = completedSet(progress);
    const avail = this.availability(id, completed);
    if ( !avail.available ) return LESSON_STATES.LOCKED;
    return rec?.state ?? LESSON_STATES.NOT_STARTED;
  }

  /**
   * Recommend the next lesson: the first available, not-completed lesson in curriculum order; prefers lessons
   * flagged needs-review, then the last visited lesson if unfinished.
   * @param {object} progress
   * @param {object} [options]
   * @param {Function} [options.filter]   Exclude lessons (e.g. unavailable in this environment)
   * @returns {object|null}
   */
  recommendNext(progress, { filter=null }={}) {
    const completed = completedSet(progress);
    const ordered = this.orderedLessons.filter(l => !filter || filter(l));
    const review = ordered.find(l => progress?.lessons?.[l.id]?.state === LESSON_STATES.NEEDS_REVIEW);
    if ( review ) return review;
    const last = progress?.lastLesson ? this.lessons.get(progress.lastLesson) : null;
    if ( last && !completed.has(last.id) && this.availability(last.id, completed).available && (!filter || filter(last)) ) return last;
    return ordered.find(l => !completed.has(l.id) && this.availability(l.id, completed).available) ?? null;
  }

  /**
   * Lessons related to a lesson: its prerequisites, dependents, lessons it reinforces, and lessons in the same topic.
   * @param {string} id
   * @returns {{prerequisites:object[], dependents:object[], reinforces:object[], sameTopic:object[]}}
   */
  related(id) {
    const lesson = this.lessons.get(id);
    if ( !lesson ) return { prerequisites: [], dependents: [], reinforces: [], sameTopic: [] };
    const get = ids => ids.map(i => this.lessons.get(i)).filter(Boolean);
    return {
      prerequisites: get(lesson.prerequisites),
      dependents: this.dependents(id),
      reinforces: get(lesson.reinforces ?? []),
      sameTopic: [...this.lessons.values()].filter(l => l.id !== id && l.topic === lesson.topic)
    };
  }

  /**
   * Glossary terms referenced by a lesson's text ([[term]] links and term blocks).
   * @param {string} id
   * @returns {object[]}
   */
  termsFor(id) {
    const lesson = this.lessons.get(id);
    if ( !lesson ) return [];
    const found = new Set();
    const scan = text => { for ( const m of String(text ?? "").matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g) ) { const t = m[1].trim(); if ( !t.startsWith("lesson:") ) found.add(slugify(t)); } };
    const prose = [];
    for ( const s of lesson.sections ) for ( const b of s.blocks ) {
      if ( b.type === "term" ) found.add(slugify(b.term));
      scan(b.text); (b.items ?? []).forEach(scan); (b.annotations ?? []).forEach(a => scan(a.note));
      if ( b.type === "code" ) continue;
      if ( typeof b.text === "string" ) prose.push(b.text);
      for ( const item of b.items ?? [] ) if ( typeof item === "string" ) prose.push(item);
    }
    // Glossary titles that appear as whole words in the lesson prose count as referenced terms too, so a lesson that
    // explains hooks lists the "Hook" entry without the author having to write [[hook]] every time.
    const text = prose.join("\n").toLowerCase();
    if ( text ) for ( const term of this.glossary.values() ) {
      const title = String(term.term ?? term.title ?? "").toLowerCase();
      if ( title.length < 4 || found.has(term.slug) ) continue;
      const re = new RegExp(`(^|[^a-z0-9])${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es)?([^a-z0-9]|$)`, "i");
      if ( re.test(text) ) found.add(term.slug);
    }
    return [...found].map(s => this.glossary.get(s)).filter(Boolean);
  }

  /**
   * Search lessons by free text and filters.
   * @param {object} query
   * @param {string} [query.text]
   * @param {string[]} [query.difficulties]
   * @param {string[]} [query.categories]
   * @param {number[]} [query.tiers]
   * @param {"all"|"completed"|"incomplete"|"available"} [query.status]
   * @param {object} [query.progress]
   * @returns {object[]}
   */
  search({ text="", difficulties=[], categories=[], tiers=[], status="all", progress=null }={}) {
    const q = String(text ?? "").trim().toLowerCase();
    const completed = completedSet(progress);
    return this.orderedLessons.filter(l => {
      if ( difficulties.length && !difficulties.includes(l.difficulty) ) return false;
      if ( categories.length && !categories.includes(l.category) ) return false;
      if ( tiers.length && !tiers.includes(l.tier) ) return false;
      if ( status === "completed" && !completed.has(l.id) ) return false;
      if ( status === "incomplete" && completed.has(l.id) ) return false;
      if ( status === "available" && (completed.has(l.id) || !this.availability(l.id, completed).available) ) return false;
      if ( q ) {
        const hay = [l.id, l.title, l.topic, l.summary, ...(l.objectives ?? []), ...(l.exercises ?? []).flatMap(e => e.concepts ?? [])].join(" ").toLowerCase();
        if ( !hay.includes(q) ) return false;
      }
      return true;
    });
  }

  /**
   * Search glossary terms.
   * @param {string} text
   * @param {string[]} [tags]
   * @returns {object[]}
   */
  searchTerms(text="", tags=[]) {
    const q = String(text ?? "").trim().toLowerCase();
    return [...this.glossary.values()]
      .filter(g => (!tags.length || tags.some(t => g.tags.includes(t))) && (!q || `${g.term} ${g.plain} ${g.technical}`.toLowerCase().includes(q)))
      .sort((a, b) => a.term.localeCompare(b.term));
  }

  /**
   * Lessons that teach a concept tag (used for adaptive review recommendations).
   * @param {string} concept
   * @returns {object[]}
   */
  lessonsForConcept(concept) {
    return this.orderedLessons.filter(l => [...(l.exercises ?? []), l.challenge].filter(Boolean).some(e => (e.concepts ?? []).includes(concept)));
  }

  /** Lessons of category project (capstones). */
  get projects() { return this.orderedLessons.filter(l => l.category === CATEGORIES.PROJECT); }

  /**
   * Merge an additional curriculum pack (lessons/glossary/tiers additions) into this registry. Pack data is plain
   * data; it is validated and never executed.
   * @param {{id:string, lessons?:object[], glossary?:object[], tierLessons?:Record<number,string[]>}} pack
   * @returns {import("./schema.js").ValidationIssue[]} Issues found (pack rejected when non-empty)
   */
  registerPack(pack) {
    const lessons = [...this.lessons.values(), ...(pack.lessons ?? [])];
    const glossary = [...this.glossary.values(), ...(pack.glossary ?? [])];
    const tiers = this.tiers.map(t => ({ ...t, lessons: [...t.lessons, ...((pack.tierLessons ?? {})[t.number] ?? [])] }));
    const issues = validateCurriculum({ tiers, lessons, glossary });
    if ( issues.length ) return issues;
    for ( const l of pack.lessons ?? [] ) {
      this.lessons.set(l.id, l);
      for ( const ex of [...(l.exercises ?? []), l.challenge].filter(Boolean) ) this.exercises.set(ex.id, { exercise: ex, lesson: l });
    }
    for ( const g of pack.glossary ?? [] ) this.glossary.set(g.slug, g);
    this.tiers = tiers;
    this.packs.push(pack.id);
    return [];
  }
}

/**
 * Set of completed lesson ids from a progress record.
 * @param {object} progress
 * @returns {Set<string>}
 */
export function completedSet(progress) {
  const out = new Set();
  for ( const [id, rec] of Object.entries(progress?.lessons ?? {}) ) if ( COMPLETED_STATES.includes(rec?.state) ) out.add(id);
  return out;
}
