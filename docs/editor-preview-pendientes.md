# Editor & Preview — Mejoras Pendientes

> Scope: `src/app/features/editor/` y `src/app/core/service/compiler/`
> Última revisión: 2026-03-16

---

## Completadas recientemente

| Mejora | Archivos |
|--------|---------|
| Cancelación de resultados stale en el worker (`latestRequestId`) | `compiler.worker.ts` |
| Transferable ArrayBuffer (zero-copy worker → main) | `compiler.worker.ts` |
| CompilerService scoped al EditorPage (worker lazy) | `compiler-service.ts`, `editor-page.ts` |
| Tema dinámico en CodeMirror (Compartment + ThemeService) | `editor-panel.ts` |
| `setContent()` imperativo — elimina el hack `isReady` toggle | `editor-panel.ts`, `editor-page.ts` |
| `renderVersion` en PreviewPanel (reemplaza AbortController) | `preview-panel.ts` |
| `compileError` signal con feedback visual en barra del preview | `editor-page.ts`, `editor-page.html` |
| Migración a `TypstCompilerBuilder` con carga de fuentes | `compiler.worker.ts` |

---

## En progreso / bloqueadas

### [BLOQ] Syntax highlighting de Typst en CodeMirror

**Paquete:** `codemirror-lang-typst@0.4.0`
**Estado:** desinstalado — importa su WASM con la ESM integration proposal (`import * as wasm from "...wasm"`) que el dev server de Angular no soporta sin `vite-plugin-wasm`.

**Para desbloquearlo:**
1. Instalar `vite-plugin-wasm` y `vite-plugin-top-level-await`
2. Configurar el plugin en el builder de Angular (requiere exponer el Vite config — explorar `@analogjs/vite-plugin-angular` o la opción `plugins` de `@angular/build:application` si ya está disponible en v21)
3. Reinstalar `codemirror-lang-typst` y añadir `typst()` en `buildExtensions()` de `EditorPanel`

---

## Pendientes priorizadas

### [P1] Error de compilación con detalles de línea/columna

**Problema actual:** cuando Typst falla, se muestra el mensaje crudo del compilador WASM en la barra del preview. Suele ser verboso y difícil de leer.

**Mejora:** parsear el mensaje de error para extraer línea y columna, mostrar un panel colapsable con el detalle, y subrayar la línea problemática en CodeMirror usando la [diagnostic API](https://codemirror.net/docs/ref/#lint) (`setDiagnostics`).

**Archivos:** `compiler.worker.ts`, `editor-page.ts`, `editor-panel.ts`

---

### [P1] Scroll sincronizado editor ↔ preview

**Problema actual:** editor y preview son paneles independientes; no hay relación entre la posición del cursor en el editor y la página visible en el preview.

**Mejora:** al mover el cursor en CodeMirror, calcular el número de línea aproximado y hacer scroll en el preview a la página correspondiente (mapping línea → página via metadatos del vector data). Implementación en dos fases:
1. Scroll por página (aproximación gruesa, inmediata)
2. Scroll por elemento si el compilador expone source maps

---

### [P2] Modo solo-editor / solo-preview

**Problema actual:** el resize tiene límites `MIN 20% / MAX 80%` pero no hay acceso rápido a pantalla completa de un solo panel.

**Mejora:** doble clic en el drag handle (o botones en la cabecera de cada panel) para colapsar el panel opuesto al 0% / 100%. El estado debería persistir en `localStorage`.

---

### [P2] Renderizado diferencial del preview

**Problema actual:** `$typst.canvas()` destruye y recrea todos los `<canvas>` en cada compilación, incluso si solo cambió una página.

**Mejora:** explorar si `@myriaddreamin/typst.ts` expone una API de renderizado incremental o por página. Si no, implementar un diff manual: comparar el número de páginas entre renders y solo actualizar los canvas cuyo contenido cambió (checksum del vector slice por página).

---

### [P2] Soporte touch / resize en móvil

**Problema actual:** `startResize()` solo escucha eventos `MouseEvent` — en pantallas táctiles el resize handle no funciona.

**Mejora:** añadir listeners `touchstart` / `touchmove` / `touchend` paralelos al resize handler en `editor-page.ts`.

---

### [P3] Persistencia del ancho del panel

**Problema actual:** `editorWidthPct` se reinicia a `50%` en cada visita al editor.

**Mejora:** leer/escribir el valor en `localStorage` con la key `typs_editor_width`. Un par de líneas en `editor-page.ts`.

---

### [P3] Tema del preview según el tema de la app

**Problema actual:** `backgroundColor: '#ffffff'` en `PreviewPanel.render()` está hardcodeado — el fondo del documento siempre es blanco aunque la app esté en dark mode.

**Mejora:** inyectar `ThemeService` en `PreviewPanel` y pasar `backgroundColor: isDark ? '#1e1e1e' : '#ffffff'` al llamar `$typst.canvas()`.

---

### [P3] Indicador de progreso de carga del WASM

**Problema actual:** la primera compilación tarda varios segundos (carga del WASM) sin ningún feedback visual más allá del spinner de "Compilando".

**Mejora:** exponer un evento `compilerReady` desde `CompilerService` (un `Promise` o signal) para mostrar un estado "Iniciando compilador…" diferenciado del spinner de compilación normal.

---

## Pendiente de acción del usuario

### Fuentes — archivos a colocar en `public/assets/fonts/`

El worker ya está preparado para cargarlas. El usuario debe descargar los archivos del repo de Typst (`https://github.com/typst/typst/tree/main/assets/fonts`) y colocarlos en esa carpeta. Los archivos esperados son exactamente los listados en `BUNDLED_FONTS` dentro de `compiler.worker.ts`. Cualquier archivo faltante se omite en silencio.

---

## Descartadas / no aplican

| Idea | Motivo |
|------|--------|
| Cancelación real de WASM mid-compile | WASM corre en un único hilo; no hay API para interrumpir la compilación a mitad de ejecución |
| AbortController en `$typst.canvas()` | La librería no acepta `AbortSignal` — resuelto con `renderVersion` counter |
