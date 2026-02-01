# Multi-Agent Development Workflow

Load the full skill from `.claude/skills/multi-agent/skill.md` and execute based on the argument provided:

**Arguments:** $ARGUMENTS

## Command Routing

Parse $ARGUMENTS to determine which phase to run:

- If empty or "help" → Show available commands
- If "init" → Run Phase 1: INIT
- If "plan <file>" → Run Phase 2: PLAN with the specified PRD file
- If "build" → Run Phase 3: BUILD
- If "status" → Run Phase 4: STATUS

## Quick Reference

```
/multi-agent init              # Initialize project with PRD template
/multi-agent plan docs/PRD.md  # Generate tech spec and TaskList from PRD
/multi-agent build             # Start parallel agent execution
/multi-agent status            # Show current build progress
```

Read `.claude/skills/multi-agent/skill.md` for full instructions on each phase.
