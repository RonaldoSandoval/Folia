# Integración del compilador Typst WASM (`@myriaddreamin/typst.ts`)

Guía de todo lo aprendido durante la integración del compilador Typst en el Web Worker.
Cubre fuentes, imágenes, paquetes de Typst Universe, y los errores que encontramos.

---

## 1. Arquitectura general

```
EditorPage
  └── CompilerService  (Angular service, providedIn: component)
        └── Web Worker  (compiler.worker.ts)
              └── $typst  (TypstSnippet singleton, @myriaddreamin/typst.ts)
                    └── WASM  (/assets/typst_ts_web_compiler_bg.wasm)
```

El compilador vive en un Web Worker para no bloquear el hilo principal.
`CompilerService` es el puente: envía mensajes `compile | add-file | remove-file` y devuelve `vectorData: Uint8Array`.

---

## 2. El singleton `$typst` (TypstSnippet)

`$typst` es una instancia de `TypstSnippet` exportada como singleton desde `@myriaddreamin/typst.ts`.
Expone una API de alto nivel sobre el compilador WASM.

```typescript
import { $typst, loadFonts } from '@myriaddreamin/typst.ts';
```

### Inicialización

```typescript
$typst.setCompilerInitOptions({
  getModule: () => '/assets/typst_ts_web_compiler_bg.wasm',
  beforeBuild: [
    loadFonts([], {
      assets: ['text'],
      assetUrlPrefix: '/assets/fonts/',
    }),
  ],
});
```

`setCompilerInitOptions` es **síncrono**: solo guarda las opciones.
El WASM se inicializa de forma lazy la primera vez que se llama a `$typst.vector()` o cualquier otro método de compilación.

### Patrón de inicialización única (en el worker)

```typescript
let initPromise: Promise<void> | null = null;

function getInitPromise(): Promise<void> {
  if (initPromise) return initPromise;
  try {
    $typst.setCompilerInitOptions({ ... });
  } catch (err) {
    return Promise.reject(err);   // no cachear el fallo
  }
  initPromise = Promise.resolve();
  return initPromise;
}
```

---

## 3. Fuentes

### Fuentes bundleadas de Typst

Typst incluye un conjunto de fuentes de texto en el repositorio `typst/typst-assets`.
Hay que descargarlas una sola vez con:

```bash
npm run fonts:download
```

Las fuentes van a `public/assets/fonts/`.
El script (`scripts/download-fonts.mjs`) las descarga desde:

```
https://cdn.jsdelivr.net/gh/typst/typst-assets@v0.13.1/files/fonts/
```

**Fuentes incluidas (17 archivos):**

| Familia | Archivos |
|---|---|
| DejaVuSansMono | Regular, Bold, Oblique, BoldOblique |
| NewCM10 | Regular, Bold, Italic, BoldItalic |
| NewCMMath | Regular, Book, Bold |
| LibertinusSerif | Regular, Bold, Italic, BoldItalic, Semibold, SemiboldItalic |

> **Ojo:** `NewCMSans10` y `NewCMMono10` **no existen** en el repo de assets. No intentar descargarlas.

### Carga de fuentes en `beforeBuild`

```typescript
loadFonts([], {
  assets: ['text'],          // carga las 17 fuentes de texto
  assetUrlPrefix: '/assets/fonts/',
})
```

Si no se especifica `assetUrlPrefix`, `loadFonts` intenta descargarlas desde jsDelivr.
Para producción/offline siempre usar el prefijo local.

---

## 4. Compilación

### API correcta para compilar

```typescript
// 1. Registrar el source en un path fijo
await $typst.addSource('/main.typ', content);

// 2. Compilar con root explícito
const vectorData = await $typst.vector({
  mainFilePath: '/main.typ',
  root: '/',
});
```

### Por qué NO usar `mainContent`

```typescript
// ❌ INCORRECTO — causa problemas con imágenes
const vectorData = await $typst.vector({ mainContent: content });
```

Cuando se usa `mainContent`, la librería crea el archivo fuente en `/tmp/{uuid}.typ`.
Esto hace que el **project root sea `/tmp/`**, y cualquier imagen registrada en `/` queda
fuera del root → error **"failed to load file (access denied)"**.

Con `addSource('/main.typ') + root: '/'` el project root queda en `/`, donde viven las imágenes.

---

