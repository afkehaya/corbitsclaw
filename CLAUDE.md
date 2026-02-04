# CLAUDE.md - CorbitsClaw Multi-Agent Development Project

This project uses the multi-agent development workflow for parallel execution.

## Project Context

- **PRD**: `docs/PRD.md`
- **Technical Spec**: `docs/TECHNICAL.md` (generated during planning)
- **Status**: Run `/multi-agent status` to see build progress

---

## Faremeter Conventions (REQUIRED)

This project follows `faremeter-ts-playground` conventions exactly. All agents must comply.

### Monorepo Structure

This is a pnpm monorepo. When developing new TypeScript code:

- **Applications** go in `apps/`
- **Shared libraries** go in `packages/`
- **Utility scripts** go in `scripts/`

Do not create standalone TypeScript files in the repository root.

### Package Management

Uses **pnpm** (version 10.12.1+) with a centralized dependency catalog.

**All package references must use the `catalog:` version specifier.** Never hardcode versions directly in package.json files. Versions are defined centrally in `pnpm-workspace.yaml`.

To add a new dependency:

1. Add the version to the `catalog` section in `pnpm-workspace.yaml`
2. Reference the package with `"package-name": "catalog:"` in your package.json
3. Run `pnpm install`

**Keep package installations constrained to the locations they're needed. DO NOT install packages at the top-level unless absolutely necessary.**

### @faremeter Packages

**Do not write custom functionality when a @faremeter package already provides the capability.**

| Package                     | Purpose                                                |
| --------------------------- | ------------------------------------------------------ |
| `@faremeter/types`          | Shared type definitions across the Faremeter ecosystem |
| `@faremeter/info`           | Information and metadata utilities                     |
| `@faremeter/facilitator`    | Payment facilitation logic                             |
| `@faremeter/fetch`          | HTTP fetch utilities with x402 support                 |
| `@faremeter/middleware`     | Middleware for Hono, Express frameworks                |
| `@faremeter/rides`          | Simplified x402 endpoint access                        |
| `@faremeter/payment-evm`    | EVM chain payment handling                             |
| `@faremeter/payment-solana` | Solana payment handling                                |
| `@faremeter/wallet-evm`     | EVM wallet integration                                 |
| `@faremeter/wallet-solana`  | Solana wallet integration                              |

**Do not use experimental x402 payment schemes unless explicitly told to do so.**

### TypeScript

Strict TypeScript is enforced with additional strictness flags:

- `noUncheckedIndexedAccess`
- `noImplicitOverride`
- `exactOptionalPropertyTypes`

See `tsconfig.base.json` for the full configuration.

**Imports:**

- Use explicit type imports (e.g., `import type { Foo }`) due to `verbatimModuleSyntax`
- Use the `node:` prefix for Node.js built-in modules (e.g., `node:fs`, `node:path`)

### Code Style

- Prefix unused variables with `_` (e.g., `_unusedParam`)
- Prettier handles formatting with default configuration
- Run `make format` to auto-fix

### Build & Verification

**Agents must run `make` before assuming any task is complete.** A task is not finished until the full build passes (lint, build, and test).

| Target        | Description                         |
| ------------- | ----------------------------------- |
| `make`        | Run lint, build, and test (default) |
| `make lint`   | Run prettier and eslint             |
| `make build`  | Compile TypeScript                  |
| `make test`   | Run tests                           |
| `make format` | Auto-fix formatting issues          |
| `make clean`  | Remove build artifacts and caches   |

### Testing

Tests use the `tap` framework (node-tap) with TypeScript support via `@tapjs/tsx`.

---

## Multi-Agent Development Rules

### For All Agents

1. **Read before writing** - Always read existing files before modifying
2. **Stay in your lane** - Only modify files assigned to your task
3. **Commit often** - Small, atomic commits with clear messages
4. **Update status** - Write progress to your scratchpad file
5. **Flag blockers immediately** - Don't spin on issues, document and return
6. **Run `make` before completing** - Task isn't done until build passes

### Git Workflow

- Main development happens in worktree branches
- Branch naming: `agent/[backend|frontend|qa|docs]`
- Merge to main only after task completion and verification
- Never force push
- Configure git hooks: `git config core.hooksPath .githooks`

**Commit Messages:**

- Summary line: Max 72 characters, non-empty
- Blank line: Required between summary and body (if body exists)
- Body lines: Max 72 characters each

### File Ownership

When parallel agents are running:

- `apps/api/src/routes/`, `apps/api/src/services/` → backend-agent
- `apps/skill/src/` → frontend-agent (skill is user-facing)
- `tests/`, `__tests__/` → qa-agent
- `docs/`, `README.md` → docs-agent
- `packages/shared/` → coordinate via scratchpad

If you need to modify a file outside your domain, check `.worktrees/.scratchpad/` for conflicts.

### Communication

Agents communicate via scratchpad files:

```
.worktrees/.scratchpad/
├─ backend-agent.md
├─ frontend-agent.md
├─ qa-agent.md
└─ blockers.md
```

Before starting work, read relevant scratchpads to understand current state.

### Quality Gates

Before marking a task complete:

- [ ] Code compiles/runs without errors
- [ ] `make` passes (lint, build, test)
- [ ] No linting errors
- [ ] Changes committed to branch
- [ ] Scratchpad updated with artifacts created

---

## Commands

- `/multi-agent init` - Set up project structure
- `/multi-agent plan docs/PRD.md` - Generate technical spec and TaskList
- `/multi-agent build` - Start parallel execution
- `/multi-agent status` - Check progress

---

## Task System

This project uses Claude's native Task system:

- Tasks have dependencies (blockedBy)
- Parallel tasks run simultaneously via background agents
- Progress tracked via TaskList / TaskUpdate

Never manually edit task state - use TaskUpdate tool.
