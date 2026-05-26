import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LedgerError } from "./errors.js";
import { LEDGER_SCHEMA_VERSION, type Ledger, type Lease } from "./types.js";

export const LEDGER_ENV = "AGENTLEASE_LEDGER";

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
    leases: candidate.leases as Lease[]
  };
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
  await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}
