# Typst Compiler Diagnostics

Documentación completa del sistema de diagnósticos del compilador Typst: investigación previa,
limitaciones descubiertas durante la implementación, decisiones técnicas y arquitectura final.

---

## Contexto y motivación

Antes de esta implementación, cuando el documento tenía un error de compilación, el worker
lanzaba una excepción cuyo mensaje era un string crudo (ej. `"Compilation failed"`). El usuario
no sabía en qué línea ni en qué archivo estaba el problema. Era necesario mostrar errores
estructurados, ubicados en el código fuente.

---

## API del compilador WASM

El paquete `@myriaddreamin/typst.ts` expone dos niveles de acceso al compilador:

### Nivel alto: `$typst` (`TypstSnippet`)

El objeto global con el que se interactúa normalmente. Tiene métodos como `$typst.vector()`,
`$typst.addSource()`, `$typst.getCompiler()`, etc.

**Importante:** `$typst.vector()` en `TypstSnippet` devuelve `Uint8Array | undefined` directamente,
**no** un objeto `{ result, diagnostics }`. Intentar acceder a `.diagnostics` desde este nivel
no funciona — el wrapper de `TypstSnippet` aplana el resultado.

### Nivel bajo: `TypstCompiler` (el compilador subyacente)

Se obtiene con `await $typst.getCompiler()`. Este expone el método `compile()` directamente,
que sí devuelve el objeto completo con `result` y `diagnostics`.

```typescript
const compiler = await $typst.getCompiler();
const compileResult = await compiler.compile({
  mainFilePath: '/main.typ',
  root:         '/',
  format:       0,           // CompileFormatEnum.vector (ver nota abajo)
  diagnostics:  'full',      // 'none' | 'unix' | 'full'
});
// compileResult.result      → Uint8Array | undefined
// compileResult.diagnostics → DiagnosticMessage[]
```

---

## Limitaciones de la API pública

Dos constantes/tipos que la documentación interna usa **no están re-exportados** desde el
entry point del paquete (`@myriaddreamin/typst.ts`):

| Símbolo | Problema | Solución |
|---------|----------|----------|
| `CompileFormatEnum` | Declarado en sub-módulo, no re-exportado | Usar literal `0` con comentario explicativo |
| `DiagnosticMessage` | Interface interna, no exportada como tipo público | Redeclarar localmente en el worker |

---

## Estructura del dato `DiagnosticMessage`

```typescript
interface DiagnosticMessage {
  package:  string;  // "" si es archivo local; "cetz:0.2.0" si es paquete externo
  path:     string;  // "main.typ", "lib.typ", etc.
  severity: string;  // "error" | "warning"
  range:    string;  // "startLine:startCol-endLine:endCol"  (ej: "2:9-3:15")
  message:  string;  // Descripción legible del error
}
```

### Convención del campo `range`

- Las **líneas** son **1-based** (la primera línea es `1`).
- Las **columnas** son **0-based** (offset de bytes desde el inicio de la línea).
- Formato: `"startLine:startCol-endLine:endCol"`.
- Para convertir a offsets de CodeMirror: `doc.line(startLine).from + startCol`.

### Diagnósticos de paquetes externos

Cuando `package !== ""`, el error proviene de un paquete `@preview/...`, no del código
del usuario. Estos diagnósticos se **filtran** en la UI (gutter y subrayados) porque:
- El rango no es útil para el usuario (apunta a código dentro del paquete, no accesible).
- Mostraría marcadores en líneas del documento del usuario que no tienen relación real.

Se muestran igualmente en el panel de diagnósticos para que el usuario tenga la información
completa del error.

---

## Comportamiento en éxito vs. error

| Situación | `result` | `diagnostics` |
|-----------|----------|---------------|
| Compiló sin problemas | `Uint8Array` | `[]` |
| Compiló con advertencias | `Uint8Array` | `[...warnings]` |
| Falló (errores) | `undefined` | `[...errors]` |

Esto permite mantener la preview del documento anterior mientras se muestran los errores,
porque el worker solo actualiza `lastVectorData` cuando `compileResult.result` existe.

---

## Arquitectura implementada

### 1. `compiler.worker.ts`

