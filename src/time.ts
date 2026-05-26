import { UsageError } from "./errors.js";

const TTL_PATTERN = /^(\d+)(s|m|h|d)$/;

const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000
};

export function parseTtl(ttl: string): number {
  const match = TTL_PATTERN.exec(ttl.trim());
  if (!match) {
    throw new UsageError("TTL must use a positive integer followed by s, m, h, or d.");
  }

  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new UsageError("TTL must be a positive safe integer.");
  }

  return amount * UNIT_MS[match[2]];
}

export function addTtl(now: Date, ttl: string): Date {
  return new Date(now.getTime() + parseTtl(ttl));
}

export function isExpired(expiresAt: string, now: Date): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}
