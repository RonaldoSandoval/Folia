# Exportación de documentos

Documentación del sistema de exportación (PDF, SVG, PNG): arquitectura, problemas encontrados,
decisiones técnicas y limitaciones conocidas.

---

## Formatos disponibles

| Formato | Implementación | Observaciones |
|---------|---------------|---------------|
| PDF | Worker WASM (`exportPdf`) | Sin diálogo — descarga directa |
| PNG | DOM canvas (sin WASM) | Por página o ZIP de todas |
| SVG | Renderer WASM (instancia dedicada) | Por página o ZIP de todas |

---

## El bug original: pánico en WASM al exportar SVG/PNG

### Síntoma

Al intentar descargar SVG o PNG en ciertos documentos, el compilador WASM lanzaba un
pánico de Rust en la consola del navegador:

```
panicked at packages/renderer/src/render/canvas.rs:30:22
```

### Causa raíz

El renderizador Typst WASM tiene una restricción de **préstamo único** a nivel de Rust
(borrow checker): solo puede haber un acceso activo a la sesión de render a la vez.

El código anterior usaba `withGlobalRenderer` — un singleton compartido entre:
- `PreviewPanel.render()` → se llama cada vez que llega un nuevo `vectorData`.
- La función de exportación → llamada al hacer clic en descargar.

Si la exportación se disparaba mientras el preview estaba renderizando (o viceversa),
ambos intentaban acceder al mismo objeto renderer simultáneamente, causando el pánico.

### Por qué `withGlobalRenderer` fue un problema de diseño

`withGlobalRenderer` es una utilidad de `@myriaddreamin/typst.ts` que devuelve la instancia
global del renderer. Es conveniente para el caso de uso normal (renderizar una preview), pero
al ser global e irrecurrible, hace imposible tener dos operaciones concurrentes de render.

---

## Solución: dos estrategias según el formato

### PNG — usar los canvases del DOM (sin WASM)

Cuando Typst renderiza el preview, el resultado ya está pintado en elementos `<canvas>` en
el DOM (uno por página). Para exportar PNG simplemente se leen esos canvases con
`canvas.toBlob('image/png')`.

**Ventajas:**
- Cero riesgo de conflicto con el renderer global.
- Instantáneo — no hay que re-compilar ni re-renderizar.
- La resolución es la misma que ve el usuario en el preview.

**Limitaciones:**
- La resolución está limitada por el tamaño del canvas en el DOM (que depende del zoom
  del preview). No es posible generar un PNG a mayor resolución sin re-renderizar.
- Si el usuario tiene scroll (páginas fuera de la ventana), esas páginas pueden no estar
  pintadas. Sin embargo, `PreviewPanel.capturePageAt()` obtiene los elementos directamente
  del DOM sin requerir scroll.

**Implementación:**
```typescript
// PreviewPanel.capturePageAt(pageIndex): obtiene el canvas en índice 0-based
// PreviewPanel.captureAllPages(): concatena todos los canvases verticalmente en uno solo
```

### SVG — instancia dedicada del renderer

Para SVG no existe un equivalente en DOM — el vector se debe convertir vía WASM.
Se crea una instancia **nueva e independiente** con `createTypstRenderer()` en lugar
de usar el singleton global:

```typescript
const renderer = createTypstRenderer();
await renderer.init({ getModule: () => RENDERER_WASM_URL });
// usar renderer.renderSvg(...)
// liberar la instancia al terminar
```

Esto elimina el conflicto: el renderer de la preview sigue siendo el global, y el de
la exportación es una instancia privada de vida corta.

**Limitación conocida:** `RenderSvgOptions` no tiene un parámetro `pageOffset` o
`pageIndex`. Solo acepta `window: Rect` (coordenadas en el espacio del documento completo).
Para exportar una página específica hay que calcular manualmente su ventana:

