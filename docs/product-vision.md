# Visión de Producto — Typs

## El problema

La app tiene una base técnica sólida pero carece de un "por qué volver". Competir
directamente contra Notion u Obsidian como editor de Markdown no tiene sentido: son
productos maduros con millones de usuarios. Tampoco es suficiente ser un "typst.app con
colaboración", porque typst.app ya existe.

---

## La ventaja real

**Typst produce el output tipográfico de mayor calidad de cualquier herramienta web. Y
tenemos AI integrada.**

Nadie más combina estas dos cosas bien:

| Herramienta | AI | Calidad de output |
|---|---|---|
| Word + Copilot | Sí | Documento Word (ugly, sin tipografía) |
| Notion + AI | Sí | Notion blocks (no exportable profesionalmente) |
| LaTeX + AI | Parcial | Doloroso, inaccesible para la mayoría |
| **Esta app** | **Sí** | **PDF tipográficamente profesional** |

El posicionamiento: **"El único editor donde el AI produce documentos profesionales,
no solo texto."**

---

## Pilares del producto

### 1. Templates con intención — el usuario no empieza en blanco

En vez de "Crear documento" genérico, el usuario elige qué quiere crear:

- **Paper académico** → template IEEE / APA / ACM listo
- **CV técnico** → template limpio orientado a developers
- **Reporte ejecutivo** → portada + secciones estructuradas
- **Documentación técnica** → template para proyectos open source
- **Documento libre** → editor abierto como hoy

El template ya tiene la estructura Typst correcta. El AI conoce ese template y puede
rellenar secciones de forma coherente con el formato.

### 2. AI que actúa sobre el documento, no solo responde

El chat panel actual es un asistente genérico. El diferenciador real es un AI que
entiende el documento que está abierto y ejecuta acciones concretas:

- "Escribe la introducción de este paper sobre X" → genera Typst formateado en el
  template activo
- "Convierte este outline en secciones con formato" → estructura el documento
- "Mejora este párrafo manteniendo el formato Typst" → edita en contexto
- "Genera una tabla comparativa con estos datos" → produce `#table(...)` correcto
- "Adapta este paper al formato IEEE" → reescribe headers y referencias

La clave es que el **system prompt del AI cambia según el template activo**. No es el
mismo prompt para un CV que para un paper académico.

### 3. Export como momento "wow"

El PDF que genera Typst es genuinamente hermoso. Ese momento de ver el documento
renderizado es el hook de retención. El flujo debería amplificarlo:

- Preview en vivo del PDF mientras se edita (ya existe)
- Export a PDF con un clic — sin fricción
- El PDF exportado no tiene watermark en plan gratuito (barrera baja de entrada)
- El PDF tiene calidad de publicación — ese es el argumento de venta

---

## Nicho prioritario: académicos y estudiantes técnicos

**Por qué este nicho:**
- Son millones con un dolor real (LaTeX es complejo, Word produce output de baja calidad)
- Necesitan formatos específicos (IEEE, ACM, APA, tesis) — los templates lo resuelven exactamente
- El AI que entiende estructura académica (abstract, introducción, metodología, conclusiones,
  referencias) sería diferenciador real frente a cualquier competidor
- Están dispuestos a pagar si el output cumple los requisitos del journal o la universidad
- El CV técnico es un caso de uso adyacente de alta frecuencia (los mismos usuarios)

**Flujo ideal para este usuario:**
1. Entra a la app, selecciona "Paper académico → IEEE"
2. El template ya tiene la estructura correcta con placeholders
3. El AI rellena secciones a partir de sus notas o un outline
4. El preview muestra el PDF en tiempo real
5. Exporta y entrega

---

## Modelo de ingresos potencial

| Feature | Free | Pro |
|---|---|---|
| Documentos | Hasta 10 | Ilimitados |
| Templates base | Todos | Todos |
| Templates premium | No | Sí |
| AI credits / mes | 20 mensajes | Ilimitados |
| Export PDF | Con marca de agua | Sin marca |
| Colaboración | Hasta 2 usuarios | Ilimitada |
| Historial de versiones | No | Sí |

---

## Lo que NO cambiar

El fundamento técnico ya soporta esta visión:

- Typst WASM compiler → el output de calidad ya existe
- Colaboración en tiempo real (Yjs) → ya funciona
- AI pipeline (Groq/Anthropic via Edge Function) → ya funciona
- Sistema de documentos y carpetas → ya funciona
- Rate limiting en AI → ya existe

El cambio es de **producto**, no de infraestructura.

---

## Próximos pasos concretos

1. **Templates por tipo de documento** — crear 3-4 templates Typst reales
   (paper IEEE, CV técnico, reporte ejecutivo)
2. **Onboarding con selección de template** — cambiar el "Crear documento"
   por un modal de selección de tipo
3. **System prompt dinámico** — el AI recibe contexto del template activo,
   no un prompt genérico
4. **AI con acciones en el documento** — comandos que insertan Typst
   estructurado en la posición correcta del editor
5. **Export flow** — hacer el momento del PDF export un paso explícito y satisfactorio