## 5. Imágenes

### Registrar una imagen en el compilador

```typescript
// En compiler.worker.ts (message handler)
if (data.type === 'add-file') {
  await getInitPromise();
  await $typst.mapShadow(data.path, data.data);  // registra la imagen
  lastContent = '';                               // invalida el caché
  return;
}
```

### Eliminar una imagen

```typescript
if (data.type === 'remove-file') {
  await getInitPromise();
  await $typst.unmapShadow(data.path);
  lastContent = '';
  return;
}
```

### `mapShadow` vs `withAccessModel`

`mapShadow` / `unmapShadow` usan el **shadow filesystem interno del WASM** (`compiler.map_shadow`).
Son completamente independientes del `AccessModel` y no entran en conflicto con él.

### Flujo completo desde EditorPage

```typescript
onImageUpload(file: { name: string; data: Uint8Array }): void {
  const previewUrl = URL.createObjectURL(new Blob([file.data.buffer as ArrayBuffer]));

  // reemplazar si ya existe con el mismo nombre
  const existing = this.imageFiles().find(i => i.name === file.name);
  if (existing) URL.revokeObjectURL(existing.previewUrl);

  this.imageFiles.update(imgs => [
    ...imgs.filter(i => i.name !== file.name),
    { name: file.name, previewUrl, data: file.data },
  ]);

  this.compiler.addFile(`/${file.name}`, file.data);
  this.triggerCompile(this.content());
}
```

### Limpiar blob URLs al destruir el componente

```typescript
ngOnDestroy(): void {
  if (this.compileTimer !== null) clearTimeout(this.compileTimer);
  for (const img of this.imageFiles()) URL.revokeObjectURL(img.previewUrl);
}
```

### Usar la imagen en Typst

```typst
#image("mi-foto.jpg")
#image("logo.png", width: 50%)
```

El nombre debe coincidir exactamente con el registrado en `mapShadow`.

### Transferencia del buffer al worker

```typescript
// CompilerService.addFile
addFile(path: string, data: Uint8Array): void {
  this.worker.postMessage({ type: 'add-file', path, data }, [data.buffer]);
}
```

El `[data.buffer]` transfiere el `ArrayBuffer` (zero-copy). Después de esto,
`data` queda vacío en el hilo principal → hay que guardar una copia si se necesita más tarde
(como hace `EditorPage` con `imageFiles` signal).

### TypeScript: `Uint8Array` → `Blob`

En TypeScript 5.x estricto:

```typescript
// ❌ Error: Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'BlobPart'
new Blob([file.data])

// ✅ Correcto
new Blob([file.data.buffer as ArrayBuffer])
```

---

## 6. Paquetes de Typst Universe (`#import "@preview/..."`)

### Comportamiento automático de `$typst`

`$typst` registra paquetes automáticamente. En su método interno `doPrepareUse()`, si no se ha
configurado manualmente ningún `access-model` o `package-registry`, ejecuta:

```javascript
// Pseudocódigo interno de TypstSnippet.doPrepareUse()
if (!providers.some(p => p.key.includes('package-registry') || p.key.includes('access-model'))) {
  $typst.use(TypstSnippet.fetchPackageRegistry());
}
```

`fetchPackageRegistry()` configura internamente:
- `MemoryAccessModel` — almacena los archivos extraídos del paquete
- `FetchPackageRegistry` — descarga el `.tar.gz` desde `packages.typst.org`
- `withAccessModel` + `withPackageRegistry` — los conecta al compilador WASM

**No hay que hacer nada en el worker.** Con solo `setCompilerInitOptions({ beforeBuild: [loadFonts(...)] })`
ya funciona `#import "@preview/cetz:0.2.2": canvas, draw`.

### ¿Cómo funciona la descarga de paquetes?

`FetchPackageRegistry` usa **XHR síncrono** (válido dentro de Web Workers):

