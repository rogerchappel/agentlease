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
agentlease revoke docs-pass
```

Scope options on `grant` (`--command`, `--path`, `--domain`, and `--env`) may
be repeated to add multiple values. Every option requires a value; unknown
options and option-like missing values are rejected with exit code 2.

Use `--ledger path/to/ledger.json` or `AGENTLEASE_LEDGER` to choose a ledger
outside the default `.agentlease/ledger.json`.

The ledger is validated whenever it is read. If it contains invalid JSON or a
malformed lease, commands stop with a stable `agentlease:` error instead of
using partial data. Repair the reported field or move the corrupt ledger aside
and grant replacement leases; a missing ledger is recreated on the next grant.

`grant` and `revoke` serialize updates from concurrent CLI processes with a
ledger-adjacent lock file, then atomically replace the ledger after writing the
complete new JSON to a temporary file. Successfully reported mutations are
therefore retained without exposing partial JSON to readers. Lock contention is
retried for up to 5 seconds; after that the command fails without changing the
ledger and reports the lock path. A process terminated while holding the lock
may leave that `.lock` file behind; remove it only after confirming no
`agentlease` mutation is still running.

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
