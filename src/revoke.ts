import { UsageError } from "./errors.js";
import type { Ledger, Lease } from "./types.js";

export function findLease(ledger: Ledger, selector: string): Lease | undefined {
  const idMatch = ledger.leases.find((lease) => lease.id === selector);
  if (idMatch) {
    return idMatch;
  }

  const nameMatches = ledger.leases.filter((lease) => lease.name === selector);
  if (nameMatches.length > 1) {
    throw ambiguousName(selector, nameMatches.length);
  }

  return nameMatches[0];
}

export function revokeLease(ledger: Ledger, selector: string, now = new Date()): Ledger {
  const match = findLease(ledger, selector);
  if (!match) {
    throw new UsageError(`No lease found for ${selector}.`);
  }

  const leases = ledger.leases.map((lease) => {
    if (lease.id !== match.id) {
      return lease;
    }

    return {
      ...lease,
      revokedAt: lease.revokedAt ?? now.toISOString()
    };
  });

  return {
    ...ledger,
    leases
  };
}

function ambiguousName(name: string, count: number): UsageError {
  return new UsageError(
    `Lease name ${JSON.stringify(name)} matches ${count} leases; revoke by lease ID instead.`
  );
}
