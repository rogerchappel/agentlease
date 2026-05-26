import { isExpired } from "./time.js";
import type { Lease, LeaseStatus, LeaseWithStatus } from "./types.js";

export function leaseStatus(lease: Lease, now = new Date()): LeaseStatus {
  if (lease.revokedAt) {
    return "revoked";
  }
  if (isExpired(lease.expiresAt, now)) {
    return "expired";
  }
  return "active";
}

export function withStatus(lease: Lease, now = new Date()): LeaseWithStatus {
  return {
    ...lease,
    status: leaseStatus(lease, now)
  };
}

export function isActive(lease: Lease, now = new Date()): boolean {
  return leaseStatus(lease, now) === "active";
}
