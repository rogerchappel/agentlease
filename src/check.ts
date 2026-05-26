import { matchesLease } from "./match.js";
import { isActive } from "./status.js";
import type { CheckDecision, CheckInput, Ledger } from "./types.js";

export function checkLedger(ledger: Ledger, input: CheckInput): CheckDecision {
  const now = input.now ?? new Date();

  for (const lease of ledger.leases) {
    if (!isActive(lease, now)) {
      continue;
    }

    const result = matchesLease(lease, input);
    if (result.matches) {
      return {
        allow: true,
        reason: "matched active lease",
        lease,
        matchedScopes: result.matchedScopes
      };
    }
  }

  return {
    allow: false,
    reason: "no active lease matched",
    matchedScopes: []
  };
}
