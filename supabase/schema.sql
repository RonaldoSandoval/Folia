-- ============================================================
-- Typs-Clone — Supabase Schema
-- ============================================================
-- Ejecutar en el SQL Editor de Supabase en este orden.
-- Requiere que el proyecto tenga habilitado Supabase Auth.
-- ============================================================

-- ------------------------------------------------------------
-- Extensions
-- ------------------------------------------------------------
create extension if not exists "uuid-ossp";


-- ============================================================
-- ENUMS
-- ============================================================

create type collaborator_role as enum ('viewer', 'editor', 'admin');


-- ============================================================
-- TABLES
-- ============================================================

-- ------------------------------------------------------------
-- profiles
-- Extiende auth.users. Se crea automáticamente con el trigger
-- handle_new_user al registrar un usuario.
-- ------------------------------------------------------------
create table profiles (
  id          uuid        references auth.users (id) on delete cascade primary key,
  username    text        unique,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null
);


-- ------------------------------------------------------------
-- folders
-- Carpetas para organizar documentos. Soporta anidamiento
-- con parent_id (null = raíz).
-- ------------------------------------------------------------
create table folders (
  id          uuid        default uuid_generate_v4() primary key,
  owner_id    uuid        references profiles (id) on delete cascade not null,
  parent_id   uuid        references folders   (id) on delete cascade,
  name        text        not null,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null
);


-- ------------------------------------------------------------
-- documents
-- Documento Typst. El contenido es el markup crudo (.typ).
-- `files` almacena todos los archivos del proyecto como JSONB.
-- `active_file` indica cuál archivo está activo en el editor.
-- ------------------------------------------------------------
create table documents (
  id            uuid        default uuid_generate_v4() primary key,
  owner_id      uuid        references profiles (id) on delete cascade not null,
  folder_id     uuid        references folders  (id) on delete set null,
  title         text        not null default 'Sin título',
  content       text        not null default '',
  files         jsonb       not null default '[{"name":"main.typ","content":""}]'::jsonb,
  active_file   text        not null default 'main.typ',
  thumbnail_url text,
  is_public     boolean     not null default false,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);

-- ------------------------------------------------------------
-- document_collaborators
-- Tabla de unión usuarios ↔ documentos con roles.
-- El dueño (owner_id) no aparece aquí; se gestiona en documents.
-- ------------------------------------------------------------
create table document_collaborators (
  id           uuid               default uuid_generate_v4() primary key,
  document_id  uuid               references documents (id) on delete cascade not null,
  user_id      uuid               references profiles  (id) on delete cascade not null,
  role         collaborator_role  not null default 'viewer',
  invited_by   uuid               references profiles  (id) on delete set null,
  created_at   timestamptz        default now() not null,

  unique (document_id, user_id)
);


-- ------------------------------------------------------------
-- document_versions
-- Historial de versiones. Se inserta cada vez que el usuario
-- guarda explícitamente o se genera un auto-save.
-- ------------------------------------------------------------
create table document_versions (
  id             uuid        default uuid_generate_v4() primary key,
  document_id    uuid        references documents (id) on delete cascade not null,
  created_by     uuid        references profiles  (id) on delete set null not null,
  content        text        not null,
  version_number integer     not null,
  label          text,       -- etiqueta opcional: "v1.0", "antes del refactor", etc.
  created_at     timestamptz default now() not null,

  unique (document_id, version_number)
);


-- ============================================================
-- INDEXES
-- ============================================================

create index on documents              (owner_id);
create index on documents              (folder_id);
create index on folders                (owner_id);
create index on folders                (parent_id);
create index on document_collaborators (document_id);
create index on document_collaborators (user_id);
create index on document_versions      (document_id);
create index on document_versions      (document_id, version_number desc);


-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- ------------------------------------------------------------
-- updated_at automático
-- ------------------------------------------------------------
create or replace function handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on profiles
  for each row execute function handle_updated_at();

create trigger folders_updated_at
  before update on folders
  for each row execute function handle_updated_at();

create trigger documents_updated_at
  before update on documents
  for each row execute function handle_updated_at();


