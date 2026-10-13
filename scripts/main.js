/**
 * Stat Block Importer & Automation Engine for Foundry VTT V14 / D&D 5e 6.x.
 * Entry point: registers the lifecycle hooks only. All functionality lives in scripts/.
 */
import { registerLifecycle } from "./core/lifecycle.js";

registerLifecycle();
