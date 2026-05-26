import { isPathInside } from "./paths.js";
import type { CheckInput, Lease } from "./types.js";

export interface MatchResult {
  matches: boolean;
  matchedScopes: string[];
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, "");
}

function domainMatches(candidate: string, allowed: string): boolean {
  const normalizedCandidate = normalizeDomain(candidate);
  const normalizedAllowed = normalizeDomain(allowed);

  return (
    normalizedCandidate === normalizedAllowed ||
    normalizedCandidate.endsWith(`.${normalizedAllowed}`)
  );
}

function commandMatches(candidate: string, allowed: string): boolean {
  return candidate.trim() === allowed.trim();
}

export function matchesLease(lease: Lease, input: CheckInput): MatchResult {
  const matchedScopes: string[] = [];

  if (input.command !== undefined) {
    if (!lease.scope.commands.some((allowed) => commandMatches(input.command ?? "", allowed))) {
      return { matches: false, matchedScopes };
    }
    matchedScopes.push("command");
  }

  if (input.path !== undefined) {
    if (!lease.scope.paths.some((allowed) => isPathInside(input.path ?? "", allowed))) {
      return { matches: false, matchedScopes };
    }
    matchedScopes.push("path");
  }

  if (input.domain !== undefined) {
    if (!lease.scope.domains.some((allowed) => domainMatches(input.domain ?? "", allowed))) {
      return { matches: false, matchedScopes };
    }
    matchedScopes.push("domain");
  }

  if (input.env !== undefined) {
    if (!lease.scope.env.includes(input.env)) {
      return { matches: false, matchedScopes };
    }
    matchedScopes.push("env");
  }

  return { matches: matchedScopes.length > 0, matchedScopes };
}
