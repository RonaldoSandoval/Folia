# Typs Clone

Editor de documentos colaborativo basado en [Typst](https://typst.app), construido con Angular 21.

---

## Vision

Construir una alternativa a **typst.app** con edicion colaborativa en tiempo real, organizacion por carpetas/proyectos, autenticacion de usuarios, y un asistente de IA integrado que convierte investigacion en contenido Typst automaticamente.

---

## Objetivos del Proyecto

### Nucleo — Editor Typst
- [ ] Editor de texto con sintaxis Typst
- [ ] Previsualizacion en tiempo real (draft + sharp rendering via WebAssembly)
- [ ] Exportacion a PDF
- [ ] Soporte de assets (imagenes, fuentes)

### Organizacion de Documentos
- [ ] Estructura de carpetas y proyectos por usuario
- [ ] Crear, renombrar, mover y eliminar documentos
- [ ] Vista de explorador de archivos en la barra lateral (inspirada en typst.app)

### Colaboracion en Tiempo Real
- [ ] Edicion simultanea por multiples usuarios (CRDT o OT — por definir)
- [ ] Cursores y presencia en tiempo real (nombre + color por usuario)
- [ ] Historial de cambios / versiones

### Autenticacion y Usuarios
- [ ] Registro e inicio de sesion (email + password, OAuth con Google)
- [ ] Perfiles de usuario
- [ ] Permisos por documento: propietario, editor, lector

### Asistente de IA (Plus diferenciador)
- [ ] Panel de chat integrado en la UI
- [ ] El usuario describe su investigacion o lo que quiere escribir
- [ ] La IA genera o inserta contenido en formato Typst automaticamente
- [ ] Soporte para: resumenes, introducciones, secciones, tablas, bibliografia

---

## Arquitectura Planeada

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (Angular 21)              │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │ Sidebar  │  │  Editor  │  │     Preview        │ │
│  │ (carpetas│  │ (Typst)  │  │  (Canvas/WASM)     │ │
│  │  y docs) │  │          │  │                    │ │
│  └──────────┘  └──────────┘  └────────────────────┘ │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │           Panel de Chat IA                   │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────────────┐
│  Backend API    │  │  WebSocket Server   │
│  (REST/GraphQL) │  │  (colaboracion RT)  │
└─────────────────┘  └─────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│           Base de Datos             │
│  usuarios / documentos / carpetas   │
└─────────────────────────────────────┘
```

### Stack tecnologico

| Capa | Tecnologia |
|------|-----------|
| Frontend | Angular 21, TailwindCSS 4, Lucide Icons |
| Typst WASM | `@myriaddreamin/typst-ts-web-compiler`, `@myriaddreamin/typst.angular` |
| Colaboracion RT | WebSockets (por definir: Socket.io / Liveblocks / Yjs) |
| Backend | Por definir (NestJS / Supabase / Firebase) |
| Autenticacion | Por definir (Supabase Auth / Auth0 / Firebase Auth) |
| IA | Claude API (Anthropic) |
| Base de datos | Por definir (PostgreSQL / Firestore) |

---

## Estado Actual

El proyecto tiene un prototipo funcional del editor con renderizado en tiempo real via WASM. Los componentes de layout (header, sidebar, lista de documentos) existen pero estan desconectados mientras se define la arquitectura completa.

### Lo que ya funciona
- Compilacion de Typst en Web Worker (off-thread, sin bloquear UI)
- Renderizado en canvas con modo draft (rapido) y sharp (nitido)
- Estructura base de componentes Angular

### Proximos pasos inmediatos
1. Definir el backend y estrategia de base de datos
2. Implementar autenticacion
3. Reconectar y terminar los componentes de layout
4. Implementar el sistema de carpetas/documentos
5. Agregar colaboracion en tiempo real
6. Integrar el asistente de IA

---

## Desarrollo Local

```bash
# Instalar dependencias
npm install

# Servidor de desarrollo
ng serve
# Navegar a http://localhost:4200

# Build de produccion
ng build

# Tests unitarios
ng test
```

---

## Inspiracion

- [typst.app](https://typst.app) — editor oficial de Typst
- [Overleaf](https://overleaf.com) — editor colaborativo de LaTeX
