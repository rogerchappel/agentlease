#!/usr/bin/env node
import process from "node:process";

import { checkLedger } from "./check.js";
import { UsageError } from "./errors.js";
import { addLease, createLease } from "./grant.js";
import { readLedger, resolveLedgerPath, writeLedger } from "./ledger.js";
import { revokeLease } from "./revoke.js";
import { withStatus } from "./status.js";
import type { CheckInput, GrantInput } from "./types.js";

const VERSION = "0.1.0";

async function main(argv: string[]): Promise<number> {
  try {
    const command = argv[0];
    if (!command || command === "--help" || command === "-h") {
      process.stdout.write(helpText());
      return 0;
    }

    if (command === "--version" || command === "-v") {
      process.stdout.write(`${VERSION}\n`);
      return 0;
    }

    const args = argv.slice(1);
    const ledgerPath = readOption(args, "--ledger");

    if (command === "grant") {
      const lease = createLease(parseGrant(args));
      await writeLedger(resolveLedgerPath(ledgerPath), addLease(await readLedger(resolveLedgerPath(ledgerPath)), lease));
      process.stdout.write(`${JSON.stringify(lease, null, 2)}\n`);
      return 0;
    }

    if (command === "list") {
      const ledger = await readLedger(resolveLedgerPath(ledgerPath));
      process.stdout.write(`${JSON.stringify(ledger.leases.map((lease) => withStatus(lease)), null, 2)}\n`);
      return 0;
    }

    if (command === "check") {
      const decision = checkLedger(await readLedger(resolveLedgerPath(ledgerPath)), parseCheck(args));
      process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
      return decision.allow ? 0 : 1;
    }

    if (command === "revoke") {
      const selector = positionalArgs(args)[0];
      if (!selector) {
        throw new UsageError("revoke requires a lease id or name.");
      }

      await writeLedger(resolveLedgerPath(ledgerPath), revokeLease(await readLedger(resolveLedgerPath(ledgerPath)), selector));
      process.stdout.write(`revoked ${selector}\n`);
      return 0;
    }

    throw new UsageError(`Unknown command: ${command}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`agentlease: ${message}\n`);
    return error instanceof UsageError ? 2 : 1;
  }
}

function parseGrant(args: string[]): GrantInput {
  return {
    name: required(readOption(args, "--name"), "--name is required"),
    ttl: readOption(args, "--ttl") ?? "1h",
    reason: readOption(args, "--reason"),
    commands: readRepeated(args, "--command"),
    paths: readRepeated(args, "--path"),
    domains: readRepeated(args, "--domain"),
    env: readRepeated(args, "--env")
  };
}

function parseCheck(args: string[]): CheckInput {
  return {
    command: readOption(args, "--command"),
    path: readOption(args, "--path"),
    domain: readOption(args, "--domain"),
    env: readOption(args, "--env")
  };
}

function readOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

function readRepeated(args: readonly string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) {
      values.push(args[index + 1]);
    }
  }

  return values;
}

function positionalArgs(args: readonly string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }

    if (arg.startsWith("--")) {
      index += 1;
      continue;
    }

    values.push(arg);
  }

  return values;
}

function required(value: string | undefined, message: string): string {
  if (!value) {
    throw new UsageError(message);
  }

  return value;
}

function helpText(): string {
  return `Usage:
  agentlease grant --name NAME [--ttl 1h] [--command CMD] [--path PATH] [--domain HOST] [--env KEY] [--ledger FILE]
  agentlease check [--command CMD] [--path PATH] [--domain HOST] [--env KEY] [--ledger FILE]
  agentlease list [--ledger FILE]
  agentlease revoke ID_OR_NAME [--ledger FILE]
`;
}

main(process.argv.slice(2)).then((exitCode) => {
  process.exitCode = exitCode;
});
