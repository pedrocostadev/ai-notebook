# Ralph Agent Instructions

## Your Task

1. Read `scripts/ralph/prd.json`
2. Read `scripts/ralph/progress.txt`
   (check Codebase Patterns first)
3. Pick highest priority story
   where `passes: false`
4. Implement that ONE story
5. Run typecheck and tests
6. Update AGENTS.md files with learnings
7. Commit: `feat: small descriptive commit message`
8. Update prd.json: `passes: true`
9. Append learnings to progress.txt

## Progress Format

APPEND to progress.txt:

## [Date] - [Story Title]

- What was implemented
- Files changed
- **Learnings:**
  - Patterns discovered
  - Gotchas encountered

---

## Stop Condition

If ALL stories pass, reply:
<promise>COMPLETE</promise>

Otherwise end normally.
