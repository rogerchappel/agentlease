# Release Readiness

Use this checklist before cutting a release or asking a reviewer to trust the package contents.

## npm trusted publishing

Before the first tag release, an npm package owner must create the `agentlease` package once if it does not yet exist, then configure an npm trusted publisher for GitHub Actions using repository `rogerchappel/agentlease`, workflow filename `release.yml`, and the npm `latest` tag. The workflow's `id-token: write` permission and npm 11.5.2 provide provenance-backed OIDC publication; no long-lived npm token is required.

The machine-readable npm publication state lives in
`docs/publication-state.json`. Keep it set to `unpublished` until the package
can be installed from the public registry. After the first publication, change
it to `published` and replace the README source-bootstrap instructions with
`npm install agentlease` in the same change. `npm run docs:check` enforces that
the README and publication state agree.

Tagged releases publish the exact tarball produced and inspected by `npm pack` before attaching that same file to the GitHub release. Pull-request and manually dispatched release dry runs only validate and preview notes; they never publish.

If npm publication succeeds but GitHub release creation fails, do not republish or move the tag. Confirm the package version and provenance on npm, then rerun only the GitHub release creation with the existing tag and exact tarball rebuilt from that tag. If npm publication fails, no GitHub release is created; fix the trusted-publisher or package bootstrap configuration and rerun the tag workflow only while that version remains unpublished.

## Public Package Surface

- Package: `agentlease`
- Repository: `https://github.com/rogerchappel/agentlease`
- Published files are controlled by the `files` allowlist in `package.json`.

## CLI Surface

- `agentlease` -> `./dist/cli.js`

## Verification Commands

- `npm run check`: `tsc -p tsconfig.json --noEmit`
- `npm run test`: `npm run build && node --test test/*.test.js`
- `npm run build`: `tsc -p tsconfig.json`
- `npm run smoke`: `npm run build && bash scripts/smoke.sh`
- `npm run package:smoke`: `npm pack --dry-run`
- `npm run docs:check`: checks README install claims against `docs/publication-state.json`
- `npm run release:check`: `npm run docs:check && npm test && npm run smoke && npm run package:smoke`

Run `npm run release:check` when available before opening a release PR. When a command is unavailable, use the closest listed command and record the reason in the PR.

## Reviewer Notes

- Confirm README examples still match the CLI or module exports.
- Confirm `npm pack --dry-run` does not include local fixtures, generated logs, or build caches beyond the intended allowlist.
- Confirm GitHub Actions runs the same install and package smoke path used locally.
