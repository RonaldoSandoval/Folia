# Typs-Clone — Estado del Proyecto

> **Fecha de evaluación:** 2026-03-15
> **Rama:** master | **Commit base:** 835c9d3

---

## Resumen ejecutivo

Typs-Clone es un editor colaborativo de documentos Typst, inspirado en [typst.app](https://typst.app), construido con Angular 21. El frontend base está **85% completado**: layout, editor, compilador WASM y renderizado funcionan. Lo que falta es la capa de datos (persistencia, auth) y las features diferenciadoras (IA, colaboración).

---

## Lo que está construido

### Layout & Navegación
| Componente | Estado | Notas |
|---|---|---|
| `LandingPage` | ✅ Completo | Hero, CTA "Empezar" → `/app` |
| `AppLayout` | ✅ Completo | Wrapper flex con sidebar + header + outlet |
| `AppSidebar` | ✅ Completo | Colapsable (signal `isCollapsed`), wordmark "Typs.", nav a Documentos |
| `AppHeader` | ✅ Completo | Slots proyectados (left/right), toggle dark mode, Avatar |
| `AppShell` | ✅ Completo | Grid de documentos con búsqueda/filtro/orden (computed signals) |
| `app.routes.ts` | ✅ Completo | `/` → Landing, `/app` → AppLayout, `/project/:id` → EditorPage |

### Editor (features/editor/)
| Componente | Estado | Notas |
|---|---|---|
| `EditorPage` | ✅ Completo | Layout 3 paneles, resize drag, debounce compile 150ms |
| `EditorHeader` | ✅ Completo | Back, título, indicador compilando, descarga, guardar, toggle chat |
| `EditorPanel` | ✅ Completo | CodeMirror 6, tema custom, emite `contentChange` |
| `PreviewPanel` | ✅ Completo | Renderiza `vectorData` con `$typst.canvas()`, AbortController |
| `FilesSidebar` | 🟡 Placeholder | UI lista archivos estática ("main.typ"); sin persistencia |
| `ChatPanel` | 🟡 Placeholder | UI de chat completa; Claude API **no conectado** |

### Shared Components
| Componente | Estado | Notas |
|---|---|---|
| `Button` | ✅ Completo | Variantes primary/secondary/ghost, tamaños, icono, loading |
| `Dropdown` | ✅ Completo | Trigger slot, items tipados, outside-click, Escape, separator, danger |
| `TextField` | ✅ Completo | `model()` two-way, icono, error state, ARIA |
| `Avatar` | ✅ Completo | Iniciales, dropdown perfil/logout — sin auth real |
| `Spinner` | ✅ Completo | Tamaños, colores, accesible (role="status") |
| `DocumentList` | ✅ Completo | Grid responsive, menú por tarjeta (abrir/renombrar/eliminar), empty state |

### Core Services
| Servicio | Estado | Notas |
|---|---|---|
| `CompilerService` | ✅ Completo | Worker wrapper, cancel-in-flight, Promise API |
| `ThemeService` | ✅ Completo | Signal `isDark`, localStorage, OS detection, class en `<html>` |

### Worker
| Archivo | Estado | Notas |
|---|---|---|
| `compiler.worker.ts` | ✅ Completo | WASM Typst, caché resultado previo, manejo de errores |

---

## Lo que falta por construir

### P0 — Crítico (bloquea uso real de la app)

#### 1. Persistencia de documentos
- **Qué es:** Guardar/cargar documentos entre sesiones.
- **Alcance mínimo viable:** `LocalStorageDocumentService` con CRUD completo.
- **Alcance ideal:** API REST + base de datos (backend TBD).
- **Impacto:** Sin esto, al recargar se pierden todos los documentos y el contenido del editor.
- **Archivos a crear/modificar:**
  - `core/service/document/document.service.ts`
  - `AppShell` — conectar eventos de `DocumentList` (open, rename, delete) con el servicio
  - `EditorPage` — guardar `content` signal en el servicio al compilar/guardar

#### 2. Operaciones CRUD de documentos en AppShell
- **Qué es:** Los eventos `documentOpen`, `documentRename`, `documentDelete` de `DocumentList` están emitidos pero **no tienen handlers en AppShell**.
- **Impacto:** El menú de contexto por tarjeta no hace nada (renombrar/borrar están muertos).
- **Archivos a modificar:** `app-shell.ts`, `app-shell.html`

---

### P1 — Alta prioridad (diferenciadores del producto)

#### 3. Integración Claude API — Chat Panel
- **Qué es:** Conectar `ChatPanel` a Claude API (Anthropic) para que el asistente genere contenido Typst a partir de instrucciones del usuario.
- **Alcance:**
  - `core/service/ai/ai.service.ts` — wrapper del Anthropic SDK
  - `ChatPanel` — conectar `sendMessage()` al servicio, mostrar respuesta en streaming
  - System prompt especializado: generar bloques Typst válidos
  - Botón "Insertar en editor" que pega la respuesta en `EditorPanel`
- **Variables de entorno:** `ANTHROPIC_API_KEY` — nunca hardcoded.

#### 4. Autenticación
- **Qué es:** Login/registro de usuarios.
- **Alcance mínimo viable:** Auth con localStorage (usuario ficticio) para desbloquear guard de rutas.
- **Alcance ideal:** Supabase Auth / Firebase Auth.
- **Impacto:** Avatar tiene placeholder "John Doe"; sidebar muestra usuario hardcoded.
- **Archivos a crear:**
  - `core/service/auth/auth.service.ts`
  - `core/guards/auth.guard.ts`
  - `features/auth/login-page.ts`

---

### P2 — Media prioridad (pulido y UX)

#### 5. Manejo de múltiples archivos en editor (FilesSidebar)
- **Qué es:** `FilesSidebar` muestra solo "main.typ" estático. Necesita soporte real para múltiples archivos Typst por proyecto.
- **Alcance:**
  - Modelo `ProjectFile[]` en el servicio de documentos
  - Agregar / renombrar / eliminar archivos
  - Al cambiar de archivo activo, cargar su contenido en `EditorPanel`

#### 6. Sincronización del título del documento
- **Qué es:** `EditorHeader` muestra el título del documento, pero no lo lee del servicio (no está conectado a ningún dato real).
- **Archivos a modificar:** `editor-header.ts`, `editor-page.ts`

#### 7. Indicador de estado de guardado
- **Qué es:** Mostrar "Guardado" / "Guardando..." / "Sin guardar" en el header del editor.
- **Actualmente:** El botón "Guardar" existe pero no tiene lógica de guardado.

#### 8. Consistencia de idioma (ES/EN)
- **Qué es:** La UI mezcla español e inglés (menú de tarjeta en inglés: "Open", "Rename", "Delete"; el resto en español).
- **Solución:** Unificar todo al español o implementar i18n con Transloco.

---

### P3 — Baja prioridad / Futuro

#### 9. Colaboración en tiempo real
- **Qué es:** Múltiples usuarios editando el mismo documento simultáneamente.
- **Stack sugerido:** WebSockets + Yjs (CRDT) / Liveblocks.
- **Dependencia:** Requiere backend y autenticación primero.

#### 10. Tests unitarios e integración
- **Estado actual:** Archivos `.spec.ts` existen con placeholders vacíos.
- **Vitest** está configurado (`ng test`).
- **Alcance:** Tests para CompilerService, ThemeService, DocumentList, AppShell.

#### 11. Exportación de documentos (PDF/SVG)
- **Qué es:** El botón "Descargar" en EditorHeader descarga el archivo `.typ` (fuente). Falta exportar el PDF/SVG compilado.
- **Stack:** `@myriaddreamin/typst.ts` soporta exportación a PDF desde WASM.

#### 12. Backend y base de datos
- **Decisión pendiente:** ¿Supabase? ¿Firebase? ¿API propia (NestJS)?
- **Impacto:** Necesario para persistencia real, auth y colaboración.

---

## Deuda técnica identificada

| # | Deuda | Severidad | Descripción |
|---|---|---|---|
| DT-1 | `documents[]` hardcoded en AppShell | Alta | Array de 6 documentos de prueba; no persiste |
| DT-2 | Sin handlers para rename/delete | Alta | Eventos emitidos pero no escuchados |
| DT-3 | Brand name "Learn" en sidebar | Baja | Placeholder no actualizado a "Typs" |
| DT-4 | Tests vacíos | Media | Specs existen pero sin assertions |
| DT-5 | `any` implícito en mensajes de ChatPanel | Media | Messages array sin tipo explícito definido |
| DT-6 | Mezcla ES/EN en UI | Baja | UX inconsistente para usuario final |

---

## Arquitectura actual (diagrama de capas)

```
┌─────────────────────────────────────────────────────────┐
│                      Browser                            │
│  ┌──────────────┐  ┌───────────────────────────────────┐│
│  │ Main Thread  │  │          Web Workers               ││
│  │              │  │  ┌────────────────────────────┐   ││
│  │  Angular App │  │  │  compiler.worker.ts (WASM) │   ││
│  │  ┌─────────┐ │  │  │  Typst → vectorData        │   ││
│  │  │ Routing │ │  │  └────────────────────────────┘   ││
│  │  └────┬────┘ │  └───────────────────────────────────┘│
│  │       │      │                                        │
│  │  ┌────▼────────────────────────────┐                 │
│  │  │         Layout Layer            │                 │
│  │  │  LandingPage / AppLayout        │                 │
│  │  │  AppSidebar / AppHeader         │                 │
│  │  │  AppShell (documents list)      │                 │
│  │  └────────────┬────────────────────┘                 │
│  │               │                                       │
│  │  ┌────────────▼────────────────────┐                 │
│  │  │        Features Layer           │                 │
│  │  │  EditorPage                     │                 │
│  │  │  ├─ EditorHeader                │                 │
│  │  │  ├─ FilesSidebar (placeholder)  │                 │
│  │  │  ├─ EditorPanel (CodeMirror 6)  │                 │
│  │  │  ├─ PreviewPanel (typst.canvas) │                 │
│  │  │  └─ ChatPanel (placeholder)     │                 │
│  │  └────────────┬────────────────────┘                 │
│  │               │                                       │
│  │  ┌────────────▼────────────────────┐                 │
│  │  │        Core Services            │                 │
│  │  │  CompilerService ──► Worker     │                 │
│  │  │  ThemeService                   │                 │
│  │  │  [DocumentService] ← POR HACER │                 │
│  │  │  [AuthService]     ← POR HACER │                 │
│  │  │  [AiService]       ← POR HACER │                 │
│  │  └─────────────────────────────────┘                 │
│  └──────────────────────────────────────────────────────│
└─────────────────────────────────────────────────────────┘
```

---

## Métricas del proyecto

| Métrica | Valor |
|---|---|
| Componentes standalone creados | 16 |
| Servicios core | 2 (+ 3 pendientes) |
| Workers | 1 |
| Rutas configuradas | 4 |
| Tests escritos | 0 (specs vacíos) |
| Features completadas | 5 / 8 |
| Deuda técnica identificada | 6 items |

---

*Generado automáticamente el 2026-03-15 — actualizar al inicio de cada sprint.*
