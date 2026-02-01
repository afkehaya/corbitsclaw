# CLAUDE.md - Multi-Agent Development Project

This project uses the multi-agent development workflow for parallel execution.

## Project Context

- **PRD**: `docs/PRD.md`
- **Technical Spec**: `docs/TECHNICAL.md`
- **Status**: Run `/multi-agent status` to see build progress

## Development Rules

### For All Agents

1. **Read before writing** - Always read existing files before modifying
2. **Stay in your lane** - Only modify files assigned to your task
3. **Commit often** - Small, atomic commits with clear messages
4. **Update status** - Write progress to your scratchpad file
5. **Flag blockers immediately** - Don't spin on issues, document and return

### Git Workflow

- Main development happens in worktree branches
- Branch naming: `agent/[backend|frontend|qa|docs]`
- Merge to main only after task completion and verification
- Never force push

### File Ownership

When parallel agents are running:
- `src/api/`, `src/models/`, `src/services/` → backend-agent
- `src/components/`, `src/pages/`, `src/styles/` → frontend-agent
- `tests/`, `__tests__/` → qa-agent
- `docs/`, `README.md` → docs-agent

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
- [ ] Basic manual testing passes
- [ ] No linting errors
- [ ] Changes committed to branch
- [ ] Scratchpad updated with artifacts created

## Commands

- `/multi-agent init` - Set up project structure
- `/multi-agent plan docs/PRD.md` - Generate technical spec and TaskList
- `/multi-agent build` - Start parallel execution
- `/multi-agent status` - Check progress

## Task System

This project uses Claude's native Task system:
- Tasks have dependencies (blockedBy)
- Parallel tasks run simultaneously via background agents
- Progress tracked via TaskList / TaskUpdate

Never manually edit task state - use TaskUpdate tool.