-- ------------------------------------------------------------
-- Crea perfil automáticamente al registrar usuario
-- ------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- ------------------------------------------------------------
-- Auto-incrementa version_number por documento
-- ------------------------------------------------------------
create or replace function set_version_number()
returns trigger
language plpgsql
as $$
begin
  new.version_number = coalesce(
    (
      select max(version_number) + 1
      from document_versions
      where document_id = new.document_id
    ),
    1
  );
  return new;
end;
$$;

create trigger document_versions_set_number
  before insert on document_versions
  for each row execute function set_version_number();


-- ------------------------------------------------------------
-- Funciones auxiliares para RLS (SECURITY DEFINER)
--
-- Estas funciones leen document_collaborators y documents
-- sin pasar por RLS, evitando la recursión infinita que
-- ocurriría si las políticas de ambas tablas se consultaran
-- mutuamente a través de subqueries normales.
--
-- Deben definirse ANTES de crear las políticas que las usan.
-- ------------------------------------------------------------

-- Devuelve el rol del usuario autenticado en un documento,
-- o NULL si no es colaborador.
create or replace function my_collaborator_role(doc_id uuid)
returns collaborator_role
language sql
security definer
set search_path = public
stable
as $$
  select role
  from document_collaborators
  where document_id = doc_id
    and user_id     = auth.uid()
  limit 1;
$$;

-- True si el usuario autenticado es dueño del documento o admin.
create or replace function is_document_owner_or_admin(doc_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1 from documents
      where id = doc_id and owner_id = auth.uid()
    )
    or exists (
      select 1 from document_collaborators
      where document_id = doc_id
        and user_id = auth.uid()
        and role = 'admin'
    );
$$;


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table profiles               enable row level security;
alter table folders                enable row level security;
alter table documents              enable row level security;
alter table document_collaborators enable row level security;
alter table document_versions      enable row level security;


-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------

-- Cualquiera puede ver perfiles (para mostrar avatares en docs compartidos)
create policy "profiles: select público"
  on profiles for select
  using (true);

-- Solo el propio usuario puede actualizar su perfil
create policy "profiles: update propio"
  on profiles for update
  using (auth.uid() = id);


-- ------------------------------------------------------------
-- folders
-- ------------------------------------------------------------

-- El dueño tiene acceso total a sus carpetas
create policy "folders: acceso total al dueño"
  on folders for all
  using (auth.uid() = owner_id);


-- ------------------------------------------------------------
-- documents
-- ------------------------------------------------------------

-- El dueño tiene acceso total
create policy "documents: acceso total al dueño"
  on documents for all
  using (auth.uid() = owner_id);

-- Colaboradores y documentos públicos: lectura
create policy "documents: lectura a colaboradores y público"
  on documents for select
  using (
    is_public = true
    or owner_id = auth.uid()
    or my_collaborator_role(id) is not null
  );

-- Editores y admins pueden editar contenido
create policy "documents: edición a editores y admins"
  on documents for update
  using (
    owner_id = auth.uid()
    or my_collaborator_role(id) in ('editor', 'admin')
  );


-- ------------------------------------------------------------
-- document_collaborators
-- ------------------------------------------------------------

-- Cada usuario ve sus propias invitaciones
create policy "collaborators: ver propio registro"
  on document_collaborators for select
  using (user_id = auth.uid());

-- Dueño y admins gestionan colaboradores
create policy "collaborators: gestión por dueño y admins"
  on document_collaborators for all
  using (is_document_owner_or_admin(document_id));


-- ------------------------------------------------------------
-- document_versions
-- ------------------------------------------------------------

-- Lectura: mismas reglas que el documento padre
create policy "versions: lectura si puede leer el documento"
  on document_versions for select
  using (
    exists (
      select 1 from documents d
      where d.id = document_versions.document_id
        and (
          d.is_public = true
          or d.owner_id = auth.uid()
          or my_collaborator_role(d.id) is not null
        )
    )
  );

-- Inserción: dueño, editores y admins
create policy "versions: inserción por editores y dueño"
  on document_versions for insert
  with check (
    exists (
      select 1 from documents d
      where d.id = document_versions.document_id
        and (
          d.owner_id = auth.uid()
          or my_collaborator_role(d.id) in ('editor', 'admin')
        )
    )
  );
