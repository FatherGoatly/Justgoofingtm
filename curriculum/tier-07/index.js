import modulesEcosystem from "./modules-ecosystem.js";
import publicApis from "./public-apis.js";
import versionMismatch from "./version-mismatch.js";
import integrationProject from "./integration-project.js";

export const lessons = [modulesEcosystem, publicApis, versionMismatch, integrationProject];

export const tier = {
  number: 7,
  title: "Third-Party Modules and Interoperability",
  objective: "Integrate with the wider Foundry ecosystem as an engineering discipline: read what is installed and its manifests, distinguish public APIs from private internals, detect optional integrations with version floors, isolate them behind adapters with real fallbacks, diagnose version mismatches, and document integration requirements.",
  graduation: "A combat automation that uses a verified optional integration (Midi-QOL 14.6.2 surfaces) when available and degrades gracefully to core APIs when it is not, with both paths tested on fixtures and the dependency documented.",
  lessons: lessons.map(l => l.id),
  capstone: "t7-integration-project",
  achievements: ["integration-specialist"]
};
