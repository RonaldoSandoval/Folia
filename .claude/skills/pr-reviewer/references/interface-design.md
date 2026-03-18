# Interface Design Review Checklist

Applies to `*.tsx` components and CSS files in `src/components/**` and `src/routes/**`.

## Table of Contents
1. Component Responsibility
2. Layout & Spacing
3. Empty States & Loading States
4. Error States
5. Accessibility
6. Mantine UI Patterns
7. Tailwind CSS Conventions
8. CSS Conventions (project-specific)

---

## 1. Component Responsibility (MAJOR)

- Each component renders ONE logical unit — not a page fragment + a sidebar + a modal
- Presentational components (pure render) must NOT call hooks that fetch data
- Container components (data + logic) must NOT contain complex layout markup
- Modal and drawer content must be isolated components, not inline JSX

---

## 2. Layout & Spacing (MINOR)

- Use Mantine spacing scale (`xs`, `sm`, `md`, `lg`, `xl`) — no arbitrary pixel values
- No inline `style` for spacing — use Mantine props (`p`, `m`, `gap`) or Tailwind utilities
- Responsive breakpoints declared with Mantine's `Stack`/`Group` responsive props or Tailwind responsive prefixes (`sm:`, `md:`, `lg:`)
- No magic numbers in layout (e.g., `width: 347px` without explanation)

---

## 3. Empty States & Loading States (MAJOR)

Every list, table, or data display component MUST have:

- [ ] A loading skeleton or spinner shown while data is pending
- [ ] An empty state with a message (not just blank space) when data is empty
- [ ] For charts/analytics: show a placeholder or "no data" message, not a broken chart

FAIL: component that renders `null` or an empty container when loading/empty.
FAIL: using `data?.length && <List>` without an explicit empty branch.

---

## 4. Error States (MAJOR)

- Route-level errors handled by `errorComponent` in the route definition
- Component-level query errors must show a user-friendly message, not expose raw error
- Destructive actions (delete, cancel) must have a confirmation dialog — never fire on first click

---

## 5. Accessibility (MAJOR)

- Interactive elements (buttons, links) must have accessible labels:
  - Icon-only buttons require `aria-label`
  - Images require `alt` text
- Form inputs must be associated with labels (`htmlFor` / `id` pair, or Mantine Input with `label` prop)
- Keyboard navigation: modals must trap focus, close on Escape
- No `onClick` on non-interactive elements (div, span) without `role` + keyboard handler

---

## 6. Mantine UI Patterns (MINOR)

- Use Mantine components for common patterns — do not reimplement: Button, Modal, Drawer, Table, Select, DatePicker, Notification
- Use `useDisclosure` for modal/drawer open state — not manual `useState(false)`
- Use `notifications.show()` for transient messages — not custom toast implementations
- Mantine theme tokens preferred over hardcoded colors: `var(--mantine-color-blue-6)` not `#228be6`

---

## 7. Tailwind CSS Conventions (MINOR)

Project uses Tailwind v4 (`@import 'tailwindcss'` syntax, no config file).

- No `@apply` in component JSX — utility classes directly on elements
- No Tailwind classes that duplicate Mantine props (e.g., don't add `p-4` if `p="md"` is set)
- CSS variables from Mantine (`--mantine-color-*`) preferred over Tailwind color utilities for brand colors

---

## 8. Project-Specific CSS Conventions (MAJOR)

From `src/styles.css` patterns:

- Calendar toolbar: scope to `.custom-toolbar button` — never global button selectors
- Popovers: target `[data-slot='popover-content']` or `[data-radix-popper-content-wrapper]`
- Calendar sidebar: target by `data-testid` attribute — NEVER `div[class*='sticky']` substring selectors
- Do not use class substring selectors (`[class*='something']`) on third-party components — they break silently on library updates

---

## Common Interface Design FAIL Patterns

| Pattern | Severity |
|---|---|
| List renders nothing when empty | MAJOR |
| Chart renders broken state when data is undefined | MAJOR |
| Icon button with no aria-label | MAJOR |
| `onClick` on a `<div>` without `role="button"` | MAJOR |
| Hardcoded pixel values for spacing | MINOR |
| Manual open/close state instead of useDisclosure | MINOR |
| CSS class substring selector on third-party component | MAJOR |
| Destructive action with no confirmation dialog | MAJOR |
