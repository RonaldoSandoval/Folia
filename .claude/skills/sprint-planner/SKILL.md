---
name: sprint-planner
description: >
  Sprint planning workflow for generating weekly development plans
  (WEEK{N}_DEVELOPMENT_PLAN.md). Guides a structured conversation to analyze
  codebase state, review previous week dependencies, scope tasks by day, and
  produce a complete AI Agent Execution Plan document. Use when starting a new
  sprint week, planning upcoming features, or scoping a backlog into daily
  tasks. Output documents are written in Spanish following the established
  project format. Triggers on: "plan week", "create week plan", "scope next
  sprint", "plan semana", "nueva semana", "planear semana".
---

# sprint-planner

Structured workflow for generating a `docs/sprints/WEEK{N}_DEVELOPMENT_PLAN.md` file.
Follow the phases in order. Do not skip the analysis phase — the plan quality
depends on knowing the current codebase state.

---

## Phase 1 — Orient

Before planning anything, gather context:

1. What is the current week number? → `N = last WEEK file + 1`
   ```bash
   ls docs/sprints/WEEK*_DEVELOPMENT_PLAN.md | sort
   ```
2. Read the **last completed week plan** to understand:
   - What was built (Estado Actual sections)
   - What was deferred (tasks marked ⏳ or not ✅)
   - What are the declared dependencies for next week
3. Ask the user:
   - "¿Qué queremos construir esta semana?" (what to build)
   - "¿Hay tareas diferidas de la semana anterior?" (deferred tasks)
   - "¿Cuántos días disponibles?" (available days, default 6)

---

## Phase 2 — Analyze (codebase state)

For each feature the user wants to build, verify what already exists:

1. Use **Glob** to find related files
2. Use **Grep** to check for existing exports, interfaces, components
3. Use **Read** on key files to understand current state

Document findings as:
```
Feature X:
  Exists: [list of relevant files found]
  Missing: [what needs to be created]
  Depends on: [files that must exist first]
```

This becomes the "Estado Actual" section of each day.

---

## Phase 3 — Scope

Map features to days. Rules:

- **1 feature per day** — do not overload days
- **Domain-first ordering** — if a feature needs a domain service, that day
  comes before the UI day that uses it
- **Day 6** is always E2E polish, integration tests, and QA validation
- **Defer ruthlessly** — if a feature is uncertain or complex, push to next week
  or mark as Day 6 stretch goal
- **Realistic capacity** — a day = ~4–6 tasks of moderate complexity

Ask for each candidate feature:
- "¿Es esto flexible o bloqueante para el negocio?" (flexible or blocking)
- "¿Tiene dependencias no completadas?" (unmet dependencies)
- "¿Podría ir a la semana siguiente?" (could it move to next week)

---

## Phase 4 — Generate the plan

Produce `docs/sprints/WEEK{N}_DEVELOPMENT_PLAN.md` following the exact template.
See `references/plan-template.md` for the full document structure.
See `references/task-anatomy.md` for how to write individual tasks.

Rules for generation:
- Write in **Spanish** throughout
- Include code blueprints for non-trivial tasks (TypeScript patterns from
  the existing codebase — match import style, middleware pattern, etc.)
- Every task must have "Criterios de Aceptación" with checkboxes
- Pre-implementation checklist must verify actual files from the codebase
  (use Glob results from Phase 2, not guesses)
- Progress tracker starts at 0% for all days

---

## Phase 5 — Review with user

Before saving the file:
1. Present the day-by-day scope summary
2. Ask: "¿Está bien este alcance o queremos ajustar algún día?"
3. Apply any adjustments
4. Write the file

---

## Configuration

```
PROJECT_NAME = read from last WEEK plan header
AUTHOR       = @username (confirm with user)
LANGUAGE     = Spanish (output always in Spanish)
```

---

## Reference Files

- `references/plan-template.md` — full document structure with all sections
- `references/task-anatomy.md` — how to write tasks, code blueprints, acceptance criteria
