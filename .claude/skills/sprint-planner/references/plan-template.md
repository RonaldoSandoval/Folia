# Plan Template — WEEK{N}_DEVELOPMENT_PLAN.md

Full document structure. Follow this exactly. All text in Spanish.

---

```markdown
# Week N: [Short Title] — [Feature1] + [Feature2] + [Feature3]

**Proyecto:** [Project name]
**Timeline:** Semana N (X días) – [One-line focus description]
**Estado:** Pendiente
**Formato:** AI Agent Execution Plan v2.0
**Dependencias:** Semana N-1 ([Previous week title]) ✅ Completa

---

## 🎯 Objetivos de la Semana N

**Justificación de Prioridades:**
[2-3 sentences explaining WHY these features this week — business value,
user impact, or technical necessity. Be concrete.]

**Qué construimos esta semana:**

1. **[Feature 1]** – [One-line description of scope]
2. **[Feature 2]** – [One-line description of scope]
...

**Definición de Terminado:**

- [Concrete observable outcome 1]
- [Concrete observable outcome 2]
- `pnpm tsc --noEmit` → 0 errores
- `pnpm build` → exitoso
- Tests unitarios pasan

---

## 📊 Tracker de Progreso Semana N

```
Semana N ([Sprint name]):
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0%

⬜ Día 1: [Feature]     [░░░░░░░░] 0%
⬜ Día 2: [Feature]     [░░░░░░░░] 0%
⬜ Día 3: [Feature]     [░░░░░░░░] 0%
⬜ Día 4: [Feature]     [░░░░░░░░] 0%
⬜ Día 5: [Feature]     [░░░░░░░░] 0%
⬜ Día 6: E2E Polish + Tests de integración  [░░░░░░░░] 0%
```

---

## ⚠️ CRÍTICO: Checklist Pre-Implementación

### Paso 1: Verificar dependencias de la Semana N-1

```bash
# Use Glob results from Phase 2 — only list files that must exist
ls src/path/to/required/file.ts
ls src/path/to/another/file.ts
```

**Si falta alguno:** Completar Semana N-1 primero.

### Paso 2: [Project-specific verification]

```bash
grep "export const functionName" src/server/functions/file.ts
```

**Esperado:** [What should be there]

---

## 🚀 Día 1: [Feature Name]

### Estado Actual

- [List what already exists from Phase 2 analysis]
- [Be specific: ✅ file exists, ❌ missing, ⏳ partial]

### Estado Objetivo

- [List what should exist after this day's work]
- [Each bullet = one observable deliverable]

> **Nota para agentes:** [Any architectural note relevant to AI execution —
> patterns to follow, files to avoid, existing conventions to match]

---

### Tarea 1.1: [Action verb] [What] en `src/path/to/file.ts`

[2-3 sentence description of what this task does and why.]

```typescript
// Code blueprint — complete, copy-paste ready
// Match existing import style and middleware patterns
```

**Criterios de Aceptación:**

- [ ] [Criterion 1 — testable and specific]
- [ ] [Criterion 2]
- [ ] [Criterion 3 — e.g. TypeScript compiles, tests pass]

---

### Tarea 1.2: [Action verb] [What]

[Same structure as 1.1]

---

## 🚀 Día 2: [Feature Name]

[Same structure as Día 1]

---

[... repeat for all days ...]

---

## 🚀 Día 6: E2E Polish + Validación

### Verificaciones técnicas

```bash
pnpm tsc --noEmit
pnpm check
pnpm test
pnpm build
```

### Script de validación manual

[List of 5-10 manual test steps that verify the week's features end-to-end]

1. [Step 1 — concrete action + expected result]
2. [Step 2]
...

---

**Versión del Documento:** 1.0
**Última actualización:** [YYYY-MM-DD]
**Formato:** AI Agent Execution Plan v2.0
```

---

## Section rules

### Objetivos
- Justificación must explain business value, not just technical description
- Definición de Terminado = observable + verifiable, not vague

### Tracker
- Always starts at 0% / ░░░░░░░░ for all days
- Day 6 is always E2E — do not assign a feature to Day 6

### Pre-Implementation Checklist
- Only list files that were confirmed to exist via Glob in Phase 2
- Add grep checks for exported functions that must be present
- End with: "Si falta alguno: [action]"

### Estado Actual vs Estado Objetivo
- Estado Actual = what Glob/Grep found (truthful, not aspirational)
- Estado Objetivo = what will exist after the day completes
- Each bullet in Estado Objetivo = one task in the day

### Notes for agents
- Include architectural notes that prevent common mistakes
- Reference related files by full path
- Flag data model quirks (e.g. "no Customer model in Prisma, data is in reservations")
