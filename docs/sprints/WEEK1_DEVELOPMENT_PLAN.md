# Semana 1: Persistencia + CRUD + IA — DocumentService + AppShell + EditorPage + Claude API

**Proyecto:** Typs-Clone
**Timeline:** Semana 1 (6 días) – De datos hardcoded a un editor funcional con persistencia real e IA integrada
**Estado:** Pendiente
**Formato:** AI Agent Execution Plan v2.0
**Dependencias:** Sin semana anterior — primer sprint del proyecto

---

## 🎯 Objetivos de la Semana 1

**Justificación de Prioridades:**
El frontend base está al 85% pero la app no es usable: los documentos se pierden al recargar, el menú de contexto no hace nada, y el ChatPanel es un placeholder vacío. Esta semana convierte la app de un prototipo visual a un producto funcional, atacando primero la capa de datos (Día 1) que desbloquea el CRUD de home y la persistencia del editor (Días 2–3), y cerrando con la feature diferenciadora: el asistente de IA con Claude API (Día 4).

**Qué construimos esta semana:**

1. **`DocumentService`** – Servicio de CRUD completo sobre LocalStorage con signals reactivos
2. **AppShell CRUD** – Conectar DocumentList a DocumentService: crear, abrir, renombrar, eliminar
3. **EditorPage persistencia** – Auto-save, carga por ID desde el servicio, título sincronizado en header
4. **`AiService` + Claude API** – Integración real del ChatPanel con streaming y botón "Insertar en editor"
5. **FilesSidebar multi-archivo + UX español** – Modelo real de archivos por proyecto, idioma unificado

**Definición de Terminado:**

- Al recargar la página, los documentos del home siguen ahí
- Crear/renombrar/eliminar un documento funciona desde el home
- Abrir un documento en el editor carga su contenido guardado
- Escribir en el editor auto-guarda cada 2 segundos
- El ChatPanel llama a Claude API y muestra la respuesta en streaming
- El botón "Insertar en editor" pega el último mensaje del asistente en el EditorPanel
- La UI está unificada en español
- `npm run build` → 0 errores
- `npm test` → tests pasan (o sin regresiones)

---

## 📊 Tracker de Progreso Semana 1

```
Semana 1 (Persistencia + CRUD + IA):
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0%

⬜ Día 1: DocumentService (LocalStorage)      [░░░░░░░░] 0%
⬜ Día 2: AppShell CRUD                       [░░░░░░░░] 0%
⬜ Día 3: EditorPage Persistencia             [░░░░░░░░] 0%
⬜ Día 4: AiService + Claude API              [░░░░░░░░] 0%
⬜ Día 5: FilesSidebar + UX Español           [░░░░░░░░] 0%
⬜ Día 6: E2E Polish + Validación             [░░░░░░░░] 0%
```

---

## ⚠️ CRÍTICO: Checklist Pre-Implementación

### Paso 1: Verificar archivos base que deben existir

```bash
ls src/app/shared/components/document-list/document-list.ts
ls src/app/layout/app/app-shell/app-shell.ts
ls src/app/features/editor/editor-page.ts
ls src/app/features/editor/components/chat-panel/chat-panel.ts
ls src/app/features/editor/components/files-sidebar/files-sidebar.ts
ls src/app/features/editor/components/editor-header/editor-header.ts
ls src/app/core/service/compiler/compiler-service.ts
```

**Si falta alguno:** El editor base no está completo — revisar rama master antes de continuar.

### Paso 2: Verificar que DocumentItem ya está exportado

```bash
grep "export interface DocumentItem" src/app/shared/components/document-list/document-list.ts
grep "export type { DocumentItem }" src/app/layout/app/app-shell/app-shell.ts
```

**Esperado:** La interfaz `DocumentItem` existe en `document-list.ts` y es re-exportada por `app-shell.ts`. El `DocumentService` la importará desde `document-list.ts`.

### Paso 3: Verificar que no existe ya un DocumentService

```bash
ls src/app/core/service/document/ 2>/dev/null || echo "OK - directorio no existe"
```

**Esperado:** `OK - directorio no existe` (lo crearemos en Día 1).

---

## 🚀 Día 1: DocumentService — LocalStorage CRUD

