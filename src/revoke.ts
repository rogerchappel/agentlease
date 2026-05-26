import { UsageError } from "./errors.js";
import type { Ledger, Lease } from "./types.js";

export function findLease(ledger: Ledger, selector: string): Lease | undefined {
  return ledger.leases.find((lease) => lease.id === selector || lease.name === selector);
}

export function revokeLease(ledger: Ledger, selector: string, now = new Date()): Ledger {
  let found = false;

  const leases = ledger.leases.map((lease) => {
    if (lease.id !== selector && lease.name !== selector) {
      return lease;
    }

    found = true;
    return {
      ...lease,
      revokedAt: lease.revokedAt ?? now.toISOString()
    };
  });

  if (!found) {
    throw new UsageError(`No lease found for ${selector}.`);
  }

  return {
    ...ledger,
    leases
  };
}
