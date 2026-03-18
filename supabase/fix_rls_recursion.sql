-- ============================================================
-- Migración: Corrige recursión infinita en políticas RLS
-- ============================================================
-- El ciclo ocurre porque:
--   documents policy  → consulta document_collaborators (con RLS)
--   collaborators policy → consulta documents (con RLS) → ciclo
--
-- Solución: funciones SECURITY DEFINER que leen ambas tablas
-- sin pasar por RLS, rompiendo el ciclo.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Eliminar las políticas recursivas
-- ------------------------------------------------------------

drop policy if exists "documents: lectura a colaboradores y público"  on documents;
drop policy if exists "documents: edición a editores y admins"         on documents;
drop policy if exists "collaborators: gestión por dueño y admins"      on document_collaborators;
drop policy if exists "versions: lectura si puede leer el documento"   on document_versions;
drop policy if exists "versions: inserción por editores y dueño"       on document_versions;


-- ------------------------------------------------------------
-- 2. Funciones auxiliares SECURITY DEFINER
--    Ejecutan sus queries sin RLS → rompen el ciclo
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

-- True si el usuario autenticado es dueño del documento o
-- tiene rol admin como colaborador.
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


-- ------------------------------------------------------------
-- 3. Recrear políticas usando las funciones auxiliares
-- ------------------------------------------------------------

-- documents: lectura
create policy "documents: lectura a colaboradores y público"
  on documents for select
  using (
    is_public = true
    or owner_id = auth.uid()
    or my_collaborator_role(id) is not null
  );

-- documents: edición
create policy "documents: edición a editores y admins"
  on documents for update
  using (
    owner_id = auth.uid()
    or my_collaborator_role(id) in ('editor', 'admin')
  );

-- document_collaborators: gestión
create policy "collaborators: gestión por dueño y admins"
  on document_collaborators for all
  using (is_document_owner_or_admin(document_id));

-- document_versions: lectura
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

-- document_versions: inserción
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
