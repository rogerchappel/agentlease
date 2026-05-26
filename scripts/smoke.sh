#!/usr/bin/env bash
set -euo pipefail

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

ledger="$tmpdir/ledger.json"

node dist/cli.js grant --ledger "$ledger" --name docs --ttl 1h --command "npm test" --path docs >/dev/null
node dist/cli.js check --ledger "$ledger" --command "npm test" --path docs/README.md >/dev/null

if node dist/cli.js check --ledger "$ledger" --command "npm publish" >/dev/null 2>&1; then
  echo "expected unmatched check to fail" >&2
  exit 1
fi

node dist/cli.js revoke --ledger "$ledger" docs >/dev/null

if node dist/cli.js check --ledger "$ledger" --command "npm test" --path docs/README.md >/dev/null 2>&1; then
  echo "expected revoked lease to fail" >&2
  exit 1
fi
