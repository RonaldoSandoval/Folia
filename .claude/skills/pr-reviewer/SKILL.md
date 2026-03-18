---
name: pr-reviewer
description: >
  Comprehensive PR and branch reviewer that validates compliance with project standards
  across multiple dimensions. Reviews changed files against DDD architecture rules,
  dev-workflow practices, React/Next.js performance patterns (Vercel), and interface
  design standards. Produces a structured report with per-file findings, a severity
  score, and actionable fix suggestions.

  Use when: reviewing a PR before merge, auditing a feature branch, validating that
  an agent's output follows project rules, or doing self-review before opening a PR.
  Triggers on: "review this PR", "review this branch", "check my changes", "validate
  my PR", "review PR #N", "audit branch", "review before merge", "/pr-review".

  Works in any agent environment (Claude Code, Antigravity, Codex, etc.) - uses only
  file reads and git diff output, no agent-specific tooling required.
---

# PR Reviewer

Structured review workflow. Always produce a final report following the template at
the end of this file.

---

## Step 1 - Gather changed files

Get the diff. Use whichever method is available in your environment:

```bash
# Option A - compare against main (typical PR review)
git diff main...HEAD --name-only

# Option B - diff of staged + unstaged changes (self-review before commit)
git diff HEAD --name-only

# Option C - if a PR number is given, fetch via GitHub MCP or gh CLI
gh pr diff <PR_NUMBER> --name-only
```

Then read the full diff for context:

```bash
git diff main...HEAD
```

---

## Step 2 - Classify changed files by domain

Group each changed file into one or more review domains:

| Domain | File patterns |
|---|---|
| DDD | `src/domain/**`, `src/application/**`, `src/infrastructure/repositories/**` |
| React/Next.js | `src/routes/**`, `src/components/**`, `*.tsx`, `*.ts` (non-domain) |
| Interface Design | `src/components/**/*.tsx`, `src/routes/**/*.tsx`, CSS files |
| Dev Workflow | Any file - check commit hygiene, test coverage, TypeScript errors |

A file can belong to multiple domains. Apply all applicable checklists.

---

## Step 3 - Run domain-specific reviews

For each changed file, load and apply the relevant checklist:

- DDD files: Read `references/ddd-rules.md`
- React/Next.js files: Read `references/react-best-practices.md`
- UI component files: Read `references/interface-design.md`
- All files: Apply `references/dev-workflow-checklist.md`

Read only what is needed for the files in the diff. Do not load all references upfront.

---

## Step 4 - Produce the Review Report

Use this exact template:

```
# PR Review Report

## Summary

| Dimension        | Status           | Issues |
|------------------|------------------|--------|
| DDD Rules        | PASS/FAIL/N/A    | N      |
| Dev Workflow     | PASS/FAIL        | N      |
| React Patterns   | PASS/FAIL/N/A    | N      |
| Interface Design | PASS/FAIL/N/A    | N      |

Overall: APPROVED / CHANGES REQUESTED / NEEDS DISCUSSION

---

## Findings

### [SEVERITY] filename:line - Short title

**Rule violated:** <rule name from checklist>
**What was found:** <exact code or description>
**Why it matters:** <1 sentence>
**Fix:** <concrete suggestion or corrected snippet>

---
(repeat for each finding)

---

## Positives

- <list things done correctly that are worth noting>

---

## Required changes before merge

- [ ] <actionable item 1>
- [ ] <actionable item 2>
```

### Severity levels

- CRITICAL: Blocks merge. Violates a non-negotiable rule (DDD purity, Result types, throws in domain, missing state guard).
- MAJOR: Should be fixed before merge. Wrong pattern, missing test, performance issue.
- MINOR: Worth fixing but won't block. Style inconsistency, missing JSDoc on public API.
- SUGGESTION: Optional improvement. Could be done in a follow-up.

---

## Step 5 - Post review comments (only when asked)

Only do this step when the user explicitly asks to post comments to a PR.

**MANDATORY: Always show the comment to the user and wait for explicit approval before posting.**
Draft the comment, display it in full, and ask "Should I post this?" — never call `mcp__github__add_issue_comment` or `gh` CLI without user confirmation.

Two capabilities are available — pick the right one:

| Method | What it does | When to use |
|---|---|---|
| `mcp__github__add_issue_comment` | Posts a single general comment on the PR thread | Default — always available |
| `gh` CLI inline reviews | Posts comments anchored to specific file:line | Only if user explicitly wants inline comments |

For what to post and how to write it, read `references/commenting-style.md`.
