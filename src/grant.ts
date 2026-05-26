import { UsageError } from "./errors.js";
import { createLeaseId } from "./ids.js";
import { normalizeLedgerPath } from "./paths.js";
import { addTtl } from "./time.js";
import type { GrantInput, Ledger, Lease } from "./types.js";

function hasScope(input: GrantInput): boolean {
  return (
    input.commands.length > 0 ||
    input.paths.length > 0 ||
    input.domains.length > 0 ||
    input.env.length > 0
  );
}

export function createLease(input: GrantInput): Lease {
  if (input.name.trim() === "") {
    throw new UsageError("Lease name is required.");
  }
  if (!hasScope(input)) {
    throw new UsageError("Grant at least one command, path, domain, or env key.");
  }

  const now = input.now ?? new Date();
  const createdAt = now.toISOString();
  const expiresAt = addTtl(now, input.ttl).toISOString();

  return {
    id: createLeaseId(input.name, createdAt),
    name: input.name,
    createdAt,
    expiresAt,
    reason: input.reason,
    scope: {
      commands: input.commands,
      paths: input.paths.map(normalizeLedgerPath),
      domains: input.domains.map((domain) => domain.toLowerCase()),
      env: input.env
    }
  };
}

export function addLease(ledger: Ledger, lease: Lease): Ledger {
  return {
    ...ledger,
    leases: [...ledger.leases, lease]
  };
}
