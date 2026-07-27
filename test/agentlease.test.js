import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { addLease, checkLedger, createLease, emptyLedger, revokeLease } from "../dist/index.js";

function runCli(args) {
  return spawnSync(process.execPath, ["dist/cli.js", ...args], { encoding: "utf8" });
}

test("cli help and version exit successfully", () => {
  const help = runCli(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage:/);

  const version = runCli(["--version"]);
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout, /^0\.1\.0/);
});

test("cli rejects unknown options and option-like missing values", () => {
  const malformed = [
    ["grant", "--name", "demo", "--command", "--ttl", "2h"],
    ["check", "--command", "--path", "docs"],
    ["list", "--bogus", "value"],
    ["revoke", "demo", "--bogus", "value"]
  ];

  for (const args of malformed) {
    const result = runCli(args);
    assert.equal(result.status, 2, `${args.join(" ")}\n${result.stderr}`);
    assert.match(result.stderr, /^agentlease: .+/);
    assert.equal(result.stdout, "");
  }
});

test("cli accepts repeated grant scope options", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "agentlease-cli-"));
  const ledgerPath = path.join(directory, "ledger.json");

  try {
    const result = runCli([
      "grant",
      "--name", "release",
      "--command", "npm test",
      "--command", "npm run build",
      "--path", "src",
      "--path", "test",
      "--ledger", ledgerPath
    ]);
    assert.equal(result.status, 0, result.stderr);

    const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
    assert.deepEqual(ledger.leases[0].scope.commands, ["npm test", "npm run build"]);
    assert.deepEqual(ledger.leases[0].scope.paths, [
      path.resolve("src"),
      path.resolve("test")
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("granted leases allow matching scoped checks", () => {
  const lease = createLease({
    name: "docs",
    ttl: "1h",
    commands: ["npm test"],
    paths: ["docs"],
    domains: [],
    env: [],
    now: new Date("2026-01-01T00:00:00.000Z")
  });
  const ledger = addLease(emptyLedger(), lease);

  assert.equal(checkLedger(ledger, {
    command: "npm test",
    path: "docs/README.md",
    now: new Date("2026-01-01T00:05:00.000Z")
  }).allow, true);
});

test("revoked leases deny future checks", () => {
  const lease = createLease({
    name: "net",
    ttl: "1h",
    commands: [],
    paths: [],
    domains: ["example.com"],
    env: [],
    now: new Date("2026-01-01T00:00:00.000Z")
  });
  const ledger = revokeLease(addLease(emptyLedger(), lease), "net", new Date("2026-01-01T00:10:00.000Z"));

  assert.equal(checkLedger(ledger, {
    domain: "api.example.com",
    now: new Date("2026-01-01T00:15:00.000Z")
  }).allow, false);
});
