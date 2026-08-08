#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const [stateText, readme] = await Promise.all([
  readFile(new URL("../docs/publication-state.json", import.meta.url), "utf8"),
  readFile(new URL("../README.md", import.meta.url), "utf8")
]);

const state = JSON.parse(stateText);
const registryInstall = /(?:^|\n)\s*(?:```[^\n]*\n)?\s*npm install agentlease\s*(?:\n|$)/m;
const unavailableNotice = /not currently published to npm/i;

if (!new Set(["unpublished", "published"]).has(state.npm)) {
  throw new Error('docs/publication-state.json: "npm" must be "unpublished" or "published"');
}

if (state.npm === "unpublished" && registryInstall.test(readme)) {
  throw new Error("README.md advertises `npm install agentlease` while npm publication state is unpublished");
}

if (state.npm === "unpublished" && !unavailableNotice.test(readme)) {
  throw new Error("README.md must state that agentlease is not currently published to npm");
}

if (state.npm === "published" && !registryInstall.test(readme)) {
  throw new Error("README.md must advertise `npm install agentlease` when npm publication state is published");
}

console.log(`publication docs match npm state: ${state.npm}`);
