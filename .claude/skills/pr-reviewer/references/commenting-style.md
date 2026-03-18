# PR Commenting Style Guide

## Table of Contents
1. What to post vs keep in report
2. GitHub commenting capabilities
3. Voice and tone
4. Comment format
5. Examples — good vs bad

---

## 1. What to post vs keep in report

Not every finding needs a GitHub comment. Use this decision table:

| Severity | Post as comment? | Framing |
|---|---|---|
| CRITICAL | Yes — required | Blocking, must fix |
| MAJOR | Yes — required | Blocking, must fix |
| MINOR | Yes — as suggestion | Non-blocking, worth fixing |
| SUGGESTION | Optional | Explicitly non-blocking |
| Commit format | Yes — as suggestion | Non-blocking, just a heads-up |
| Missing tests | Yes — as suggestion if no CI gate, required if it blocks merge | Depends on project policy |

For commit format and test coverage findings that are non-blocking: frame them as suggestions, not blockers. The author can address them before or after merge depending on urgency.

---

## 2. GitHub commenting capabilities

### Option A — General PR comment (MCP, always available)

Use `mcp__github__add_issue_comment` with the PR number as `issue_number`.

Posts a single comment on the PR thread. Reference specific locations with `filename:line` inline in the text. This is the default — use it unless inline anchoring is specifically needed.

```
owner: BarrierDeUna
repo:  web
issue_number: <PR number>
body:  <comment text>
```

### Option B — Inline review comments (gh CLI)

Use only when the user explicitly asks for inline/line-level comments. Requires two steps:

```bash
# Step 1: Create a review (draft)
gh api repos/BarrierDeUna/web/pulls/<PR>/reviews \
  --method POST \
  -f body='' \
  -f event='COMMENT' \
  -f 'comments[][path]=src/routes/change-password.tsx' \
  -f 'comments[][position]=79' \
  -f 'comments[][body]=your comment here'
```

Position = line number in the diff (not the file). Requires knowing the diff hunk offset.

---

## 3. Voice and tone

Write like a senior dev doing a quick async review — not like a tool generating a report.

Rules:
- Short sentences. One idea per sentence.
- No "I noticed that..." or "It appears that..." — just say what it is.
- No "Great job on..." or "Well done with..." — skip the praise in comments (save it for the report's Positives section).
- No AI tell-signs: no bullet-pointed explanations of why something is bad, no "this violates the X principle".
- If it's a suggestion (not a blocker), say so explicitly at the start: "suggestion:" or "non-blocking:"
- Use code snippets for fixes — less text, more signal.

---

## 4. Comment format

### For a general PR comment (all findings in one post):

```
few things from the review:

**`path/to/file.ts:LINE`**
<finding in 1-2 sentences. code snippet if fix is obvious.>

**`path/to/other.tsx:LINE`**
<finding>

---
suggestion (non-blocking): <commit format or test coverage note — keep brief>
```

No header, no summary table — that's for the internal report. The GitHub comment should read like a person left it.

### For a single inline comment:

Just the finding in 1-3 sentences. No preamble. Code snippet if helpful.

---

## 5. Examples — good vs bad

### CRITICAL / MAJOR finding

Bad (AI-sounding):
> I noticed that in `change-password.tsx` on line 79, the catch block uses `err: any` which bypasses TypeScript's type safety system. This violates our TypeScript Correctness guidelines which require the use of `unknown` for caught errors.

Good:
> `catch (err: any)` → should be `unknown`. Narrow it with `instanceof Error` before accessing `.message`. `any` here defeats strict mode.

---

### MINOR finding

Bad:
> The `as any` cast in `DirectusUserService.updatePassword` lacks a justification comment. While this may be necessary due to SDK type limitations, it's important to document the reason.

Good:
> small thing: the `as any` on the `updateUser` call could use a comment explaining why — just so the next person doesn't flag it. Something like `// SDK schema doesn't include custom fields` is enough.

---

### Suggestion (commit format)

Bad:
> The commit messages use the `feat:` conventional commit prefix which does not match the project's required format of `[@santihs]: <description>`.

Good:
> suggestion: commits use `feat:` — project format is `[@santihs]: force password change on first login — auth gate, change-password route, Directus seed`. worth squashing before merge if you care about the log consistency, no blocker though.

---

### Suggestion (missing tests)

Bad:
> The `changePasswordFn` server function does not have associated test coverage. According to the project's testing requirements, all new server functions should have tests covering the happy path, authentication errors, schema validation, and service failure scenarios.

Good:
> suggestion: `changePasswordFn` has no tests yet. at minimum: happy path, unauthenticated call, and mismatched passwords via Zod. the mock in `helpers.ts` already has `updatePassword: async () => ok(undefined)` so the setup is there.
