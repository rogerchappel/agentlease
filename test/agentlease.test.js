import assert from "node:assert/strict";
import { test } from "node:test";

import { addLease, checkLedger, createLease, emptyLedger, revokeLease } from "../dist/index.js";

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