### Estado Actual

- ✅ `DocumentItem` interface existe en `src/app/shared/components/document-list/document-list.ts`
- ✅ `AppShell` tiene `documents[]` hardcoded con 6 items de prueba
- ✅ `AppShell` tiene `generateId()` que usa `crypto.getRandomValues`
- ❌ No existe `src/app/core/service/document/` directorio
- ❌ No existe `DocumentService`
- ❌ No hay persistencia de ningún tipo

### Estado Objetivo

- ✅ `src/app/core/service/document/document.service.ts` creado
- ✅ CRUD completo: `create()`, `getAll()`, `getById()`, `update()`, `delete()`
- ✅ Estado reactivo via `signal<Document[]>` — el home se actualiza automáticamente
- ✅ Serialización/deserialización de `Date` en LocalStorage
- ✅ `Document` extiende `DocumentItem` con campo `content: string`

> **Nota para agentes:** `DocumentItem` (en `document-list.ts`) solo tiene `{ id, title, updatedAt }`. El nuevo `Document` del servicio agrega `content: string`. El servicio debe importar `DocumentItem` desde `../../shared/components/document-list/document-list` y extenderla. El `AppShell` usa `DocumentItem[]` en su template — el servicio expone un `computed<DocumentItem[]>` que mapea automáticamente. No usar `@Injectable({ providedIn: 'root' })` directamente — registrar en `app.config.ts` con `provideDocumentService()` para facilitar testing futuro. Usar `inject()` en lugar de constructor injection en todos los componentes que consuman el servicio.

---

### Tarea 1.1: Crear `src/app/core/service/document/document.service.ts`

Crear el servicio central de documentos con CRUD sobre LocalStorage. El servicio mantiene un `signal<Document[]>` como fuente de verdad; todas las operaciones mutan el signal y persisten a LocalStorage sincrónicamente. La interfaz `Document` extiende `DocumentItem` para compatibilidad con los componentes existentes.

```typescript
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { DocumentItem } from '../../../shared/components/document-list/document-list';

export interface Document extends DocumentItem {
  content: string;
}

const STORAGE_KEY = 'typs_documents';

@Injectable()
export class DocumentService {
  private readonly router = inject(Router);

  private readonly _documents = signal<Document[]>(this.loadFromStorage());

  /** Vista reactiva de todos los documentos — para el home list. */
  readonly documents = computed<DocumentItem[]>(() =>
    this._documents().map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
  );

  /** Devuelve un documento completo por ID o undefined. */
  getById(id: string): Document | undefined {
    return this._documents().find((d) => d.id === id);
  }

  /** Crea un nuevo documento vacío y navega al editor. */
  create(): void {
    const doc: Document = {
      id: this.generateId(),
      title: 'Sin título',
      content: '= Sin título\n\nEscribe tu contenido Typst aquí.\n',
      updatedAt: new Date(),
    };
    this._documents.update((docs) => [doc, ...docs]);
    this.persist();
    this.router.navigate(['/project', doc.id]);
  }

  /** Actualiza el contenido y el timestamp de un documento. */
  saveContent(id: string, content: string): void {
    this._documents.update((docs) =>
      docs.map((d) => (d.id === id ? { ...d, content, updatedAt: new Date() } : d))
    );
    this.persist();
  }

  /** Renombra un documento. */
  rename(id: string, title: string): void {
    const trimmed = title.trim();
    if (!trimmed) return;
    this._documents.update((docs) =>
      docs.map((d) => (d.id === id ? { ...d, title: trimmed, updatedAt: new Date() } : d))
    );
    this.persist();
  }

  /** Elimina un documento por ID. */
  delete(id: string): void {
    this._documents.update((docs) => docs.filter((d) => d.id !== id));
    this.persist();
  }

  private persist(): void {
    try {
      const serialized = JSON.stringify(
        this._documents().map((d) => ({ ...d, updatedAt: d.updatedAt.toISOString() }))
      );
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch {
      // Private browsing o storage lleno — continuar sin persistir
    }
  }

  private loadFromStorage(): Document[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Array<Document & { updatedAt: string }>;
      return parsed.map((d) => ({ ...d, updatedAt: new Date(d.updatedAt) }));
    } catch {
      return [];
    }
  }

  private generateId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(22)))
      .map((b) => chars[b % chars.length])
      .join('');
  }
}

export function provideDocumentService() {
  return { provide: DocumentService, useClass: DocumentService };
}
```