```javascript
// Interno de FetchPackageRegistry
request.open('GET', `https://packages.typst.org/preview/${name}-${version}.tar.gz`, false);
request.send(null);
// Extrae el .tar.gz → inserta cada archivo en MemoryAccessModel
```

Los paquetes se cachean en memoria. La primera compilación con un paquete nuevo
tiene latencia de red; las siguientes son instantáneas.

### Error que encontramos: "already set some assess model before"

```
Error: already set some assess model before: MemoryAccessModel([object Object])
```

**Causa:** Intentamos añadir manualmente `withAccessModel` y `withPackageRegistry`
a `beforeBuild`. Pero `$typst` ya los añade automáticamente en `doPrepareUse()`.
El resultado es que `withAccessModel` se ejecuta dos veces con el mismo `InitContext`
y lanza el error.

**Fix:** No tocar el `AccessModel` ni el `PackageRegistry` en `setCompilerInitOptions`.
Dejar que `$typst` los gestione solo.

```typescript
// ✅ CORRECTO — solo fuentes, el resto es automático
$typst.setCompilerInitOptions({
  getModule: () => '/assets/typst_ts_web_compiler_bg.wasm',
  beforeBuild: [
    loadFonts([], { assets: ['text'], assetUrlPrefix: '/assets/fonts/' }),
  ],
});

// ❌ INCORRECTO — conflicto con la auto-configuración de $typst
$typst.setCompilerInitOptions({
  getModule: () => '/assets/typst_ts_web_compiler_bg.wasm',
  beforeBuild: [
    loadFonts([], { ... }),
    withAccessModel(packageMemory),           // $typst ya hace esto
    withPackageRegistry(new FetchPackageRegistry(packageMemory)), // $typst ya hace esto
  ],
});
```

---

## 7. Caché de compilación en el worker

Para evitar recompilar cuando el source no ha cambiado:

```typescript
let lastContent = '';
let lastVectorData: Uint8Array | null = null;

// En el handler de 'compile':
if (content === lastContent && lastVectorData) {
  postMessage({ id, type: 'success', vectorData: lastVectorData });
  return;
}

lastContent = content;
lastVectorData = null;

// ... compilar ...

lastVectorData = vectorData;
```

Cuando se añade o elimina una imagen, invalidar el caché:

```typescript
lastContent = '';  // fuerza recompilación en el siguiente mensaje
```

---

## 8. Project root y estructura de paths

| Caso | Path fuente | Project root | `#image("foto.jpg")` busca en |
|---|---|---|---|
| `mainContent` | `/tmp/{uuid}.typ` | `/tmp/` | `/tmp/foto.jpg` ❌ |
| `addSource('/main.typ')` + `root:'/'` | `/main.typ` | `/` | `/foto.jpg` ✅ |

Siempre registrar imágenes con path absoluto desde `/`:

```typescript
this.compiler.addFile(`/${file.name}`, file.data);
// → mapShadow('/mi-imagen.jpg', bytes)
```

---

## 9. Mensajes del worker

```typescript
// Peticiones (main → worker)
type CompileRequest    = { type: 'compile';      id: string;  content: string };
type AddFileRequest    = { type: 'add-file';     path: string; data: Uint8Array };
type RemoveFileRequest = { type: 'remove-file';  path: string };

// Respuestas (worker → main)
type CompileResponse =
  | { id: string; type: 'success'; vectorData: Uint8Array }
  | { id: string; type: 'error';   message: string };
```

`id` es un UUID generado por `CompilerService` para correlacionar respuesta con petición
y gestionar cancelaciones.

---

## 10. Resumen de errores encontrados y sus causas

| Error | Causa | Fix |
|---|---|---|
| `[object Object]` | `diagnostics_format:1` lanza un objeto diagnóstico, no un `Error`. `String(obj)` = `[object Object]` | Usar la API de alto nivel `$typst` en vez del WASM directamente |
| `{"0":68,"1":101,...}` | `diagnostics_format:0` devuelve bytes del artefacto directamente. El código los trataba como mensaje de error y los stringificaba | Entender los dos modos: `0` = inline (artefacto directo), `1` = two-step |
| Fuentes 404 | El script intentaba descargar `NewCMSans10` y `NewCMMono10` que no existen | Actualizar la lista a los 17 archivos reales del repo `typst/typst-assets` |
| `failed to load file (access denied)` | Project root era `/tmp/` por usar `mainContent` | Usar `addSource('/main.typ')` + `root: '/'` |
| `Uint8Array not assignable to BlobPart` | TypeScript 5.x strict | Castear: `new Blob([data.buffer as ArrayBuffer])` |
| `already set some assess model before` | `withAccessModel` añadido dos veces: una manual y otra por `$typst` automáticamente | Eliminar el setup manual; `$typst` lo gestiona solo |
