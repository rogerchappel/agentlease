# agentlease

Local time-boxed permission leases for coding-agent sessions.

## Status

This repository is early-stage. It stores a local JSON ledger and returns
deterministic allow/deny decisions; it does not enforce permissions by itself.

## Install

`agentlease` is not currently published to npm. Until the first publication,
install and run it from a source checkout:

```sh
git clone https://github.com/rogerchappel/agentlease.git
cd agentlease
npm ci
npm run build
npm run smoke
npm link
```

After the package is published, this bootstrap path will be replaced by
`npm install agentlease`. Publication status is recorded in
[`docs/publication-state.json`](docs/publication-state.json) and checked by
`npm run docs:check`.

## Use

```sh
agentlease grant --name docs-pass --path ./docs --command "npm test" --ttl 2h
agentlease check --command "npm test" --path ./docs/PRD.md
agentlease list
agentlease revoke lease_0123456789ab
```

Scope options on `grant` (`--command`, `--path`, `--domain`, and `--env`) may
be repeated to add multiple values. Each scope value must contain at least one
non-whitespace character. Empty, whitespace-only, missing, and option-like
values are rejected with exit code 2, as are unknown options.

`revoke` accepts a lease ID or a unique lease name. Names are convenient when
only one lease has that name; if names collide, the command exits with code 2
without changing the ledger. Use the ID shown by `grant` or `list` as the
precise selector.

Lease IDs are unique within a valid ledger. A persisted duplicate ID is treated
as ledger corruption, so `list`, `check`, and `revoke` stop before reading or
mutating partial state. Consequently, revoking by ID always targets exactly one
lease.

Use `--ledger path/to/ledger.json` or `AGENTLEASE_LEDGER` to choose a ledger
outside the default `.agentlease/ledger.json`.

The ledger is validated whenever it is read. If it contains invalid JSON or a
malformed lease, commands stop with a stable `agentlease:` error instead of
using partial data. Repair the reported field or move the corrupt ledger aside
and grant replacement leases; a missing ledger is recreated on the next grant.
Each persisted lease must retain at least one command, path, domain, or
environment scope value, and its expiry must equal or follow its creation time.
An invariant error identifies the lease index and invalid field so the entry can
be repaired or replaced without guessing which lease caused the failure.

`grant` and `revoke` serialize updates from concurrent CLI processes with a
ledger-adjacent lock file, then atomically replace the ledger after writing the
complete new JSON to a temporary file. Successfully reported mutations are
therefore retained without exposing partial JSON to readers. Lock contention is
retried for up to 5 seconds; after that the command fails without changing the
ledger and reports the lock path. Lock files record their owning process. If
that process no longer exists, the next mutation safely removes the abandoned
lock while holding a separate recovery lock, then proceeds normally. A lock
with invalid or legacy owner metadata is not removed automatically; after the
timeout, confirm that no `agentlease` mutation is running before removing it.

## Limitations

- `agentlease` answers whether a command/path pair has a matching local lease; it does not sandbox or block the command by itself.
- Lease checks are only as current as the JSON ledger passed to the CLI. Keep the ledger in the same workspace policy flow that grants the permission.
- Path matching is intended for repository-relative work. Review leases carefully before using broad paths such as `.` or a parent directory.
- The CLI does not contact remote policy services, rotate credentials, or replace human approval for destructive actions.

## Verify

Run the local validation script before opening a pull request:

```sh
bash scripts/validate.sh
```

`scripts/validate.sh` runs the repository's standard local checks when they are defined and will also run `agent-qc ready` when `agent-qc` is installed. Missing `agent-qc` is treated as a skip, not a failure.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution expectations. Changes
should be small, reviewable, and verified before review.

## Security

See [SECURITY.md](SECURITY.md) for the supported-version policy and
vulnerability reporting guidance.

## License

MIT

## Verification

```bash
npm test              # Run tests
npm run check         # Type-check only
npm run build         # TypeScript compilation
npm run package:smoke # Verify npm pack contents
npm run release:check # Full release checklist
```

## Release Verification

Before publishing or tagging a release, run the local verification path that matches CI:

- `npm run release:check`
- `npm run package:smoke`

The release checklist in `docs/release-readiness.md` captures the package surface, CLI bins, and reviewer notes for future release PRs.
`npm run package:smoke` asserts that the packed tarball includes the compiled CLI,
release-readiness docs, and public support files.