**Criterios de Aceptación:**

- [ ] `DocumentService` compila sin errores (`npm run build`)
- [ ] `create()` genera un ID único de 22 chars y navega a `/project/:id`
- [ ] `saveContent()` actualiza `updatedAt` al momento actual
- [ ] `rename()` ignora títulos vacíos o solo espacios
- [ ] `delete()` elimina el documento del signal y de LocalStorage
- [ ] Al recargar la página, `loadFromStorage()` restaura los documentos correctamente
- [ ] Las fechas se deserializan como objetos `Date` (no strings)

---

### Tarea 1.2: Registrar `DocumentService` en `src/app/app.config.ts`

Agregar `provideDocumentService()` al array de providers del bootstrap para que esté disponible como singleton en toda la app.

```typescript
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideDocumentService } from './core/service/document/document.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideDocumentService(),
  ],
};
```

**Criterios de Aceptación:**

- [ ] `npm run build` → 0 errores
- [ ] `inject(DocumentService)` en cualquier componente resuelve la instancia singleton correctamente
- [ ] No hay `providedIn: 'root'` en el decorador del servicio (se provee explícitamente)

---

## 🚀 Día 2: AppShell — Conectar CRUD al DocumentService

### Estado Actual

- ✅ `AppShell` tiene `documents[]` hardcoded con 6 items de prueba
- ✅ `AppShell` tiene `openDocument(doc)` que navega al editor
- ✅ `DocumentList` emite `documentOpen`, `documentRename`, `documentDelete`
- ❌ `documentRename` y `documentDelete` no tienen handlers en `app-shell.ts`
- ❌ `documents[]` es un array estático — no lee del `DocumentService`
- ❌ `createDocument()` genera un ID propio en lugar de delegar al servicio

> **Nota para agentes:** Leer `src/app/layout/app/app-shell/app-shell.ts` completo antes de modificar. El `AppShell` actualmente usa constructor injection (`private readonly router`) — migrarlo a `inject()` al mismo tiempo. El `filteredDocuments` computed actualmente lee de `this.documents` (array estático) — debe cambiar a `this.documentService.documents()` como fuente reactiva.

### Estado Objetivo

- ✅ `AppShell` inyecta `DocumentService` con `inject()`
- ✅ `filteredDocuments` computed lee de `documentService.documents()`
- ✅ `createDocument()` delega a `documentService.create()`
- ✅ `openDocument()` navega a `/project/:id`
- ✅ `renameDocument()` llama a `documentService.rename(id, nuevoTítulo)`
- ✅ `deleteDocument()` llama a `documentService.delete(id)` con confirmación simple
- ✅ Array hardcoded eliminado

---

### Tarea 2.1: Actualizar `AppShell` para leer del `DocumentService`

Reemplazar el array hardcoded por la señal reactiva del servicio. Migrar constructor injection a `inject()`. El computed `filteredDocuments` lee de `documentService.documents()` como fuente, manteniendo la lógica de filtro/orden existente intacta.

```typescript
// Reemplazar en app-shell.ts

import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DocumentService } from '../../../core/service/document/document.service';
// ... resto de imports

export class AppShell {
  private readonly router          = inject(Router);
  private readonly documentService = inject(DocumentService);

  // Eliminar: readonly documents: DocumentItem[] = [ ... ]
  // Eliminar: constructor(private readonly router: Router) {}
  // Eliminar: private generateId(): string { ... }

  createDocument(): void {
    this.documentService.create(); // navega internamente
  }

  openDocument(doc: DocumentItem): void {
    this.router.navigate(['/project', doc.id]);
  }

  renameDocument(doc: DocumentItem): void {
    const nuevoTitulo = window.prompt('Nuevo nombre:', doc.title);
    if (nuevoTitulo) this.documentService.rename(doc.id, nuevoTitulo);
  }

  deleteDocument(doc: DocumentItem): void {
    if (window.confirm(`¿Eliminar "${doc.title}"?`)) {
      this.documentService.delete(doc.id);
    }
  }

  readonly filteredDocuments = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    // fuente ahora es el signal reactivo del servicio
    let result = term
      ? this.documentService.documents().filter((d) => d.title.toLowerCase().includes(term))
      : [...this.documentService.documents()];
    // ... lógica de sort existente sin cambios
    switch (this.sortOrder()) { /* ... igual que antes */ }
    return result;
  });
}
```

