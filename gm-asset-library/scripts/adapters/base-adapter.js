/**
 * Source adapter contract. Each adapter discovers one kind of source and produces normalized
 * AssetRecords (see catalog/asset-record.js) without hiding what the source is.
 *
 * Adapters are pull-based and incremental: `scan` yields batches so the catalog can update the UI as
 * discovery proceeds, and honours the CancellationToken.
 */
export class BaseAdapter {
  /** Unique adapter id, also used as the source category in diagnostics. */
  id = "base";

  /** Human label. */
  label = "Base";

  /** Whether the adapter can run for the current user/configuration. Return a reason string when not. */
  availability() { return { available: true, reason: null }; }

  /**
   * Discover records.
   * @param {object} context   { token, onProgress(status), settings }
   * @returns {AsyncGenerator<{records: object[], done?: boolean, status?: object}>}
   */
  async* scan(context) {
    throw new Error(`${this.id}: scan() not implemented`);
  }

  /** Check whether a record from this adapter still resolves. Returns true/false/null (cannot check). */
  async verify(record) { return null; }
}
