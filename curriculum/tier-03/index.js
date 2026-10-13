import foundryGlobals from "./foundry-globals.js";
import documents from "./documents.js";
import collections from "./collections.js";
import selectedTokens from "./selected-tokens.js";
import chatAndDialogs from "./chat-and-dialogs.js";
import permissions from "./permissions.js";
import sceneInspector from "./scene-inspector.js";

export const lessons = [foundryGlobals, documents, collections, selectedTokens, chatAndDialogs, permissions, sceneInspector];

export const tier = {
  number: 3,
  title: "Understanding Foundry VTT",
  objective: "Connect JavaScript to the real Foundry environment: the globals, documents and collections, tokens and actors, chat and dialogs, permissions, settings and the lifecycle, inspecting without modifying.",
  graduation: "A read-only scene inspector that reports selected tokens, their actors, linked and ownership status, hit points, combat state and user permissions as a whispered chat card.",
  lessons: lessons.map(l => l.id),
  capstone: "t3-scene-inspector",
  achievements: ["foundry-explorer"]
};