**Criterios de Aceptación:**

- [ ] El home muestra la lista real de documentos desde LocalStorage (no el array hardcoded)
- [ ] "Crear Documento" crea un documento en LocalStorage y navega al editor
- [ ] Al volver al home, el nuevo documento aparece en la lista
- [ ] Renombrar un documento actualiza su nombre en la tarjeta y en LocalStorage
- [ ] Eliminar un documento lo quita de la lista y de LocalStorage
- [ ] La búsqueda y el orden siguen funcionando
- [ ] `npm run build` → 0 errores

---

### Tarea 2.2: Conectar eventos de `DocumentList` al template de `AppShell`

Agregar los bindings `(documentRename)` y `(documentDelete)` en `app-shell.html` para conectar los eventos que ya emite `DocumentList` pero que el template ignoraba.

```html
<!-- En app-shell.html — actualizar el componente document-list -->
<app-document-list
  [documents]="filteredDocuments()"
  [searchActive]="!!searchTerm()"
  (documentOpen)="openDocument($event)"
  (documentRename)="renameDocument($event)"
  (documentDelete)="deleteDocument($event)"
/>
```

**Criterios de Aceptación:**

- [ ] El menú contextual "Renombrar" abre un prompt y actualiza el título
- [ ] El menú contextual "Eliminar" pide confirmación y borra la tarjeta
- [ ] El menú contextual "Abrir" navega al editor correctamente
- [ ] Sin regresiones visuales en el grid de documentos

---

## 🚀 Día 3: EditorPage — Persistencia (Cargar, Auto-save, Título)

### Estado Actual

- ✅ `EditorPage` tiene `documentId` del route param (`/project/:id`)
- ✅ `EditorPage` tiene `content` signal con `DEFAULT_CONTENT` hardcoded
- ✅ `EditorPage` tiene debounce de 150ms para compilar
- ✅ `EditorHeader` tiene input `documentTitle` y botón "Guardar"
- ❌ El editor siempre carga `DEFAULT_CONTENT` — ignora el ID del documento
- ❌ No hay auto-save ni guardado manual conectado al servicio
- ❌ El título en `EditorHeader` está hardcoded

> **Nota para agentes:** Leer `src/app/features/editor/editor-page.ts` y `src/app/features/editor/components/editor-header/editor-header.ts` completos antes de modificar. El `debounceTimer` de 150ms es para compilar — el auto-save debe tener su propio timer separado (2000ms). Si el documento no existe en el servicio para ese ID (ej. URL directa con ID inválido), navegar de vuelta a `/app`.

### Estado Objetivo

- ✅ `EditorPage` inyecta `DocumentService`
- ✅ `ngOnInit` carga el documento por ID; si no existe, redirige a `/app`
- ✅ `content` signal se inicializa con `document.content`
- ✅ Auto-save: 2 segundos después del último keystroke → `documentService.saveContent()`
- ✅ Botón "Guardar" en EditorHeader llama `saveDocument()` inmediatamente
- ✅ `documentTitle` signal lee el título del documento y se pasa al EditorHeader

---

### Tarea 3.1: Cargar contenido del documento por ID en `EditorPage`

Al inicializar, buscar el documento en el servicio por el ID del route param. Si no existe, redirigir al home. Si existe, inicializar el signal `content` con su contenido guardado y el signal `documentTitle` con su título.

```typescript
// Cambios en editor-page.ts

private readonly documentService = inject(DocumentService);

/** Título del documento activo — para el EditorHeader. */
readonly documentTitle = signal('Sin título');

ngOnInit(): void {
  const doc = this.documentService.getById(this.documentId);
  if (!doc) {
    this.router.navigate(['/app']);
    return;
  }
  this.content.set(doc.content);
  this.documentTitle.set(doc.title);
  this.triggerCompile(doc.content);
}
```

