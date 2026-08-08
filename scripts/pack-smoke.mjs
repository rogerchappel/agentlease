#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const expectedFiles = [
  "dist/cli.js",
  "dist/index.js",
  "dist/index.d.ts",
  "docs/release-readiness.md",
  "docs/publication-state.json",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md"
];

const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"]
});

const [pack] = JSON.parse(output);
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const expectedName = "agentlease";
const expectedFilename = `${expectedName}-${packageJson.version}.tgz`;

const identityErrors = [
  pack.name === packageJson.name ? null : `packed name ${pack.name} does not match package.json name ${packageJson.name}`,
  pack.name === expectedName ? null : `packed name ${pack.name} does not match documented install identity ${expectedName}`,
  pack.version === packageJson.version ? null : `packed version ${pack.version} does not match package.json version ${packageJson.version}`,
  pack.filename === expectedFilename ? null : `packed filename ${pack.filename} does not match ${expectedFilename}`
].filter(Boolean);

if (identityErrors.length > 0) {
  console.error("agentlease package smoke failed; package identity mismatch:");
  for (const error of identityErrors) console.error(`- ${error}`);
  process.exit(1);
}

const publishedFiles = new Set(pack.files.map((file) => file.path));
const missing = expectedFiles.filter((file) => !publishedFiles.has(file));

if (missing.length > 0) {
  console.error("agentlease package smoke failed; missing expected file(s):");
  for (const file of missing) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

if (packageJson.bin?.agentlease !== "./dist/cli.js") {
  console.error("agentlease package smoke failed; expected agentlease bin in package metadata.");
  process.exit(1);
}

console.log(`agentlease package smoke passed with ${pack.files.length} packed file(s).`);
