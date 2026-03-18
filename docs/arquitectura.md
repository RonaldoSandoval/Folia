# Arquitectura de Software: Typst Collab AI

**Estado:** `Draft v1.0` | **Fecha:** 12 de Marzo, 2026

**Stack Principal:** Angular 21, Supabase, WASM, Claude API.

---

## 1. Resumen Ejecutivo

El sistema es un entorno de edición colaborativa para documentos **Typst** potenciado por Inteligencia Artificial. La estrategia arquitectónica se basa en un enfoque de **Evolución Gradual**:

1. **Fase Inicial:** Aprovechar el ecosistema *Backend-as-a-Service* (BaaS) de **Supabase** para acelerar el *Time-to-Market*.
2. **Escalabilidad Futura:** Implementar un diseño desacoplado en el frontend mediante el patrón **Repository**, permitiendo una migración transparente hacia un backend propio (NestJS) sin impactar la capa de presentación.

---

## 2. Vista General del Sistema

La arquitectura sigue un modelo de **Cliente Grueso**, donde la lógica de compilación y renderizado ocurre en el navegador mediante WebAssembly (WASM), reduciendo la latencia y la carga del servidor.

### Flujo de Componentes

* **Editor Core:** Basado en un editor de texto plano que emite cambios hacia un **Web Worker**.
* **WASM Compiler:** Compila el marcado Typst a PDF/Canvas en tiempo real.
* **Data Sync:** Supabase Realtime gestiona la presencia de usuarios y cambios concurrentes.

---

## 3. Arquitectura de Datos (Persistencia)

Se utiliza **PostgreSQL** con una estructura relacional normalizada. La seguridad se delega a las políticas de **Row Level Security (RLS)** de Supabase.

### Diagrama de Entidad-Relación (ERD)

```sql
-- Perfiles de Usuario (Extensión de auth.users)
profiles (
  id uuid PK references auth.users,
  username text unique,
  avatar_url text,
  updated_at timestamptz
);

-- Jerarquía de Archivos
workspaces (
  id uuid PK,
  name text,
  owner_id uuid FK -> profiles.id
);

folders (
  id uuid PK,
  workspace_id uuid FK -> workspaces.id,
  parent_id uuid FK -> folders.id (Self-reference),
  name text
);

documents (
  id uuid PK,
  folder_id uuid FK -> folders.id,
  workspace_id uuid FK -> workspaces.id,
  title text,
  content text, -- Typst Markup
  updated_at timestamptz
);

```

---

## 4. Arquitectura Frontend (Angular 21)

### Organización por Dominios (Feature-Based)

La estructura de carpetas sigue el principio de **Lógica de Dominio Encapsulada**, facilitando el mantenimiento y el *lazy loading*.

* **`core/`**: Servicios globales inyectables (Auth, Interceptors, Supabase Client).
* **`features/`**: Módulos funcionales autocontenidos.
* `editor/`: Lógica de edición, integración WASM y preview.
* `file-explorer/`: Gestión de archivos y navegación.
* `ai-assistant/`: Interfaz de chat y streaming de Claude API.


* **`shared/`**: UI Kit, pipes de formato y directivas comunes.

### Gestión de Estado Reactivo

Se implementa **Angular Signals** para un flujo de datos unidireccional y reactividad de grano fino.

> **Nota de Diseño:** Se evita el uso de estados globales pesados (como NgRx Store) en favor de **Signal Stores** locales por cada *feature*, reduciendo el boilerplate.

---

## 5. Patrones de Diseño y Abstracción

### 5.1 Pattern: Ports and Adapters (Hexagonal Lite)

Para evitar el *vendor lock-in* con Supabase, la comunicación de datos se abstrae mediante interfaces.

1. **Componente:** Solicita datos al `DocumentService`.
2. **Servicio:** Contiene la lógica de negocio y llama a la interfaz `IDocumentRepository`.
3. **Repositorio (Adapter):** Implementa la llamada específica (ej. `SupabaseDocumentRepository`).

| Ventaja | Descripción |
| --- | --- |
| **Intercambiabilidad** | Cambiar Supabase por un API REST propio requiere solo crear un nuevo Adapter. |
| **Testabilidad** | Permite inyectar un `MockRepository` para pruebas unitarias sin conexión. |

### 5.2 Evolución al Backend: Modular Monolith

Cuando el volumen de usuarios o la complejidad de la IA lo requieran, se migrará a **NestJS** siguiendo una estructura modular que espeje las *features* del frontend.

---

## 6. Stack Tecnológico de Referencia

* **Frontend:** Angular 21 (Signals, Control Flow, SSR).
* **Backend inicial:** Supabase (Auth, RLS, Realtime, Storage).
* **Motor de Documentos:** Typst (WASM).
* **Inteligencia Artificial:** Claude 3.5 Sonnet (vía API).
* **Infraestructura:** Vercel (Frontend) + Supabase Cloud.

---


### Estructura de Carpetas

```
src/app/
├── core/                    # Singleton services (auth, http, error handling)
│   ├── auth/
│   ├── supabase/
│   └── error/
│
├── features/                # Un modulo por feature grande
│   ├── editor/              # Editor Typst + preview canvas
│   ├── file-explorer/       # Sidebar con carpetas y documentos
│   ├── ai-chat/             # Panel de chat con IA
│   ├── auth/                # Login, registro, perfil
│   └── workspace/           # Settings del workspace
│
├── layout/                  # Shell de la app (header, sidebar shell, main area)
│
├── shared/                  # Componentes, pipes, directives reutilizables
│   ├── components/
│   ├── pipes/
└── workers/                 # Web Workers (compiler, render)
```