- Usa `$typst.getCompiler()` para obtener el `TypstCompiler` subyacente.
- Llama a `compiler.compile({ format: 0, diagnostics: 'full' })`.
- Si `result` es `undefined` → envía mensaje `type: 'error'` con los diagnósticos.
- Si `result` existe → envía `type: 'success'` con `vectorData` y `diagnostics` (puede incluir advertencias).
- El resultado cacheado (cuando el fingerprint no cambia) envía `diagnostics: []`.

### 2. `compiler-service.ts`

- `CompileResult` = `{ vectorData: Uint8Array; diagnostics: DiagnosticMessage[] }`.
- `CompileError extends Error` lleva `diagnostics: DiagnosticMessage[]` para que el llamador
  pueda distinguir entre "error de infraestructura" y "error de compilación con diagnósticos".
- `compile()` resuelve con `CompileResult` (éxito + advertencias) o rechaza con `CompileError` (errores).

### 3. `editor-page.ts`

- `compileError = signal<DiagnosticMessage[] | null>(null)`.
- En éxito: `compileError.set(warnings.length > 0 ? warnings : null)`.
- En `CompileError`: `compileError.set(err.diagnostics)`.
- `diagHasErrors(diags)` distingue errores de advertencias para colorear la UI.
- `diagRangeStart(range)` extrae `"5:1"` de `"5:1-5:10"` para mostrar la ubicación en el panel.
- `jumpToDiagnostic(diag)` parsea el range y llama a `editorPanel().jumpToPosition(line, col)`.

### 4. `editor-panel.ts` — Integración con CodeMirror 6

Se definen a **nivel de módulo** (no dentro de la clase) para que sean constantes compartidas:

#### StateEffect + StateField

```typescript
const setDiagnosticsEffect = StateEffect.define<DiagnosticMessage[]>();

const diagnosticsField = StateField.define<DiagnosticMessage[]>({
  create: () => [],
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setDiagnosticsEffect)) return e.value;
    }
    return value;
  },
});
```

La clase Angular tiene un `effect()` que despacha `setDiagnosticsEffect` cada vez que
cambia el input `diagnostics`. Esto conecta el sistema de señales de Angular con el
sistema de efectos de CodeMirror de forma reactiva.

#### Marcadores de gutter (`diagnosticGutter`)

Un `gutter()` que lee `diagnosticsField` y coloca un `GutterMarker` (punto de 6px) en cada
línea que tiene al menos un diagnóstico. Si una línea tiene error y advertencia, el error
tiene prioridad (punto rojo > punto ámbar).

#### Subrayados ondulados (`diagnosticUnderlines`)

Un `ViewPlugin` con `Decoration.mark()` que aplica clases CSS `.cm-diag-error` y
`.cm-diag-warning` sobre los rangos exactos reportados por el compilador. Se recalcula
cuando el documento cambia o cuando el StateField cambia.

```css
.cm-diag-error   { text-decoration: underline wavy #ef4444; }
.cm-diag-warning { text-decoration: underline wavy #f59e0b; }
```

#### `jumpToPosition(line, col)`

Método público de `EditorPanel` que recibe coordenadas 1-based line / 0-based col
y despacha un cambio de selección + scroll. Llamado desde el panel de diagnósticos
cuando el usuario hace clic en una fila.

---

## UI — Panel de diagnósticos

El panel es un overlay absoluto (`absolute top-8 inset-x-0`) que aparece debajo de la
barra del preview. Decisiones de diseño:

- **Fondo neutro** (`bg-surface`): no se usa rojo/ámbar de fondo para evitar generar
  ansiedad visual en el usuario. El color es información, no alarma.
- **Solo el punto** lleva color (rojo para error, ámbar para advertencia).
- **Texto en colores del sistema** (`text-foreground`, `text-muted`): legible en modo
  claro y oscuro sin hardcodear colores.
- **Clic en fila** → salta el cursor al error en el editor (via `jumpToDiagnostic`).
- **Errores de paquetes externos** se muestran en el panel pero sin marcador de gutter
  ni subrayado (no apuntan a código del usuario).

---

## Formatos de diagnósticos disponibles (referencia)

| Valor | Tipo retornado | Uso recomendado |
|-------|---------------|-----------------|
| `'none'` | — | Sin overhead, no usar si se necesita feedback |
| `'unix'` | `string` | Logging en consola, scripts CI |
| `'full'` | `DiagnosticMessage[]` | UI interactiva — el que usamos |
