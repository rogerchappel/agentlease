# agentlease PRD

Status: in-progress

## Summary

agentlease is a local permission ledger for coding-agent sessions. It creates
time-boxed "leases" for commands, paths, network domains, or environment keys,
then lets wrappers and humans verify whether an action is inside the current
lease before it runs.

## Why now

Terminal-first coding agents increasingly operate across local files, shells,
MCP tools, and parallel sessions. Teams need a small, auditable way to express
"this agent may do these things for this window" without relying on memory,
chat history, or heavyweight policy servers.

## Source attribution

Inspired by public discussion of 2026 agent CLI workflows, local execution, and
multi-agent orchestration. agentlease is an original local-first policy ledger,
not a copy of any external implementation.

## Target users

- Developers running multiple local coding agents.
- Maintainers who want repeatable permission notes in repo workflows.
- Agent wrappers that need a simple JSON decision surface.

## MVP

- Create, list, inspect, revoke, and validate leases.
- Store leases in a local JSON file with stable schema and no daemon.
- Match commands, path prefixes, domains, and environment variable names.
- Support TTL expiration and explicit revocation.
- Emit shell-friendly exit codes and JSON decisions.
- Include fixtures, tests, README examples, and smoke scripts.

## Non-goals

- Kernel-level enforcement.
- Secret storage.
- Remote policy synchronization.

## CLI sketch

```bash
agentlease grant --name docs-pass --path ./docs --command "npm test" --ttl 2h
agentlease check --command "npm test" --path ./docs/PRD.md
agentlease list --json
agentlease revoke docs-pass
```

## Success criteria

- A wrapper can call `agentlease check` before a command and make a deterministic
  allow/deny decision.
- Humans can read the ledger and understand what was granted, when, and why.