```typescript
// Acumular la altura de las páginas anteriores con retrievePagesInfoFromSession()
let cumY = 0;
for (let i = 0; i < targetPage; i++) {
  cumY += pages[i].height;
}
const window = { x: 0, y: cumY, width: pages[targetPage].width, height: pages[targetPage].height };
await renderer.renderSvg({ window, ... });
```

---

## ExportDialog — selección de página

Para PNG y SVG se muestra un diálogo antes de descargar. El usuario elige:

- **Página específica** (input numérico 1–N, clampeado al rango válido).
- **Todas las páginas** → genera un archivo ZIP.

**Archivo:** `src/app/features/editor/components/export-dialog/`

El diálogo recibe `[format]` y `[pageCount]` como inputs y emite `(confirm)` con
`ExportSelection = { page: number | 'all' }`.

PDF no usa este diálogo — descarga directamente porque Typst genera el PDF completo
de forma nativa (incluye todas las páginas en un solo archivo).

---

## Generación de ZIP

Cuando el usuario selecciona "Todas las páginas", se genera un ZIP con un archivo por
página (ej. `pagina-1.png`, `pagina-2.png`).

Se usa `fflate` (ya en el bundle de la app como dependencia transitiva de Yjs):

```typescript
import { zipSync, strToU8 } from 'fflate';

const files: Record<string, Uint8Array> = {};
for (let i = 0; i < pageCount; i++) {
  files[`pagina-${i + 1}.png`] = pngBytes;
}
const zipData = zipSync(files);
// ⚠️ fflate devuelve Uint8Array<ArrayBufferLike>, no BlobPart directamente
const blob = new Blob([zipData.buffer as ArrayBuffer], { type: 'application/zip' });
```

### Gotcha: `Uint8Array<ArrayBufferLike>` no es `BlobPart`

TypeScript rechaza asignar `Uint8Array<ArrayBufferLike>` (el tipo de retorno de `zipSync`)
directamente a `BlobPart[]`. La solución es extraer el buffer subyacente con `.buffer` y
castearlo a `ArrayBuffer`:

```typescript
// ❌ Error TS2322
new Blob([zipData], { type: 'application/zip' });

// ✅ Correcto
new Blob([zipData.buffer as ArrayBuffer], { type: 'application/zip' });
```

---

## Flujo completo de exportación

```
Usuario hace clic en "Descargar PDF/SVG/PNG"
  │
  ├─ PDF → exportPdf() en worker → descarga directa
  │
  └─ SVG/PNG → ExportDialog abierto (format, pageCount)
                │
                ├─ Página específica
                │   ├─ PNG → capturePageAt(n-1) → Blob → descarga
                │   └─ SVG → renderer dedicado + window:Rect → SVG string → descarga
                │
                └─ Todas las páginas
                    ├─ PNG → captureAllPages() ó capturePageAt × N → zipSync → descarga ZIP
                    └─ SVG → renderSvg × N (con cumY) → zipSync → descarga ZIP
```

---

## Consideraciones de UX

- **El diálogo solo aparece para SVG/PNG.** PDF no lo necesita (siempre es el documento completo).
- **El número de página se clampea** al rango [1, pageCount] para evitar estados inválidos.
- **El ZIP usa nombres legibles** (`pagina-1.png`) en lugar de índices 0-based para el usuario.
- **El nombre del archivo de descarga** incluye el nombre del documento cuando está disponible.

---

## Limitaciones conocidas

| Limitación | Motivo | Posible solución futura |
|-----------|--------|------------------------|
| PNG a baja resolución | Canvas limitado por el DOM | Re-renderizar con scale factor |
| SVG sin `pageIndex` nativo | API de `RenderSvgOptions` no expone offset por página | Abrir issue en `@myriaddreamin/typst.ts` |
| ZIP generado en el hilo principal | `zipSync` es síncrono y bloquea brevemente | Mover a Web Worker con `fflate` async API |
| Páginas fuera del viewport en PNG | Canvas puede estar vacío si nunca se pintó | Forzar renderizado previo al exportar |
