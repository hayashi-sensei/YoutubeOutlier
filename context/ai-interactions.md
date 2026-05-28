# AI Interaction Guidelines 

## Communication

* Be concise and direct
* Explain non-obvious decisions briefly
* Ask before large refactors or architectural changes
* Don't add features not in the current spec
* Never delete files without clarification
* If something isn't working after 2–3 attempts, stop and explain the issue
* Don't keep trying random fixes
* Ask for clarification if requirements are unclear

## Workflow

Every spec follows this sequence:

1. **Load Spec** — Read the feature-spec file (e.g., SPEC-09-outreach-kanban.md)
2. **Update Pointer** — Update `context/current-feature.md` with active spec, branch name, and checklist
3. **Branch** — Create `feat/spec-XX-short-name` from main
4. **Implement** — Build what the spec defines. Nothing more, nothing less
5. **Test** — Verify in browser. Run `pnpm build` and fix any errors
6. **Iterate** — Adjust based on review feedback
7. **Commit** — Only after build passes and I give permission
8. **Merge** — Merge to main after review approval
9. **Delete Branch** — Delete branch immediately after merge
10. **Close Out** — Update spec changelog, clear `context/current-feature.md`

Do NOT commit without permission. If build fails, fix before requesting commit approval.

## Branching

* Spec work: `feat/spec-XX-short-name`
* Bug fixes: `fix/spec-XX-short-description`
* Maintenance: `chore/short-description`

## Commits

* Ask before committing (never auto-commit)
* Format: `type: [SPEC-XX] description`
  * `feat: [SPEC-09] implement kanban board with drag-and-drop`
  * `fix: [SPEC-09] correct stage movement timestamp`
  * `chore: [SPEC-01] update dependencies`
* One focused change per commit
* Never include "Generated with Claude" or similar attribution in commit messages

## Code Changes

* Make minimal changes to accomplish the spec
* Don't refactor unrelated code unless asked
* Don't add features not defined in the active spec
* Preserve existing patterns in the codebase
* If a pattern conflict is found between specs, flag it — don't silently override

## Code Review Priorities

Review AI-generated code for:

* Security (auth checks, input validation, user_id scoping)
* Performance (unnecessary re-renders, N+1 queries, missing loading states)
* Logic errors (edge cases, business rule violations)
* Pattern consistency (matches existing codebase conventions)
* Credit/limit enforcement (AI features check credits, CRUD checks subscription limits)