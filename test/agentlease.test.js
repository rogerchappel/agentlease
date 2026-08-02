import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("cli rejects TTLs that overflow milliseconds or the supported date range", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "agentlease-ttl-"));
  const ledgerPath = path.join(directory, "ledger.json");

  try {
    for (const ttl of ["9007199254740991d", "100000000d"]) {
      const result = runCli([
        "grant", "--name", "overflow", "--command", "npm test", "--ttl", ttl,
        "--ledger", ledgerPath
      ]);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /^agentlease: TTL .+/);
      assert.equal(result.stdout, "");
      assert.throws(() => readFileSync(ledgerPath), { code: "ENOENT" });
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("createLease accepts an expiry at the supported Date boundary", () => {
  const lease = createLease({
    name: "boundary",
    ttl: "100000000d",
    commands: ["npm test"],
    paths: [],
    domains: [],
    env: [],
    now: new Date(0)
  });

  assert.equal(lease.expiresAt, "+275760-09-13T00:00:00.000Z");
});

test("list and check report malformed persisted leases as ledger errors", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "agentlease-malformed-"));
  const ledgerPath = path.join(directory, "ledger.json");

  try {
    writeFileSync(ledgerPath, JSON.stringify({
      schemaVersion: 1,
      leases: [{ name: "broken" }]
    }));

    for (const args of [
      ["list", "--ledger", ledgerPath],
      ["check", "--command", "npm test", "--ledger", ledgerPath],
      ["revoke", "broken", "--ledger", ledgerPath]
    ]) {
      const result = runCli(args);
      assert.equal(result.status, 1, `${args.join(" ")}\n${result.stderr}`);
      assert.equal(result.stderr, "agentlease: Invalid lease at index 0: id must be a non-empty string.\n");
      assert.equal(result.stdout, "");
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("list and check accept a fully valid persisted lease", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "agentlease-valid-"));
  const ledgerPath = path.join(directory, "ledger.json");
  const lease = createLease({
    name: "valid",
    ttl: "1h",
    commands: ["npm test"],
    paths: [],
    domains: [],
    env: [],
    now: new Date("2099-01-01T00:00:00.000Z")
  });

  try {
    writeFileSync(ledgerPath, JSON.stringify({ schemaVersion: 1, leases: [lease] }));
    assert.equal(runCli(["list", "--ledger", ledgerPath]).status, 0);
    assert.equal(runCli(["check", "--command", "npm test", "--ledger", ledgerPath]).status, 0);
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
