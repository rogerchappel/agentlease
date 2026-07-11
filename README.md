# agentlease

Local time-boxed permission leases for coding-agent sessions.

## Status

This repository is early-stage. It stores a local JSON ledger and returns
deterministic allow/deny decisions; it does not enforce permissions by itself.

## Install

```sh
npm install
npm run build
```

## Use

```sh
agentlease grant --name docs-pass --path ./docs --command "npm test" --ttl 2h
agentlease check --command "npm test" --path ./docs/PRD.md
agentlease list
agentlease revoke docs-pass
```

Use `--ledger path/to/ledger.json` or `AGENTLEASE_LEDGER` to choose a ledger
outside the default `.agentlease/ledger.json`.

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
