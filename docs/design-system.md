# Design System

## Design Tokens

All colors, backgrounds, and borders are defined as CSS custom properties in `src/styles.css`. Tailwind's `@theme inline` block maps semantic names to those variables, making them available as utility classes throughout the app.

### Light Mode Tokens

```css
--typs-background:   #ffffff
--typs-surface:      #f9f9f8
--typs-border:       #e5e5e3
--typs-divider:      #ebebea
--typs-foreground:   #1a1a1a
--typs-secondary:    #525252
--typs-muted:        #8c8c8c
--typs-brand:        #5B47F5    /* primary action color */
--typs-brand-subtle: #ede9fe
--typs-brand-deep:   #4338ca
--typs-danger:       #ef4444
```

### Dark Mode Tokens (`.dark` on `<html>`)

```css
--typs-background:   #141414
--typs-surface:      #1c1c1c
--typs-border:       #2e2e2e
--typs-divider:      #262626
--typs-foreground:   #f0f0f0
--typs-secondary:    #a3a3a3
--typs-muted:        #737373
--typs-brand:        #7c6ff7
--typs-brand-subtle: #2d2457
--typs-brand-deep:   #6d5fe6
--typs-danger:       #f87171
```

---

## Using Tokens in Components

Use semantic Tailwind class names — never hard-code colors:

```html
<!-- Correct -->
<div class="bg-background text-foreground border-border">
<p class="text-muted">
<button class="bg-brand text-white hover:bg-brand-deep">

<!-- Wrong -->
<div class="bg-white text-gray-900">
<button class="bg-purple-600">
```

When dark mode is toggled, `ThemeService` adds/removes the `dark` class on `<html>`. All CSS custom properties update automatically — no per-component dark mode logic required.

---

## Theme Switching

`ThemeService` (`src/app/core/service/theme/theme-service.ts`):

- On init: reads `localStorage.theme` → falls back to `prefers-color-scheme` → defaults to light.
- `toggle()` flips the signal and re-applies to DOM.
- Persists preference to `localStorage`.

The header renders a Sun/Moon icon button that calls `themeService.toggle()`.

---

## Shared Components

### Button (`app-button`)

```html
<app-button variant="primary" size="md" [icon]="SomeIcon" [loading]="false" (click)="action()">
  Label
</app-button>
```

| Input | Type | Default | Options |
|-------|------|---------|---------|
| `variant` | `ButtonVariant` | `'primary'` | `primary`, `secondary`, `ghost` |
| `size` | `ButtonSize` | `'md'` | `sm`, `md`, `lg` |
| `icon` | `LucideIconData \| null` | `null` | any Lucide icon |
| `loading` | `boolean` | `false` | shows spinner, disables button |
| `disabled` | `boolean` | `false` | |
| `type` | `string` | `'button'` | `button`, `submit`, `reset` |

---

### TextField (`app-text-field`)

```html
<app-text-field
  label="Email"
  placeholder="usuario@ejemplo.com"
  type="email"
  [icon]="Mail"
  [(value)]="emailSignal"
  [error]="errorMessage"
/>
```

Supports two-way model binding via Angular's `model()` input signal.

---

### Spinner (`app-spinner`)

```html
<app-spinner size="lg" color="brand" label="Cargando..." />
```

| Input | Options |
|-------|---------|
| `size` | `sm`, `md`, `lg`, `xl` |
| `color` | `brand`, `white`, `muted` |

---

### Modal (`app-modal`)

```html
<app-modal title="Confirmar acción" (close)="onClose()">
  <!-- projected content -->
</app-modal>
```

- Closes on Escape key.
- Closes on backdrop click.
- Locks `document.body` scroll while open.

---

### Toast (`app-toast-container`)

Rendered once in `app.html`. Use `ToastService` from anywhere:

```ts
private readonly toast = inject(ToastService);

this.toast.success('Documento guardado.');
this.toast.error('Error al conectar. Inténtalo de nuevo.');
this.toast.warning('Límite de peticiones casi alcanzado.');
this.toast.info('Colaborador añadido.');
```

| Method | Default duration |
|--------|-----------------|
| `success()` | 3 s |
| `error()` | 5 s |
| `warning()` | 4 s |
| `info()` | 3 s |

All durations are customizable: `toast.success('msg', 2000)`.

---

### Dropdown (`app-dropdown`)

```ts
items: DropdownItem[] = [
  { id: 'rename', label: 'Renombrar', icon: Pencil },
  { id: 'delete', label: 'Eliminar',  icon: Trash2, variant: 'danger' },
];
```

```html
<app-dropdown [items]="items" align="right" (itemClick)="onAction($event)">
  <!-- trigger button via ng-content -->
</app-dropdown>
```

---

## Icons

All icons come from `lucide-angular`. Import the specific icon constant and bind it to the `[img]` input of `<lucide-icon>`:

```ts
import { Sparkles, ArrowUp } from 'lucide-angular';

protected readonly Sparkles = Sparkles;
```

```html
<lucide-icon [img]="Sparkles" class="w-4 h-4 text-brand my-icon" />
```

The `.my-icon` utility class (defined in `styles.css`) ensures consistent SVG sizing behavior.

---

## Typography

| Class | Use |
|-------|-----|
| `text-foreground` | Body text |
| `text-secondary` | Secondary / subdued |
| `text-muted` | Placeholder / timestamps |
| `text-brand` | Interactive / accent |
| `text-xs` / `text-sm` / `text-base` | Standard Tailwind size scale |

The editor uses `"JetBrains Mono", "Fira Code", monospace` at 13px.

---

## Layout Primitives

| Class | Meaning |
|-------|---------|
| `bg-background` | Page background |
| `bg-surface` | Card / panel background (slightly off-white / dark) |
| `border-border` | Standard divider color |
| `border-divider` | Lighter inner divider |
| `shadow-sm` | Subtle card shadow |
