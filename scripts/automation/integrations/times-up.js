import { BaseAdapter } from "./base-adapter.js";

/**
 * Times Up adapter (verified against times-up 14.0.0 sources).
 *
 * On Foundry V14 Times Up only sets `CONFIG.ActiveEffect.expiryAction = "delete"` and intercepts
 * transfer effects; expiry itself is owned by core/dnd5e. The adapter therefore provides no
 * capability of its own; it records the detection so the report can state that durations are
 * handled natively and no second expiry mechanism is scheduled.
 */
export class TimesUpAdapter extends BaseAdapter {
  id = "times-up";

  name = "Times Up";

  minVersion = "14.0.0";

  verifiedVersion = "14.0.0";

  capabilities = [];

  apiNotes = ["V14: sets CONFIG.ActiveEffect.expiryAction = \"delete\"; durations are native."];

  detect() {
    const base = super.detect();
    if ( base.installed ) base.notes.push("Effect durations are owned by Foundry core / dnd5e on V14; Times Up only changes the expiry action.");
    return base;
  }
}

export default TimesUpAdapter;
