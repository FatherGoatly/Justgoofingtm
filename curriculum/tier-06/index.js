import modularDesign from "./modular-design.js";
import configuration from "./configuration.js";
import hooksEvents from "./hooks-events.js";
import asyncRobustness from "./async-robustness.js";
import performanceLogging from "./performance-logging.js";
import automationToolkit from "./automation-toolkit.js";

export const lessons = [modularDesign, configuration, hooksEvents, asyncRobustness, performanceLogging, automationToolkit];

export const tier = {
  number: 6,
  title: "Advanced Macro Engineering",
  objective: "Move from isolated scripts to robust, reusable systems: modular design with modern syntax, configuration-driven behaviour, disciplined hooks and events, asynchronous robustness, performance, logging and dependency checks.",
  graduation: "A reusable automation toolkit with a configuration layer, shared helper functions, diagnostics, idempotent hook registration and meaningful error handling, plus a consumer macro that uses it.",
  lessons: lessons.map(l => l.id),
  capstone: "t6-automation-toolkit",
  achievements: ["automation-engineer"]
};