**Criterios de Aceptación:**

- [ ] Abrir un documento desde el home carga su contenido real en el editor
- [ ] Navegar a `/project/ID_INEXISTENTE` redirige automáticamente a `/app`
- [ ] El título del documento aparece correctamente en el `EditorHeader`
- [ ] La compilación inicial usa el contenido guardado (no `DEFAULT_CONTENT`)

---

### Tarea 3.2: Implementar auto-save y guardado manual en `EditorPage`

Agregar un segundo debounce timer de 2000ms que llama a `documentService.saveContent()` después del último keystroke. El botón "Guardar" dispara el guardado inmediato. Exponer un signal `saveStatus` ('guardado' | 'guardando...' | 'sin guardar') para feedback visual.

```typescript
// Agregar en editor-page.ts

private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Estado de guardado — mostrado en el header. */
readonly saveStatus = signal<'guardado' | 'guardando' | 'sin-guardar'>('guardado');

onContentChange(source: string): void {
  this.content.set(source);
  this.saveStatus.set('sin-guardar');

  // Debounce compilación (150ms — existente)
  if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
  this.compiling.set(true);
  this.debounceTimer = setTimeout(() => {
    this.debounceTimer = null;
    this.triggerCompile(source);
  }, 150);

  // Debounce auto-save (2000ms — nuevo)
  if (this.autoSaveTimer !== null) clearTimeout(this.autoSaveTimer);
  this.autoSaveTimer = setTimeout(() => {
    this.autoSaveTimer = null;
    this.saveDocument();
  }, 2000);
}

saveDocument(): void {
  this.saveStatus.set('guardando');
  this.documentService.saveContent(this.documentId, this.content());
  this.saveStatus.set('guardado');
}

override ngOnDestroy(): void {
  if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
  if (this.autoSaveTimer !== null) clearTimeout(this.autoSaveTimer);
}
```

**Criterios de Aceptación:**

- [ ] Escribir en el editor y esperar 2s → el contenido aparece en LocalStorage
- [ ] Al recargar la página del editor, el contenido escrito previamente se restaura
- [ ] Al volver al home, la tarjeta del documento muestra el `updatedAt` actualizado
- [ ] El botón "Guardar" en EditorHeader guarda inmediatamente (sin esperar 2s)
- [ ] `saveStatus` cambia a 'guardando' durante el guardado y 'guardado' al terminar
- [ ] `npm run build` → 0 errores

---

## 🚀 Día 4: AiService + Integración Claude API en ChatPanel

### Estado Actual

- ✅ `ChatPanel` tiene interfaz `ChatMessage { role, text }` y signal `messages`
- ✅ `ChatPanel` tiene método `send()` con placeholder hardcoded
- ✅ `ChatPanel` tiene `draft` signal, `onKeydown()`, `updateDraft()`
- ❌ No existe `src/app/core/service/ai/ai.service.ts`
- ❌ `send()` no llama a ninguna API — solo agrega mensaje hardcoded
- ❌ No hay streaming de respuesta
- ❌ No hay botón "Insertar en editor" ni output hacia `EditorPage`

> **Nota para agentes:** La API key de Anthropic **nunca** debe hardcodearse. Usar `environment.ts` / `environment.prod.ts` con la variable `anthropicApiKey`. El `AiService` hace la llamada HTTP directamente desde el browser usando `fetch` con streaming (`ReadableStream`). El system prompt debe ser específico para generar contenido Typst válido. `ChatPanel` necesita un output `insertContent: OutputEmitterRef<string>` para que `EditorPage` pueda insertar la respuesta en el `EditorPanel`. Revisar cómo `EditorPanel` expone actualmente su contenido antes de implementar el insert.

### Estado Objetivo

- ✅ `src/app/core/service/ai/ai.service.ts` creado con método `chat()` streaming
- ✅ `ChatPanel` inyecta `AiService` y llama a `chat()` en `send()`
- ✅ La respuesta del asistente se muestra en streaming (token a token)
- ✅ Output `insertContent` emite el último mensaje del asistente
- ✅ `EditorPage` escucha `insertContent` y lo agrega al final del contenido del editor
- ✅ `src/environments/environment.ts` tiene `anthropicApiKey` con placeholder

