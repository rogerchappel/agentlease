import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { addLease, checkLedger, createLease, emptyLedger, revokeLease } from "../dist/index.js";

function runCli(args) {
  return spawnSync(process.execPath, ["dist/cli.js", ...args], { encoding: "utf8" });
}

function runCliAsync(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["dist/cli.js", ...args]);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function waitForFile(filePath) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (existsSync(filePath)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for fixture file: ${filePath}`);
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

test("grant rejects blank scope values with field-specific usage errors", () => {
  for (const option of ["--command", "--path", "--domain", "--env"]) {
    for (const value of ["", " \t "]) {
      const result = runCli(["grant", "--name", "blank", option, value]);
      assert.equal(result.status, 2, `${option} ${JSON.stringify(value)}\n${result.stderr}`);
      assert.equal(result.stderr, `agentlease: ${option} requires a non-blank value.\n`);
      assert.equal(result.stdout, "");
    }
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
      "--domain", "example.com",
      "--domain", "api.example.com",
      "--env", "CI",
      "--env", "NODE_ENV",
      "--ledger", ledgerPath
    ]);
    assert.equal(result.status, 0, result.stderr);

    const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
    assert.deepEqual(ledger.leases[0].scope.commands, ["npm test", "npm run build"]);
    assert.deepEqual(ledger.leases[0].scope.paths, [
      path.resolve("src"),
      path.resolve("test")
    ]);
    assert.deepEqual(ledger.leases[0].scope.domains, ["example.com", "api.example.com"]);
    assert.deepEqual(ledger.leases[0].scope.env, ["CI", "NODE_ENV"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("concurrent CLI mutations retain every successful grant and revoke", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "agentlease-concurrent-"));
  const ledgerPath = path.join(directory, "ledger.json");
  const count = 16;

  try {
    const initial = await Promise.all(Array.from({ length: count }, (_, index) =>
      runCliAsync(["grant", "--name", `old-${index}`, "--command", `old-${index}`, "--ledger", ledgerPath])
    ));
    for (const result of initial) {
      assert.equal(result.status, 0, result.stderr);
    }

    const mutations = await Promise.all([
      ...Array.from({ length: count }, (_, index) =>
        runCliAsync(["revoke", `old-${index}`, "--ledger", ledgerPath])
      ),
      ...Array.from({ length: count }, (_, index) =>
        runCliAsync(["grant", "--name", `new-${index}`, "--command", `new-${index}`, "--ledger", ledgerPath])
      )
    ]);
    for (const result of mutations) {
      assert.equal(result.status, 0, result.stderr);
    }

    const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
    assert.equal(ledger.leases.length, count * 2);
    for (let index = 0; index < count; index += 1) {
      assert.ok(ledger.leases.find((lease) => lease.name === `old-${index}`)?.revokedAt);
      assert.ok(ledger.leases.find((lease) => lease.name === `new-${index}`));
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a superseded lock owner cannot remove the replacement lock during cleanup", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "agentlease-lock-handoff-"));
  const ledgerPath = path.join(directory, "ledger.json");
  const lockPath = `${ledgerPath}.lock`;
  const enteredPath = path.join(directory, "entered");
  const continuePath = path.join(directory, "continue");
  const replacement = { pid: process.pid, token: "replacement-owner" };
  const script = `
    import { existsSync, writeFileSync } from "node:fs";
    import { mutateLedger } from ${JSON.stringify(new URL("../dist/index.js", import.meta.url).href)};
    await mutateLedger(${JSON.stringify(ledgerPath)}, (ledger) => {
      writeFileSync(${JSON.stringify(enteredPath)}, "ready");
      while (!existsSync(${JSON.stringify(continuePath)})) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      }
      return ledger;
    });
  `;

  try {
    const child = spawn(process.execPath, ["--input-type=module", "--eval", script]);
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    const completion = new Promise((resolve) => child.on("close", (status) => resolve({ status, stderr })));

    await waitForFile(enteredPath);
    unlinkSync(lockPath);
    writeFileSync(lockPath, `${JSON.stringify(replacement)}\n`);
    writeFileSync(continuePath, "continue");

    const result = await completion;
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(lockPath, "utf8")), replacement);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("mutation recovers a lock whose recorded owner no longer exists", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "agentlease-abandoned-lock-"));
  const ledgerPath = path.join(directory, "ledger.json");
  const lockPath = `${ledgerPath}.lock`;

  try {
    writeFileSync(lockPath, JSON.stringify({ pid: 2_147_483_647, token: "abandoned-fixture" }));
    const result = runCli(["grant", "--name", "recovered", "--path", "docs", "--ledger", ledgerPath]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(ledgerPath, "utf8")).leases[0].name, "recovered");
    assert.throws(() => readFileSync(lockPath), { code: "ENOENT" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("mutation times out without disturbing a lock held by a live process", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "agentlease-live-lock-"));
  const ledgerPath = path.join(directory, "ledger.json");
  const lockPath = `${ledgerPath}.lock`;
  const owner = { pid: process.pid, token: "live-fixture" };

  try {
    writeFileSync(lockPath, JSON.stringify(owner));
    const startedAt = Date.now();
    const result = runCli(["grant", "--name", "blocked", "--path", "docs", "--ledger", ledgerPath]);
    const elapsed = Date.now() - startedAt;
    assert.equal(result.status, 1);
    assert.equal(result.stderr, `agentlease: Timed out waiting 5000ms for ledger lock: ${lockPath}\n`);
    assert.ok(elapsed >= 5_000, `returned before the documented timeout: ${elapsed}ms`);
    assert.deepEqual(JSON.parse(readFileSync(lockPath, "utf8")), owner);
    assert.throws(() => readFileSync(ledgerPath), { code: "ENOENT" });
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

test("createLease rejects blank scope values before normalization", () => {
  const scopeFields = ["commands", "paths", "domains", "env"];
  for (const field of scopeFields) {
    const input = {
      name: "blank",
      ttl: "1h",
      commands: [],
      paths: [],
      domains: [],
      env: [],
      [field]: [" \t "]
    };
    assert.throws(
      () => createLease(input),
      { name: "UsageError", message: `${field} must not contain blank values.` }
    );
  }
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

test("persisted leases reject blank scope entries with stable ledger errors", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "agentlease-blank-ledger-"));
  const ledgerPath = path.join(directory, "ledger.json");
  const baseLease = createLease({
    name: "valid",
    ttl: "1h",
    commands: ["npm test"],
    paths: [],
    domains: [],
    env: []
  });

  try {
    for (const field of ["commands", "paths", "domains", "env"]) {
      const lease = structuredClone(baseLease);
      lease.scope[field] = ["  "];
      writeFileSync(ledgerPath, JSON.stringify({ schemaVersion: 1, leases: [lease] }));
      const result = runCli(["list", "--ledger", ledgerPath]);
      assert.equal(result.status, 1, result.stderr);
      assert.equal(
        result.stderr,
        `agentlease: Invalid lease at index 0: scope.${field} must not contain blank strings.\n`
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("commands reject duplicate persisted lease IDs without changing the ledger", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "agentlease-duplicate-id-"));
  const ledgerPath = path.join(directory, "ledger.json");
  const first = createLease({ name: "first", ttl: "1h", commands: ["first"], paths: [], domains: [], env: [] });
  const second = { ...createLease({ name: "second", ttl: "1h", commands: ["second"], paths: [], domains: [], env: [] }), id: first.id };

  try {
    const original = `${JSON.stringify({ schemaVersion: 1, leases: [first, second] }, null, 2)}\n`;
    writeFileSync(ledgerPath, original);
    for (const args of [
      ["list", "--ledger", ledgerPath],
      ["check", "--command", "first", "--ledger", ledgerPath],
      ["revoke", first.id, "--ledger", ledgerPath]
    ]) {
      const result = runCli(args);
      assert.equal(result.status, 1, `${args.join(" ")}\n${result.stderr}`);
      assert.equal(result.stderr, `agentlease: Invalid lease at index 1: id ${JSON.stringify(first.id)} duplicates an earlier lease.\n`);
      assert.equal(result.stdout, "");
      assert.equal(readFileSync(ledgerPath, "utf8"), original);
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

test("revoke rejects an ambiguous name without mutating the ledger", () => {
  const first = createLease({
    name: "shared", ttl: "1h", commands: ["first"], paths: [], domains: [], env: []
  });
  const second = createLease({
    name: "shared", ttl: "1h", commands: ["second"], paths: [], domains: [], env: []
  });
  const ledger = addLease(addLease(emptyLedger(), first), second);
  const before = structuredClone(ledger);

  assert.throws(
    () => revokeLease(ledger, "shared"),
    {
      name: "UsageError",
      message: 'Lease name "shared" matches 2 leases; revoke by lease ID instead.'
    }
  );
  assert.deepEqual(ledger, before);
});

test("revoke accepts a unique name and an ID selects exactly one duplicate", () => {
  const unique = createLease({
    name: "unique", ttl: "1h", commands: ["unique"], paths: [], domains: [], env: []
  });
  const first = createLease({
    name: "shared", ttl: "1h", commands: ["first"], paths: [], domains: [], env: []
  });
  const second = createLease({
    name: "shared", ttl: "1h", commands: ["second"], paths: [], domains: [], env: []
  });
  const ledger = addLease(addLease(addLease(emptyLedger(), unique), first), second);
  const now = new Date("2026-01-01T00:10:00.000Z");

  const uniqueRevoked = revokeLease(ledger, "unique", now);
  assert.equal(uniqueRevoked.leases.find((lease) => lease.id === unique.id)?.revokedAt, now.toISOString());

  const idRevoked = revokeLease(ledger, first.id, now);
  assert.equal(idRevoked.leases.find((lease) => lease.id === first.id)?.revokedAt, now.toISOString());
  assert.equal(idRevoked.leases.find((lease) => lease.id === second.id)?.revokedAt, undefined);
});

test("cli reports duplicate-name ambiguity and preserves the ledger", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "agentlease-revoke-"));
  const ledgerPath = path.join(directory, "ledger.json");

  try {
    assert.equal(runCli(["grant", "--name", "shared", "--command", "first", "--ledger", ledgerPath]).status, 0);
    assert.equal(runCli(["grant", "--name", "shared", "--command", "second", "--ledger", ledgerPath]).status, 0);
    const before = readFileSync(ledgerPath, "utf8");

    const ambiguous = runCli(["revoke", "shared", "--ledger", ledgerPath]);
    assert.equal(ambiguous.status, 2, ambiguous.stderr);
    assert.equal(
      ambiguous.stderr,
      'agentlease: Lease name "shared" matches 2 leases; revoke by lease ID instead.\n'
    );
    assert.equal(ambiguous.stdout, "");
    assert.equal(readFileSync(ledgerPath, "utf8"), before);

    const leases = JSON.parse(before).leases;
    const precise = runCli(["revoke", leases[0].id, "--ledger", ledgerPath]);
    assert.equal(precise.status, 0, precise.stderr);
    const after = JSON.parse(readFileSync(ledgerPath, "utf8")).leases;
    assert.ok(after[0].revokedAt);
    assert.equal(after[1].revokedAt, undefined);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
