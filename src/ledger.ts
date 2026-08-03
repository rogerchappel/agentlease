import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LedgerError } from "./errors.js";
import { LEDGER_SCHEMA_VERSION, type Ledger, type Lease } from "./types.js";

export const LEDGER_ENV = "AGENTLEASE_LEDGER";
const LOCK_RETRY_MS = 25;
const LOCK_TIMEOUT_MS = 5_000;

export function defaultLedgerPath(): string {
  return path.join(process.cwd(), ".agentlease", "ledger.json");
}

export function resolveLedgerPath(override?: string): string {
  const target = override ?? process.env[LEDGER_ENV] ?? defaultLedgerPath();
  if (target.startsWith("~/")) {
    return path.join(os.homedir(), target.slice(2));
  }

  return path.resolve(target);
}

export function emptyLedger(): Ledger {
  return {
    schemaVersion: LEDGER_SCHEMA_VERSION,
    leases: []
  };
}

export function validateLedger(value: unknown): Ledger {
  if (!value || typeof value !== "object") {
    throw new LedgerError("Ledger must be a JSON object.");
  }

  const candidate = value as Partial<Ledger>;
  if (candidate.schemaVersion !== LEDGER_SCHEMA_VERSION) {
    throw new LedgerError(`Unsupported ledger schema version: ${String(candidate.schemaVersion)}.`);
  }

  if (!Array.isArray(candidate.leases)) {
    throw new LedgerError("Ledger leases must be an array.");
  }

  return {
    schemaVersion: LEDGER_SCHEMA_VERSION,
    leases: candidate.leases.map(validateLease)
  };
}

function validateLease(value: unknown, index: number): Lease {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidLease(index, "must be a JSON object");
  }

  const lease = value as Partial<Lease>;
  requireString(lease.id, index, "id");
  requireString(lease.name, index, "name");
  requireDate(lease.createdAt, index, "createdAt");
  requireDate(lease.expiresAt, index, "expiresAt");
  if (lease.revokedAt !== undefined) {
    requireDate(lease.revokedAt, index, "revokedAt");
  }
  if (lease.reason !== undefined) {
    requireString(lease.reason, index, "reason", true);
  }
  if (!lease.scope || typeof lease.scope !== "object" || Array.isArray(lease.scope)) {
    throw invalidLease(index, "scope must be a JSON object");
  }

  requireStringArray(lease.scope.commands, index, "scope.commands");
  requireStringArray(lease.scope.paths, index, "scope.paths");
  requireStringArray(lease.scope.domains, index, "scope.domains");
  requireStringArray(lease.scope.env, index, "scope.env");
  return lease as Lease;
}

function requireString(value: unknown, index: number, field: string, allowEmpty = false): asserts value is string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw invalidLease(index, `${field} must be ${allowEmpty ? "a string" : "a non-empty string"}`);
  }
}

function requireDate(value: unknown, index: number, field: string): asserts value is string {
  requireString(value, index, field);
  if (!Number.isFinite(new Date(value).getTime())) {
    throw invalidLease(index, `${field} must be a valid date string`);
  }
}

function requireStringArray(value: unknown, index: number, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw invalidLease(index, `${field} must be an array of strings`);
  }
}

function invalidLease(index: number, detail: string): LedgerError {
  return new LedgerError(`Invalid lease at index ${index}: ${detail}.`);
}

export async function readLedger(ledgerPath: string): Promise<Ledger> {
  try {
    const raw = await readFile(ledgerPath, "utf8");
    return validateLedger(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyLedger();
    }
    if (error instanceof SyntaxError) {
      throw new LedgerError(`Ledger contains invalid JSON: ${ledgerPath}`);
    }
    throw error;
  }
}

export async function writeLedger(ledgerPath: string, ledger: Ledger): Promise<void> {
  await mkdir(path.dirname(ledgerPath), { recursive: true });
  const temporaryPath = `${ledgerPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
    await rename(temporaryPath, ledgerPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function mutateLedger(
  ledgerPath: string,
  mutation: (ledger: Ledger) => Ledger
): Promise<Ledger> {
  await mkdir(path.dirname(ledgerPath), { recursive: true });
  const lockPath = `${ledgerPath}.lock`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let lock;

  while (!lock) {
    try {
      lock = await open(lockPath, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      if (Date.now() >= deadline) {
        throw new LedgerError(`Timed out waiting ${LOCK_TIMEOUT_MS}ms for ledger lock: ${lockPath}`);
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }

  try {
    const ledger = mutation(await readLedger(ledgerPath));
    await writeLedger(ledgerPath, ledger);
    return ledger;
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
