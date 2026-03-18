# Task Anatomy — How to write individual tasks

## Structure of a task

```markdown
### Tarea X.Y: [Action verb] [What] en `src/path/to/file.ts`

[Description: 2-3 sentences. What this task does, why it's needed, any
architectural note. Reference related files by path.]

```typescript
// Code blueprint
```

**Criterios de Aceptación:**

- [ ] [Criterion — specific, testable]
- [ ] [Criterion]
```

---

## Action verbs (use consistently)

| Spanish verb | When to use |
|---|---|
| Agregar | Adding a new function/field/section to an existing file |
| Crear | Creating a new file from scratch |
| Implementar | Building out a feature that has a stub or interface |
| Actualizar | Modifying existing logic |
| Extraer | Moving code to a new location |
| Conectar | Wiring two existing pieces together |
| Validar | Adding validation logic |
| Migrar | Database migration |

---

## Code blueprints

Include blueprints for:
- Server functions (full schema + middleware + handler pattern)
- Domain services (constructor + method signatures)
- React components (props interface + key JSX structure)
- Prisma schema additions

Skip blueprints for:
- Trivial UI text changes
- Simple config additions
- Tasks where the pattern is obvious from adjacent code

### Server function blueprint pattern

Match this structure (from existing codebase):

```typescript
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { containerMiddleware } from '../middleware/container';
import { guardBusinessAccess } from '../middleware/guardBusinessAccess';

const inputSchema = z.object({
  // fields
});

export const functionName = createServerFn({ method: 'GET' | 'POST' })
  .middleware([authMiddleware, containerMiddleware, guardBusinessAccess])
  .inputValidator(inputSchema)
  .handler(async ({ data, context }) => {
    const { container, user } = context;
    // implementation
    return { success: true, data: result };
  });
```

### Domain service blueprint pattern

```typescript
export class ServiceName {
  constructor(
    private readonly repo: IRepository,
    private readonly eventDispatcher: IEventDispatcher,
  ) {}

  async methodName(input: InputType): Promise<OutputType> {
    // domain logic
  }
}
```

---

## Criterios de Aceptación — rules

Each criterion must be:
- **Specific** — "retorna 403 si el usuario no tiene MANAGE_USERS" not "funciona correctamente"
- **Testable** — can be verified by running something or checking output
- **Complete** — cover happy path + at least one error case
- **TypeScript** — always include `pnpm tsc --noEmit → 0 errores` in the last criterion

### Good criteria examples
```
- [ ] `listCustomers` retorna clientes únicos del negocio
- [ ] `search` filtra por nombre, teléfono o email (case-insensitive)
- [ ] Retorna 403 si el usuario no tiene permiso `VIEW_USERS`
- [ ] Retorna lista vacía (no error) si el negocio no tiene clientes aún
- [ ] `pnpm tsc --noEmit` → 0 errores
```

### Bad criteria examples
```
- [ ] Funciona correctamente          ← not testable
- [ ] El componente se ve bien        ← subjective
- [ ] La función retorna datos        ← too vague
```

---

## Task sizing

| Size | Description | Max tasks per day |
|---|---|---|
| Small | < 30 lines, no new file | 4–5 |
| Medium | New file or 50–100 lines | 2–3 |
| Large | New domain concept or complex component | 1–2 |

If a day has more than 5 tasks, split into two days or defer lower-priority tasks.

---

## Notes for agents (the `> **Nota para agentes:**` block)

Include when:
- There's a data model quirk that isn't obvious (e.g. no Customer in Prisma)
- A pattern differs from what a generic agent would assume
- There's a file that MUST be read before implementing
- A dependency check must be done first

Format:
```markdown
> **Nota para agentes:** Los datos del cliente están denormalizados en
> `reservations` (campos `customerId`, `customerName`). No existe un modelo
> `Customer` en Prisma. Ver `listCustomers` en `customer.ts` como referencia.
```
