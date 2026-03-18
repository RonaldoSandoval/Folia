# DDD Review Checklist

## Table of Contents
1. Domain Purity (CRITICAL)
2. Immutability (CRITICAL)
3. Result Types - No Exceptions (CRITICAL)
4. Event Emission (CRITICAL)
5. Private Constructors + Factory Pattern (CRITICAL)
6. State Transitions Structure (CRITICAL)
7. Base Class Selection (MAJOR)
8. Value Objects (MAJOR)
9. Domain Events Structure (MAJOR)
10. Testing Requirements (MAJOR)
11. Common Mistakes Quick-Ref

---

## 1. Domain Purity (CRITICAL)

No infrastructure dependencies inside `src/domain/**` or `src/application/**`.

FAIL if any of these appear in domain/application layer files:
- `import { PrismaClient }` or any `@prisma/client` imports
- `import express` / `import fastify` / any HTTP framework
- `import { Redis }` or any cache/queue client
- Direct `fetch()` calls or HTTP requests
- File system imports (`fs`, `path` used for I/O)

OK:
- `import { BaseAggregate } from './base/BaseAggregate'`
- `import { Result, ok, err } from '../../shared/Result'`
- `import { DomainError } from '../../errors'`

---

## 2. Immutability (CRITICAL)

Every getter that returns a `Date`, `Array`, or `object` must return a defensive copy.

FAIL patterns:
```typescript
get startTime(): Date { return this._startTime; }           // exposes reference
get items(): Item[]  { return this._items; }                // exposes array
get meta(): Record   { return this._meta; }                 // exposes object
```

PASS patterns:
```typescript
get startTime(): Date  { return new Date(this._startTime); }
get items(): Item[]    { return [...this._items]; }
get meta(): Record     { return { ...this._meta }; }
```

---

## 3. Result Types - No Exceptions (CRITICAL)

All domain operations that can fail MUST return `Result<T, DomainError>`.

FAIL:
```typescript
approve(userId: string): void { if (!valid) throw new Error('...'); }
```

PASS:
```typescript
approve(userId: string): Result<void, DomainError> {
  if (!valid) return err(new ValidationError('...'));
  return ok(void 0);
}
```

Also check: no bare `throw` inside any domain/application layer method.

---

## 4. Event Emission (CRITICAL)

Every state-mutating operation must emit a domain event via `this.addDomainEvent(...)`.

FAIL: state changes with no `addDomainEvent` call.

PASS:
```typescript
this._status = 'APPROVED';
this.recordUpdate(userId);  // <-- audit trail, ALSO required
this.addDomainEvent(new ReservationApprovedEvent(this.id, userId, new Date()));
```

Check that `this.recordUpdate(userId)` is called on EVERY mutation.

---

## 5. Private Constructors + Factory Pattern (CRITICAL)

Aggregates and value objects must use private constructors with a public static factory.

FAIL:
```typescript
export class Reservation { public constructor(...) { } }
// or: new Reservation(...)  called outside the class
```

PASS:
```typescript
export class Reservation extends BaseAggregate<string> {
  private constructor(...) { super(...); }
  static create(cmd: CreateReservationCommand): Result<Reservation, DomainError> { ... }
}
```

---

## 6. State Transition Structure (CRITICAL)

Every state transition method must follow this exact order:

1. Guard: check current state (`if (this._status !== 'EXPECTED_STATE') return err(...)`)
2. Guard: validate inputs (`if (!userId?.trim()) return err(...)`)
3. Guard: check business rules (if applicable)
4. Mutate state (`this._status = 'NEW_STATE'`)
5. Set timestamp field (`this._approvedAt = new Date()`)
6. Set actor field (`this._approvedBy = userId`)
7. Call `this.recordUpdate(userId)`
8. Emit domain event
9. Return `ok(void 0)`

Missing ANY of steps 1, 7, 8, or 9 = CRITICAL finding.
Missing steps 4-6 when applicable = MAJOR finding.

---

## 7. Base Class Selection (MAJOR)

| Aggregate type | Correct base |
|---|---|
| Reservation, Appointment | `BaseAggregate<string>` (lifecycle via states) |
| Employee, Resource, Service, Business | `SoftDeletableAggregate<string>` (can be deactivated) |

Using `BaseAggregate` for entities that need soft-delete = MAJOR.
Using `SoftDeletableAggregate` for state-machine entities = MAJOR.

---

## 8. Value Objects (MAJOR)

Value objects must:
- Have private constructor
- Have a static `create()` factory returning `Result<VO, DomainError>`
- Validate all invariants in the factory
- Expose only immutable getters
- Implement `equals(other: VO): boolean`

Common VO violations:
- Public constructor (CRITICAL)
- Missing `equals()` (MINOR)
- Mutable getter without copy (CRITICAL)

---

## 9. Domain Events Structure (MAJOR)

Events must:
- Extend `BaseDomainEvent`
- Have `readonly eventType = 'EventName'` in PascalCase, past tense
- Have `readonly aggregateType = 'AggregateName'`
- Implement `get data(): Record<string, unknown>` serializing dates as `.toISOString()`
- Live in `src/domain/events/` grouped by aggregate (e.g., `ReservationEvents.ts`)

---

## 10. Testing Requirements (MAJOR)

For every changed aggregate, value object, or domain service, tests must cover:

- [ ] Happy path (valid operations succeed)
- [ ] All validation errors (invalid inputs return err with correct error code)
- [ ] All invalid state transitions (return err with INVALID_STATE_TRANSITION code)
- [ ] Business rule enforcement
- [ ] Domain events emitted correctly (type + payload)
- [ ] Immutability (mutating returned value does not affect aggregate)

Coverage thresholds:
- State machines: 100%
- Value objects: 100%
- Aggregates: >95%
- Domain services: >90%

Missing tests for changed domain code = MAJOR finding.

---

## 11. Common Mistakes Quick-Ref

| Wrong | Correct | Severity |
|---|---|---|
| `throw new Error()` in domain | `return err(new DomainError())` | CRITICAL |
| `get date() { return this._date; }` | `return new Date(this._date)` | CRITICAL |
| `public constructor()` | `private constructor()` + factory | CRITICAL |
| Missing `recordUpdate()` | Always call on mutations | CRITICAL |
| No domain event on state change | `this.addDomainEvent(...)` | CRITICAL |
| `import { PrismaClient }` in domain | No infra imports | CRITICAL |
| `BaseAggregate` for Employee | Use `SoftDeletableAggregate` | MAJOR |
| Only happy path tests | Test all error cases | MAJOR |
| Missing `equals()` on VO | Implement structural equality | MINOR |
| No JSDoc on public methods | Document business rules | MINOR |
