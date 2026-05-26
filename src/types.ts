export const LEDGER_SCHEMA_VERSION = 1;

export type LeaseStatus = "active" | "expired" | "revoked";

export interface LeaseScope {
  commands: string[];
  paths: string[];
  domains: string[];
  env: string[];
}

export interface Lease {
  id: string;
  name: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  reason?: string;
  scope: LeaseScope;
}

export interface Ledger {
  schemaVersion: number;
  leases: Lease[];
}

export interface GrantInput {
  name: string;
  ttl: string;
  commands: string[];
  paths: string[];
  domains: string[];
  env: string[];
  reason?: string;
  now?: Date;
}

export interface CheckInput {
  command?: string;
  path?: string;
  domain?: string;
  env?: string;
  now?: Date;
}

export interface CheckDecision {
  allow: boolean;
  reason: string;
  lease?: Lease;
  matchedScopes: string[];
}

export interface LeaseWithStatus extends Lease {
  status: LeaseStatus;
}
