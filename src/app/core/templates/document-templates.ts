import type { ProjectFile } from '../service/document/document.service';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  /** Emoji used as visual icon in the template picker. */
  icon: string;
  files: ProjectFile[];
}

// ---------------------------------------------------------------------------
// Template content
// ---------------------------------------------------------------------------

const PAPER_CONTENT = `\
#set document(title: "Título del artículo", author: "Autor")
#set page(paper: "a4", margin: (x: 2.5cm, y: 3cm))
#set text(font: "New Computer Modern", size: 11pt)
#set par(justify: true, leading: 0.65em)
#set heading(numbering: "1.1")

#align(center)[
  #text(size: 18pt, weight: "bold")[Título del Artículo]

  #v(0.8em)
  #text(size: 11pt)[Nombre Apellido]

  #v(0.3em)
  #text(size: 10pt, style: "italic")[Universidad · correo\\@ejemplo.com]
]

#v(1.5em)

#align(center)[
  #block(width: 85%)[
    *Resumen* — Escribe aquí el resumen de tu trabajo (150–250 palabras).
    Debe cubrir el objetivo, la metodología, los resultados principales y la conclusión.
  ]
]

#v(2em)

= Introducción

Escribe la introducción aquí. Establece el contexto del problema, la motivación
del trabajo y los objetivos principales.

= Metodología

Describe los métodos utilizados en tu investigación.

= Resultados

Presenta los resultados obtenidos.

= Discusión

Analiza e interpreta los resultados en relación con trabajos previos.

= Conclusión

Resume los hallazgos principales y sugiere líneas futuras de investigación.

= Referencias

#set par(hanging-indent: 1.5em)
[1] Apellido, N. (2024). _Título del artículo_. _Nombre de la Revista_, _vol_(núm), pp. 1–10.
`;

const CV_CONTENT = `\
#set document(title: "Curriculum Vitae")
#set page(paper: "a4", margin: (x: 1.8cm, y: 1.8cm))
#set text(size: 10pt)
#set par(leading: 0.6em)

// ── Encabezado ─────────────────────────────────────────────────────────────

#grid(
  columns: (1fr, auto),
  gutter: 1em,
  align: horizon,
  [
    #text(size: 24pt, weight: "bold")[Nombre Apellido]
    #v(0.2em)
    #text(fill: luma(100))[Título Profesional · Ciudad, País]
  ],
  align(right, text(size: 9pt)[
    correo\\@ejemplo.com \\
    +34 600 000 000 \\
    linkedin.com/in/usuario \\
    github.com/usuario
  ])
)

#v(0.4em)
#line(length: 100%, stroke: 0.5pt + luma(180))
#v(0.8em)

// ── Experiencia ────────────────────────────────────────────────────────────

#text(size: 12pt, weight: "bold")[Experiencia]
#v(0.4em)

*Empresa ABC* — Desarrollador Senior #h(1fr) _Ene 2022 – Presente_ \\
#text(fill: luma(120))[Ciudad, País]
#v(0.2em)
- Desarrollé X usando Y, logrando una mejora del Z%.
- Lideré un equipo de N personas en el proyecto de migración.

#v(0.6em)

*Empresa XYZ* — Desarrollador Junior #h(1fr) _Mar 2019 – Dic 2021_ \\
#text(fill: luma(120))[Ciudad, País]
#v(0.2em)
- Responsabilidad principal del puesto.
- Otra contribución relevante al proyecto.

#v(0.8em)
#line(length: 100%, stroke: 0.3pt + luma(220))
#v(0.8em)

// ── Educación ──────────────────────────────────────────────────────────────

#text(size: 12pt, weight: "bold")[Educación]
#v(0.4em)

*Ingeniería en Sistemas Computacionales* #h(1fr) _2015 – 2019_ \\
#text(fill: luma(120))[Universidad Nacional · Ciudad, País]

#v(0.8em)
#line(length: 100%, stroke: 0.3pt + luma(220))
#v(0.8em)

// ── Habilidades ────────────────────────────────────────────────────────────

#text(size: 12pt, weight: "bold")[Habilidades]
#v(0.4em)

#grid(
  columns: (1fr, 1fr, 1fr),
  gutter: 0.8em,
  [*Lenguajes* \\ TypeScript, Python, Go],
  [*Frameworks* \\ Angular, React, FastAPI],
  [*Herramientas* \\ Git, Docker, PostgreSQL],
)
`;

