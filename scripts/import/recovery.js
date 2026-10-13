import diagnostics from "../core/diagnostics.js";

/**
 * Recovery: tracks documents created during an import so a failure can roll back only what the
 * import created, never pre-existing user content.
 */
export class ImportTransaction {
  constructor(label="import") {
    this.label = label;
    /** @type {{kind: string, doc: object, parent?: object}[]} */
    this.created = [];
    this.updated = [];
    this.committed = false;
  }

  trackCreated(kind, doc, parent=null) { this.created.push({ kind, doc, parent }); return doc; }

  trackUpdated(kind, doc, previous) { this.updated.push({ kind, doc, previous }); return doc; }

  /**
   * Delete everything this transaction created, in reverse order. Updates are restored from the
   * recorded previous data when available.
   */
  async rollback() {
    const errors = [];
    for ( const entry of [...this.created].reverse() ) {
      try {
        if ( entry.doc?.delete ) await entry.doc.delete();
        else if ( entry.parent?.deleteEmbeddedDocuments && entry.doc?.id ) await entry.parent.deleteEmbeddedDocuments(entry.kind, [entry.doc.id]);
      } catch (err) { errors.push(`Failed to remove ${entry.kind} ${entry.doc?.name ?? entry.doc?.id}: ${err.message}`); }
    }
    for ( const entry of [...this.updated].reverse() ) {
      try { if ( entry.previous && entry.doc?.update ) await entry.doc.update(entry.previous, { diff: false, recursive: false }); }
      catch (err) { errors.push(`Failed to restore ${entry.kind} ${entry.doc?.name}: ${err.message}`); }
    }
    diagnostics.warn(`Rolled back ${this.label}`, { created: this.created.length, updated: this.updated.length, errors });
    this.created = [];
    this.updated = [];
    return errors;
  }

  summary() {
    return { created: this.created.map(c => ({ kind: c.kind, id: c.doc?.id ?? c.doc?._id, name: c.doc?.name, uuid: c.doc?.uuid })), updated: this.updated.map(u => ({ kind: u.kind, id: u.doc?.id, name: u.doc?.name, uuid: u.doc?.uuid })) };
  }
}

/** Split an array into chunks for controlled batch creation. */
export function chunk(array, size=10) {
  const out = [];
  for ( let i = 0; i < array.length; i += size ) out.push(array.slice(i, i + size));
  return out;
}
