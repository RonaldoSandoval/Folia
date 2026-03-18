# React / Next.js Review Checklist (Vercel Best Practices)

Applies to `*.tsx`, `*.ts` in `src/routes/**` and `src/components/**`.

## Table of Contents
1. Component Design
2. Data Fetching & Server/Client Split
3. Performance Patterns
4. React Query Usage
5. TanStack Router Patterns
6. Bundle & Code Splitting
7. Common Anti-Patterns

---

## 1. Component Design (MAJOR)

- Components do one thing — split large components (>150 lines) into smaller ones
- No prop drilling more than 2 levels — use context or co-located state
- Avoid premature abstraction — three similar JSX blocks is fine, a bad abstraction is not
- Use named exports for components (not default exports) for better tree-shaking
- No business logic inside components — logic belongs in hooks or server functions

---

## 2. Data Fetching & Server/Client Split (CRITICAL)

For TanStack React Start (SSR):
- Data fetching in loaders (`createFileRoute` loader) not in `useEffect`
- `useEffect` for data fetching = CRITICAL (causes waterfalls, misses SSR)
- Server functions (`createServerFn`) must use `authMiddleware` + `containerMiddleware`
- Never call Prisma or repositories directly from client components

For React Query:
- Always provide stable, descriptive query keys (arrays, not strings)
- `queryKey` must include all variables the query depends on
- Mutations must invalidate related queries on success

---

## 3. Performance Patterns (MAJOR)

- Lazy-load heavy components with `React.lazy` + `Suspense`
- Charts, maps, and rich editors must be lazy-loaded
- `useMemo`/`useCallback` only when the dependency list is stable AND the computation is measurably expensive — do not use them defensively
- Avoid creating new objects/arrays in JSX props (causes unnecessary re-renders):
  ```tsx
  // FAIL
  <Component style={{ color: 'red' }} />
  <Component items={[1, 2, 3]} />

  // PASS
  const style = { color: 'red' };
  <Component style={style} />
  ```
- No synchronous heavy computation in render path

---

## 4. React Query Usage (MAJOR)

- Every `useQuery` must have a `queryKey` matching the shape: `[resource, id?, filters?]`
- `staleTime` should be set for non-realtime data to avoid redundant fetches
- `enabled` flag required when query depends on user input that may be undefined
- Mutations (`useMutation`) must have `onSuccess` that invalidates or updates the cache
- No `refetchInterval` polling when websockets or invalidation suffice

FAIL:
```typescript
useQuery({ queryKey: 'reservations', ... })  // string key
useQuery({ queryKey: ['data'], ... })          // vague key
```

PASS:
```typescript
useQuery({ queryKey: ['reservations', businessId, { from, to }], ... })
```

---

## 5. TanStack Router Patterns (MAJOR)

- Route loaders (`loader`) must be used for initial data — not `useEffect` on mount
- `loaderDeps` must declare all search params the loader depends on
- Search params must be validated with a schema (`validateSearch`)
- `useLoaderData` and `useSearch` preferred over `useParams` + manual parsing
- Error boundaries (`errorComponent`) must be defined for routes that fetch data

---

## 6. Bundle & Code Splitting (MINOR)

- No barrel imports from large libraries when individual imports are available
  ```typescript
  // FAIL: imports entire lodash
  import _ from 'lodash';

  // PASS: tree-shakeable
  import { debounce } from 'lodash-es';
  ```
- Dynamic imports for page-level components in the route tree
- Icons imported individually, not from an icon pack barrel

---

## 7. Common Anti-Patterns (FAIL list)

| Anti-pattern | Severity | Fix |
|---|---|---|
| `useEffect` for data fetching | CRITICAL | Use route loader |
| `any` in component props | MAJOR | Type explicitly |
| Inline object/array in JSX props (hot path) | MAJOR | Hoist to const or useMemo |
| Missing query key variables | MAJOR | Include all deps in key |
| No Suspense boundary around lazy component | MAJOR | Wrap with Suspense |
| Business logic in JSX | MAJOR | Extract to hook |
| Stale closure in useEffect | MAJOR | Add to dependency array |
| `console.log` in component | MINOR | Remove before merge |
| Default export for component | MINOR | Use named export |
