# Ralph Agent Instructions

## Your Task

1. Read `prd.json`
2. Read `progress.txt`
   (check Codebase Patterns first)
3. Pick highest priority story
   where `passes: false`
4. Implement that ONE story
5. Run typecheck and tests
6. Update `progress.txt` with learnings
7. Commit: `feat: small descriptive commit message`
8. Update prd.json: `passes: true`
9. Append learnings to progress.txt
10. Start over from step 1

## Progress Format

APPEND to progress.txt:

## [Date] - [Story Title]

- What was implemented
- Files changed
- **Learnings:**
  - Patterns discovered
  - Gotchas encountered

---

## Notes

We don't have users so no need to worry about migrations, it's safe to erase the database.

## Stop Condition

If ALL stories pass, reply:
<promise>COMPLETE</promise>

Otherwise end normally.