---

### Tarea 4.1: Crear `src/environments/environment.ts` con API key placeholder

Crear los archivos de environment para manejar configuración por entorno. La API key nunca debe estar en el código fuente — el placeholder `'REEMPLAZAR_CON_TU_API_KEY'` sirve como documentación.

```typescript
// src/environments/environment.ts
export const environment = {
  production: false,
  anthropicApiKey: 'REEMPLAZAR_CON_TU_API_KEY',
};

// src/environments/environment.prod.ts
export const environment = {
  production: true,
  anthropicApiKey: '', // proveer via variable de entorno en build
};
```

**Criterios de Aceptación:**

- [ ] `environment.ts` y `environment.prod.ts` existen con estructura correcta
- [ ] `anthropicApiKey` no contiene una key real (solo placeholder)
- [ ] El archivo está listado en `.gitignore` o en comentario para producción

---

### Tarea 4.2: Crear `src/app/core/service/ai/ai.service.ts`

Servicio que encapsula la llamada a la API de Claude con soporte de streaming via `ReadableStream`. El método `chat()` acepta el historial de mensajes y devuelve un `AsyncIterable<string>` para mostrar tokens progresivamente en el template.

```typescript
import { Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `Eres un asistente especializado en Typst, un lenguaje de marcado para documentos científicos y técnicos.
Cuando el usuario te pida contenido, responde SIEMPRE con bloques Typst válidos y bien formateados.
Usa la sintaxis correcta de Typst: encabezados con =, listas con -, ecuaciones con $ ... $, código con \`\`\`.
Responde en el mismo idioma que el usuario. Sé conciso y directo.`;

@Injectable()
export class AiService {
  async *chat(messages: AiMessage[]): AsyncIterable<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': environment.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'messages-2023-12-15',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        stream: true,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Error de API: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed?.delta?.text ?? parsed?.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch {
            // línea SSE incompleta — ignorar
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export function provideAiService() {
  return { provide: AiService, useClass: AiService };
}
```

**Criterios de Aceptación:**

- [ ] `AiService` compila sin errores
- [ ] `chat()` es un `AsyncIterable<string>` — emite tokens progresivos
- [ ] El error HTTP se propaga como excepción catcheable desde el caller
- [ ] La API key se lee de `environment.anthropicApiKey` (no hardcoded)
- [ ] `provideAiService()` registrado en `app.config.ts`

---

### Tarea 4.3: Conectar `ChatPanel` al `AiService` con streaming

Reemplazar el `send()` placeholder por una llamada real al `AiService`. Durante el streaming, cada token se concatena al último mensaje del asistente, dando efecto de escritura progresiva. Agregar output `insertContent` para que `EditorPage` pueda insertar la respuesta.

```typescript
// Cambios en chat-panel.ts

import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { AiService, type AiMessage } from '../../../../core/service/ai/ai.service';

export class ChatPanel {
  private readonly aiService = inject(AiService);

  /** Emite el texto del último mensaje del asistente para insertar en el editor. */
  readonly insertContent = output<string>();

  readonly isLoading = signal(false);

