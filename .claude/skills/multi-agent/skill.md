# Multi-Agent Development Skill

Automated parallel development workflow using Claude's Task system and specialized subagents.

## Commands

- `/multi-agent init` - Initialize a new project with PRD template and CLAUDE.md
- `/multi-agent plan <prd-file>` - Generate TaskList from PRD with dependencies
- `/multi-agent build` - Auto-spawn parallel agents to execute the TaskList
- `/multi-agent status` - Show progress across all agents

---

## Phase 1: INIT

When the user runs `/multi-agent init`:

1. **Create project structure**:
   ```
   docs/
   ├── PRD.md          (copy from templates/PRD-TEMPLATE.md)
   └── TECHNICAL.md    (generated during planning)
   CLAUDE.md           (copy from templates/CLAUDE-PROJECT.md)
   ```

2. **Prompt user**:
   ```
   Project initialized! Next steps:

   1. Fill out docs/PRD.md with your product requirements
   2. Run `/multi-agent plan docs/PRD.md` to generate the technical spec and TaskList
   ```

3. **Wait for user** to complete the PRD before proceeding.

---

## Phase 2: PLAN

When the user runs `/multi-agent plan <prd-file>`:

### Step 2.1: Validate PRD completeness

Read the PRD file and check for required sections:
- [ ] Project Overview (problem, solution, success metrics)
- [ ] User Stories (at least 3)
- [ ] Core Features (prioritized)
- [ ] Constraints (timeline, budget, tech preferences)

If incomplete, list what's missing and ask user to fill in.

### Step 2.2: Generate Technical Specification

Create `docs/TECHNICAL.md` containing:

```markdown
# Technical Specification

## Tech Stack
[Analyze PRD requirements and recommend appropriate stack]
- Frontend: [framework + rationale]
- Backend: [framework + rationale]
- Database: [type + rationale]
- Infrastructure: [hosting + rationale]

## Architecture
[System diagram in mermaid or ASCII]

## Data Models
[Core entities and relationships]

## API Design
[Key endpoints]

## File Structure
[Proposed directory layout]

## Implementation Phases
[Ordered phases with dependencies]
```

### Step 2.3: Generate TaskList with Dependencies

Use TaskCreate to build the task list. Follow these rules:

**Task Decomposition Rules:**
1. Each task should be completable by a single specialist agent
2. Tasks touching different files/modules can run in parallel
3. Tasks touching the same files must have explicit dependencies (blockedBy)
4. Max 8 parallel tasks at once (prevent resource contention)
5. Include verification tasks after implementation tasks

**Standard Task Categories:**
- `SETUP` - Project scaffolding, dependencies, config
- `BACKEND` - API, database, business logic
- `FRONTEND` - UI components, pages, state
- `INTEGRATION` - Connecting frontend to backend
- `QA` - Tests, validation, edge cases
- `DOCS` - Documentation, README, API docs

**Task Naming Convention:**
```
[CATEGORY] Brief description
```

**Example TaskList structure:**
```
Task 1: [SETUP] Initialize project with selected stack
Task 2: [SETUP] Configure development environment
Task 3: [BACKEND] Create data models (blocked by: 1)
Task 4: [BACKEND] Implement core API endpoints (blocked by: 3)
Task 5: [FRONTEND] Build component library (blocked by: 1)
Task 6: [FRONTEND] Create page layouts (blocked by: 5)
Task 7: [INTEGRATION] Connect frontend to API (blocked by: 4, 6)
Task 8: [QA] Write unit tests for backend (blocked by: 4)
Task 9: [QA] Write integration tests (blocked by: 7)
Task 10: [DOCS] Generate API documentation (blocked by: 4)
```

### Step 2.4: Present plan for approval

Display:
1. The technical specification summary
2. The TaskList with dependency graph
3. Which tasks will run in parallel (visualize waves)

```
Wave 1 (parallel): Tasks 1, 2
Wave 2 (parallel): Tasks 3, 5
Wave 3 (parallel): Tasks 4, 6
Wave 4 (parallel): Tasks 7, 8, 10
Wave 5: Task 9
```

Ask: "Ready to build? Run `/multi-agent build` to start parallel execution."

---

## Phase 3: BUILD

When the user runs `/multi-agent build`:

### Step 3.1: Verify prerequisites

