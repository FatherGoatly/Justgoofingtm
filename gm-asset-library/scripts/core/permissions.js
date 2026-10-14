import { ACCESS_POLICIES, getSetting, SETTINGS } from "./settings.js";

/**
 * Permission model.
 *
 * Browsing and editing are separate capabilities:
 *  - `canUseBrowser()` is the module's own access policy (GM-only by default).
 *  - File browsing additionally requires Foundry's FILES_BROWSE permission.
 *  - Documents are only cataloged when the current user can observe them (Foundry's own visibility rules).
 *  - Compendium packs are only cataloged when `pack.visible`.
 *  - Writes to shared organization data (collections, tags, aliases, notes, roles) are world settings and
 *    therefore require the SETTINGS_MODIFY permission (GMs by default).
 *  - Every document mutation goes through the document's own permission-checked API; we check
 *    `canUserModify` first so the UI can hide impossible actions.
 */

function user() { return globalThis.game?.user ?? null; }

export function canUseBrowser(u=user()) {
  if ( !u ) return false;
  if ( u.isGM ) return true;
  const policy = getSetting(SETTINGS.ACCESS_POLICY);
  if ( policy === ACCESS_POLICIES.all ) return true;
  if ( policy === ACCESS_POLICIES.trusted ) return Boolean(u.isTrusted ?? (u.role >= (globalThis.CONST?.USER_ROLES?.TRUSTED ?? 2)));
  return false;
}

export function canBrowseFiles(u=user()) {
  if ( !u ) return false;
  try { return u.isGM || u.can("FILES_BROWSE"); } catch { return Boolean(u.isGM); }
}

export function canUploadFiles(u=user()) {
  if ( !u ) return false;
  try { return u.isGM || u.can("FILES_UPLOAD"); } catch { return Boolean(u.isGM); }
}

/** Can the user write shared (world-scoped) organization data? */
export function canEditSharedOrganization(u=user()) {
  if ( !u ) return false;
  try { return u.isGM || u.can("SETTINGS_MODIFY"); } catch { return Boolean(u.isGM); }
}

export function canObserveDocument(doc, u=user()) {
  if ( !doc || !u ) return false;
  if ( u.isGM ) return true;
  try {
    if ( typeof doc.visible === "boolean" ) return doc.visible;
    return doc.testUserPermission(u, "OBSERVER");
  } catch { return false; }
}

export function canModifyDocument(doc, u=user()) {
  if ( !doc || !u ) return false;
  try { return doc.canUserModify(u, "update"); } catch {
    try { return doc.isOwner; } catch { return Boolean(u.isGM); }
  }
}

export function canCreateDocument(documentName, u=user()) {
  if ( !u ) return false;
  try {
    const cls = globalThis.foundry?.utils?.getDocumentClass?.(documentName) ?? globalThis.CONFIG?.[documentName]?.documentClass;
    if ( cls?.canUserCreate ) return cls.canUserCreate(u);
  } catch {}
  return Boolean(u.isGM);
}

export function isPackVisible(pack, u=user()) {
  if ( !pack ) return false;
  try { return pack.visible !== false; } catch { return Boolean(u?.isGM); }
}

/** A summary used by the diagnostics view and the browser's empty states. */
export function permissionSummary(u=user()) {
  return {
    user: u?.name ?? null,
    isGM: Boolean(u?.isGM),
    browser: canUseBrowser(u),
    files: canBrowseFiles(u),
    sharedOrganization: canEditSharedOrganization(u),
    policy: getSetting(SETTINGS.ACCESS_POLICY)
  };
}