  async send(): Promise<void> {
    const text = this.draft().trim();
    if (!text || this.isLoading()) return;

    // Agregar mensaje del usuario
    this.messages.update((msgs) => [...msgs, { role: 'user', text }]);
    this.draft.set('');
    this.isLoading.set(true);

    // Placeholder para respuesta en streaming
    this.messages.update((msgs) => [...msgs, { role: 'assistant', text: '' }]);

    try {
      const history: AiMessage[] = this.messages()
        .slice(0, -1) // excluir el placeholder vacío
        .map((m) => ({ role: m.role, content: m.text }));

      let fullResponse = '';
      for await (const token of this.aiService.chat(history)) {
        fullResponse += token;
        this.messages.update((msgs) => {
          const updated = [...msgs];
          updated[updated.length - 1] = { role: 'assistant', text: fullResponse };
          return updated;
        });
      }
    } catch (err) {
      this.messages.update((msgs) => {
        const updated = [...msgs];
        updated[updated.length - 1] = {
          role: 'assistant',
          text: 'Error al conectar con la IA. Verifica tu API key.',
        };
        return updated;
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  insertLastResponse(): void {
    const msgs = this.messages();
    const last = msgs.findLast((m) => m.role === 'assistant');
    if (last?.text) this.insertContent.emit(last.text);
  }
}
```

**Criterios de Aceptación:**

- [ ] Al enviar un mensaje, la respuesta del asistente aparece token a token en la UI
- [ ] El botón "Insertar en editor" emite el último mensaje del asistente
- [ ] `isLoading` deshabilita el botón de envío mientras la IA responde
- [ ] Un error de red/API muestra mensaje de error en el chat (no rompe la app)
- [ ] `EditorPage` recibe el evento `insertContent` y lo concatena al `content` signal

---

## 🚀 Día 5: FilesSidebar Multi-Archivo + UX Español

### Estado Actual

- ✅ `FilesSidebar` tiene UI estática con un solo archivo "main.typ"
- ✅ `FilesSidebar` tiene interfaz `ProjectFile { name, active }`
- ❌ No hay inputs/outputs en `FilesSidebar` — datos completamente internos
- ❌ No hay modelo de múltiples archivos por documento en `DocumentService`
- ❌ UI mezcla español e inglés: "Open", "Rename", "Delete" en menú de tarjetas

> **Nota para agentes:** Leer `src/app/features/editor/components/files-sidebar/files-sidebar.ts` y `src/app/shared/components/document-list/document-list.ts` antes de modificar. Para la UX en español, el cambio está en el template `document-list.html` — cambiar literales "Open" → "Abrir", "Rename" → "Renombrar", "Delete" → "Eliminar". Mantener los IDs de los items del dropdown sin cambio (son usados como claves, no mostrados).

### Estado Objetivo

- ✅ `DocumentService` agrega campo `files: ProjectFile[]` a la interfaz `Document`
- ✅ `FilesSidebar` tiene inputs `files` y `activeFile` + outputs `fileSelect`, `fileCreate`, `fileDelete`
- ✅ `EditorPage` pasa los archivos del documento activo a `FilesSidebar`
- ✅ Al seleccionar un archivo en el sidebar, el contenido del editor cambia
- ✅ Labels del menú de tarjetas unificados en español ("Abrir", "Renombrar", "Eliminar")

---

### Tarea 5.1: Extender `DocumentService` con soporte multi-archivo

Agregar `files: ProjectFile[]` a la interfaz `Document`. Cada documento empieza con un archivo `main.typ` por defecto. Agregar métodos `addFile()` y `deleteFile()` al servicio.

```typescript
// Cambios en document.service.ts

export interface ProjectFile {
  name: string;
  content: string;
}

export interface Document extends DocumentItem {
  content: string; // contenido del archivo activo (compatibilidad hacia atrás)
  files: ProjectFile[];
  activeFile: string; // nombre del archivo activo
}

// En create():
const doc: Document = {
  // ...
  files: [{ name: 'main.typ', content: '= Sin título\n\nEscribe tu contenido Typst aquí.\n' }],
  activeFile: 'main.typ',
};

// Nuevos métodos:
addFile(docId: string, name: string): void { /* ... */ }
deleteFile(docId: string, name: string): void { /* no borrar si es el único archivo */ }
switchFile(docId: string, name: string): void { /* actualiza activeFile */ }
```

**Criterios de Aceptación:**

- [ ] Documentos nuevos se crean con `files: [{ name: 'main.typ', ... }]`
- [ ] `addFile()` agrega un nuevo archivo con contenido vacío
- [ ] `deleteFile()` no elimina el archivo si es el único del proyecto
- [ ] `switchFile()` actualiza `activeFile` y persiste en LocalStorage

---

### Tarea 5.2: Refactorizar `FilesSidebar` con inputs/outputs reales

Convertir `FilesSidebar` de componente auto-contenido a presentational component con inputs tipados y outputs. Recibe `files` y `activeFile` desde `EditorPage`; emite `fileSelect`, `fileCreate`, `fileDelete`.

```typescript
// Nuevo files-sidebar.ts

import { input, output } from '@angular/core';
import type { ProjectFile } from '../../../../core/service/document/document.service';

export class FilesSidebar {
  readonly files      = input<ProjectFile[]>([]);
  readonly activeFile = input<string>('main.typ');

  readonly fileSelect = output<string>(); // nombre del archivo
  readonly fileCreate = output<void>();
  readonly fileDelete = output<string>(); // nombre del archivo
}
```

**Criterios de Aceptación:**

- [ ] `FilesSidebar` muestra la lista real de archivos del documento
- [ ] El archivo activo tiene indicador visual (fondo destacado)
- [ ] Hacer clic en un archivo emite `fileSelect` con su nombre
- [ ] El botón "+" emite `fileCreate`
- [ ] El ícono de borrar emite `fileDelete` (oculto si es el único archivo)

---

### Tarea 5.3: Unificar UI en español en `DocumentList`

Actualizar las etiquetas del menú contextual de tarjetas de inglés a español. El cambio es solo en `document-list.html` — los IDs del dropdown no cambian.

```html
<!-- En document-list.html — items del menú de tarjeta -->
<!-- Cambiar: 'Open' → 'Abrir', 'Rename' → 'Renombrar', 'Delete' → 'Eliminar' -->
```

```typescript
// En document-list.ts — actualizar el array de menuItems
private readonly menuItems = [
  { id: 'open',   label: 'Abrir',     icon: ExternalLink },
  { id: 'rename', label: 'Renombrar', icon: Pencil },
  { id: 'delete', label: 'Eliminar',  icon: Trash2, variant: 'danger' },
];
```

**Criterios de Aceptación:**

- [ ] El menú contextual de tarjetas muestra "Abrir", "Renombrar", "Eliminar"
- [ ] Los IDs de los items no cambian (siguen siendo 'open', 'rename', 'delete')
- [ ] Sin regresiones visuales en el menú

---

## 🚀 Día 6: E2E Polish + Validación

### Verificaciones técnicas

```bash
# Desde la raíz del proyecto
npm run build
npx tsc --noEmit
npm test
```

### Script de validación manual

1. **Home vacío:** Abrir la app en modo incógnito → debe mostrar "No tienes documentos aún" en español
2. **Crear documento:** Hacer clic en "Crear Documento" → debe navegar al editor con un nuevo documento "Sin título"
3. **Escribir y auto-save:** Escribir en el editor → esperar 2s → recargar la página → el contenido debe persistir
4. **Guardar manual:** Hacer clic en "Guardar" → volver al home → la tarjeta debe mostrar `updatedAt` actualizado
5. **Renombrar:** En el home, abrir menú de tarjeta → "Renombrar" → ingresar nuevo nombre → confirmar → la tarjeta debe mostrar el nuevo nombre
6. **Eliminar:** En el home, abrir menú de tarjeta → "Eliminar" → confirmar → la tarjeta debe desaparecer
7. **Búsqueda:** Con 2+ documentos, buscar por título → solo deben aparecer los que coinciden
8. **Chat con IA:** En el editor, abrir ChatPanel → enviar un mensaje → la respuesta debe aparecer en streaming
9. **Insertar en editor:** Hacer clic en "Insertar en editor" → el contenido del último mensaje del asistente debe aparecer al final del editor
10. **Multi-archivo:** En el editor, hacer clic en "+" en FilesSidebar → debe agregar un nuevo archivo → al seleccionarlo, el editor debe limpiar o cargar su contenido
11. **Dark mode:** Alternar dark/light mode → el editor y el home deben cambiar de tema correctamente
12. **URL inválida:** Navegar a `/project/ID_QUE_NO_EXISTE` → debe redirigir automáticamente al home

### Deuda técnica a documentar (no bloquea merge)

- [ ] Agregar `prompt()` y `confirm()` nativos → reemplazar por modales propios en Semana 2
- [ ] Tests unitarios para `DocumentService` (persistencia, CRUD, deserialización de fechas)
- [ ] Tests para `AiService` (mock de fetch, manejo de errores)
- [ ] Manejo de errores de `FilesSidebar` cuando el documento tiene files corruptos en LS

---

**Versión del Documento:** 1.0
**Última actualización:** 2026-03-15
**Formato:** AI Agent Execution Plan v2.0
