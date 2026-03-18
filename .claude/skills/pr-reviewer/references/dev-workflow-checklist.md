# Dev Workflow Review Checklist

Applies to ALL changed files in a PR.

## Table of Contents
1. Explore Phase Compliance
2. Implementation Quality
3. TypeScript Correctness
4. Test Coverage
5. Commit Hygiene
6. General Code Quality

---

## 1. Explore Phase Compliance (MAJOR)

The PR should show evidence that the author understood the codebase before changing it:
- No duplicate code that already exists elsewhere
- No reimplemented utilities when shared ones exist
- Imports reference real files (no unresolved imports)
- No circular dependencies introduced

How to check: look for duplicated logic or imports of non-existent paths.

---

## 2. Implementation Quality (MAJOR)

- Match import style and naming conventions of existing files
- Prefer editing existing files over creating new ones (no unnecessary new files)
- No speculative features beyond the task scope
- No commented-out code left behind
- No `TODO` or `FIXME` without an associated issue

---

## 3. TypeScript Correctness (CRITICAL)

- No `any` types unless explicitly justified in a comment
- No `as unknown as X` casts without justification
- No `@ts-ignore` or `@ts-expect-error` without explanation
- All function parameters and return types are explicit
- No implicit `any` from missing type annotations on exported APIs

---

## 4. Test Coverage (MAJOR)

Tests must ship in the same PR as the implementation — never deferred.

Check that:
- [ ] Every new function/method has at least one test
- [ ] Every new error path has a failing test
- [ ] Tests are colocated with implementation or in `__tests__/` alongside the file
- [ ] Tests do not use `any` casts to bypass type checking
- [ ] No `it.skip` or `test.skip` left in tests

For domain code, also apply `references/ddd-rules.md` Section 10.

---

## 5. Commit Hygiene (MINOR)

Commit messages must follow the project format exactly:

```
[@santihs]: <verb> <short description> - <detail1>, <detail2>, ...
```

FAIL if:
- Uses `feat:`, `fix:`, `chore:` or any conventional commit prefix
- Missing the `[@santihs]:` prefix
- No detail after the dash
- Message is vague (e.g., "fix stuff", "update code")

---

## 6. General Code Quality (MINOR)

- No `console.log` left in production code (only in test files or dev-only scripts)
- No hardcoded secrets, tokens, or API keys
- No dead code (unused variables, unreachable branches)
- Error messages are descriptive and actionable
- No mutation of function arguments