const SLIDES_CONTENT = `\
#set document(title: "Presentación")
#set page(paper: "presentation-16-9", fill: white, margin: (x: 2cm, y: 1.5cm))
#set text(size: 20pt)

// ── Portada ────────────────────────────────────────────────────────────────

#align(center + horizon)[
  #text(size: 40pt, weight: "bold")[Título de la Presentación]
  #v(1em)
  #text(size: 22pt, fill: luma(120))[Subtítulo o descripción breve]
  #v(2em)
  #text(size: 14pt, fill: luma(150))[Autor · Fecha]
]

#pagebreak()

// ── Agenda ─────────────────────────────────────────────────────────────────

#text(size: 28pt, weight: "bold")[Agenda]
#v(1em)

+ Introducción
+ Punto principal 1
+ Punto principal 2
+ Conclusiones

#pagebreak()

// ── Diapositiva de contenido ───────────────────────────────────────────────

#text(size: 28pt, weight: "bold")[Introducción]
#v(1em)

Escribe aquí el texto de esta diapositiva.

- Punto importante 1
- Punto importante 2
- Punto importante 3

#pagebreak()

// ── Diapositiva con dos columnas ───────────────────────────────────────────

#text(size: 28pt, weight: "bold")[Punto Principal 1]
#v(1em)

#grid(
  columns: (1fr, 1fr),
  gutter: 2em,
  [
    Texto de la diapositiva:
    - Elemento A
    - Elemento B
    - Elemento C
  ],
  rect(width: 100%, height: 55%, fill: luma(240), stroke: none)[
    #align(center + horizon)[
      #text(size: 14pt, fill: luma(160))[Imagen o gráfico aquí]
    ]
  ]
)

#pagebreak()

// ── Conclusiones ───────────────────────────────────────────────────────────

#text(size: 28pt, weight: "bold")[Conclusiones]
#v(1em)

- Conclusión principal 1
- Conclusión principal 2
- Próximos pasos

#v(2em)
#align(center)[
  #text(size: 22pt, style: "italic", fill: luma(160))[¿Preguntas?]
]
`;

const REPORT_CONTENT = `\
#set document(title: "Informe", author: "Autor")
#set page(
  paper: "a4",
  margin: (x: 2.5cm, y: 3cm),
  numbering: "1",
  number-align: right,
)
#set text(font: "New Computer Modern", size: 11pt)
#set par(justify: true)
#set heading(numbering: "1.")

// ── Portada ────────────────────────────────────────────────────────────────

#align(center)[
  #v(5cm)
  #text(size: 30pt, weight: "bold")[Título del Informe]
  #v(0.8em)
  #text(size: 14pt, fill: luma(100))[Subtítulo o descripción del alcance]

  #v(4cm)

  #grid(
    columns: (auto, 1fr),
    gutter: (0.6em, 0.4em),
    [*Autor:*],   [Nombre Apellido],
    [*Fecha:*],   [#datetime.today().display("[day]/[month]/[year]")],
    [*Versión:*], [1.0],
    [*Para:*],    [Nombre del destinatario],
  )
]

#pagebreak()

// ── Tabla de contenidos ────────────────────────────────────────────────────

#outline(title: "Contenido", indent: 1em)

#pagebreak()

// ── Cuerpo ─────────────────────────────────────────────────────────────────

= Introducción

Escribe la introducción del informe aquí. Describe el propósito, alcance y contexto
del documento.

= Antecedentes

Proporciona el contexto necesario para entender el problema o situación analizada.

= Análisis

== Situación Actual

Describe la situación actual con detalle.

== Hallazgos Principales

- *Hallazgo 1:* Descripción del primer hallazgo.
- *Hallazgo 2:* Descripción del segundo hallazgo.
- *Hallazgo 3:* Descripción del tercer hallazgo.

= Recomendaciones

+ *Recomendación 1:* Descripción detallada.
+ *Recomendación 2:* Descripción detallada.

= Conclusión

Resume los puntos clave y el valor del trabajo realizado.

= Anexos

Incluye aquí información adicional de soporte: tablas, gráficos, referencias, etc.
`;

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: 'blank',
    name: 'En blanco',
    description: 'Documento vacío',
    icon: '📄',
    files: [{ name: 'main.typ', content: '' }],
  },
  {
    id: 'paper',
    name: 'Artículo académico',
    description: 'Paper con abstract, secciones y referencias',
    icon: '📝',
    files: [{ name: 'main.typ', content: PAPER_CONTENT }],
  },
  {
    id: 'cv',
    name: 'Currículum Vitae',
    description: 'CV moderno con experiencia y habilidades',
    icon: '👤',
    files: [{ name: 'main.typ', content: CV_CONTENT }],
  },
  {
    id: 'slides',
    name: 'Presentación',
    description: 'Diapositivas 16:9 con portada y secciones',
    icon: '🖥️',
    files: [{ name: 'main.typ', content: SLIDES_CONTENT }],
  },
  {
    id: 'report',
    name: 'Informe',
    description: 'Informe formal con portada y tabla de contenidos',
    icon: '📋',
    files: [{ name: 'main.typ', content: REPORT_CONTENT }],
  },
];