- [ ] TaskList exists and has pending tasks
- [ ] Technical specification exists
- [ ] Git is initialized (for worktree isolation)

If not ready, guide user to complete setup.

### Step 3.2: Create git worktrees for parallel work

```bash
# Create worktrees for parallel agents
git worktree add .worktrees/backend-agent -b agent/backend
git worktree add .worktrees/frontend-agent -b agent/frontend
git worktree add .worktrees/qa-agent -b agent/qa
```

### Step 3.3: Spawn parallel agents by wave

**CRITICAL: Use the Task tool with `run_in_background: true` for parallel execution.**

For each wave of non-blocked tasks:

1. Identify all tasks with no pending blockers
2. Group by specialist type (backend, frontend, qa, docs)
3. Spawn agents in parallel using Task tool:

```
For tasks that can run in parallel, spawn them ALL in a single message with multiple Task tool calls:

Task tool call 1:
  subagent_type: "general-purpose"
  prompt: |
    You are BACKEND-AGENT working in .worktrees/backend-agent/

    Your task: [Task description from TaskList]

    Technical context:
    [Relevant sections from TECHNICAL.md]

    Rules:
    - Work ONLY in your worktree directory
    - Commit your changes with clear messages
    - Update task status when complete
    - If blocked, document why and return

  run_in_background: true

Task tool call 2:
  subagent_type: "general-purpose"
  prompt: |
    You are FRONTEND-AGENT working in .worktrees/frontend-agent/
    ...
  run_in_background: true
```

### Step 3.4: Monitor and merge

1. Check on background agents periodically using TaskOutput
2. When an agent completes:
   - Mark task as completed using TaskUpdate
   - Merge their worktree branch to main:
     ```bash
     git merge agent/backend --no-ff -m "Merge backend agent work"
     ```
   - Check if this unblocks other tasks
   - Spawn newly unblocked tasks

3. Continue until all tasks are completed

### Step 3.5: Final integration

When all tasks complete:
1. Remove worktrees
2. Run full test suite
3. Generate completion report

```
Build Complete!

Tasks completed: 10/10
Time elapsed: [duration]
Agents spawned: [count]

Branches merged:
- agent/backend → main
- agent/frontend → main
- agent/qa → main

Next steps:
- Review the changes
- Run: git log --oneline -20
- Deploy when ready
```

---

## Phase 4: STATUS

When the user runs `/multi-agent status`:

1. Call TaskList to get current state
2. Display:

```
Multi-Agent Build Status
========================

Completed: ████████░░ 8/10 tasks

Active Agents:
├─ BACKEND-AGENT: Task 4 - Implementing API endpoints...
└─ QA-AGENT: Task 8 - Writing unit tests...

Queued (waiting on dependencies):
└─ Task 9 - Integration tests (blocked by: 4, 7)

Recent completions:
├─ ✓ Task 1: Project initialization (2 min ago)
├─ ✓ Task 3: Data models (5 min ago)
└─ ✓ Task 5: Component library (3 min ago)
```

---

## Agent Communication Protocol

Agents communicate via scratchpad files in `.worktrees/.scratchpad/`:

```
.worktrees/.scratchpad/
├─ backend-agent.md    # Backend agent writes here
├─ frontend-agent.md   # Frontend agent writes here
├─ qa-agent.md         # QA agent writes here
└─ blockers.md         # Any agent can flag blockers here
```

**Scratchpad format:**
```markdown
# [Agent Name] Status

## Current Task
[Task ID and description]

## Progress
- [x] Step 1
- [ ] Step 2

## Needs from other agents
[If waiting on something from another agent]

## Completed artifacts
- path/to/file.ts - [description]
```

Agents should read other scratchpads before starting work to check for dependencies.

---

## Error Handling

**If an agent fails:**
1. Mark task as blocked (not failed)
2. Write failure reason to `.worktrees/.scratchpad/blockers.md`
3. Continue with other tasks
4. Report blocker to user during status check

**If merge conflicts occur:**
1. Pause new agent spawning
2. Alert user with conflict details
3. Wait for user to resolve
4. Resume with `/multi-agent build`

---

## The 3-Task Rule

If the project has fewer than 3 tasks after planning:
- Skip the full multi-agent workflow
- Execute tasks directly without spawning agents
- Inform user: "Small project detected. Executing directly without parallel agents."
