# agentlease Orchestration

`agentlease` is a local policy ledger. Wrappers can grant scoped leases before
work starts and call `agentlease check` before actions that need approval.

## Pipeline

1. Resolve ledger path from `--ledger`, `AGENTLEASE_LEDGER`, or the local default.
2. Read or initialize the JSON ledger.
3. Grant, list, check, or revoke leases.
4. Return JSON output and shell-friendly exit codes.

## Checks

```sh
npm run check
npm test
npm run smoke
npm run package:smoke
```
