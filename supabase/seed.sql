-- ============================================================
-- Folia — Seed de prueba
-- ============================================================
-- Crea 2 usuarios, 2 documentos y 1 colaboración.
--
-- Contraseña de ambos usuarios: password
--
-- INSTRUCCIONES:
--   1. Ejecuta este script en el SQL Editor de Supabase.
--   2. Inicia sesión en la app con:
--        usuario1@typs.test / password
--        usuario2@typs.test / password
-- ============================================================

-- IDs fijos usados en todo el archivo:
--   user1 → a0000000-0000-0000-0000-000000000001  (Ana García)
--   user2 → a0000000-0000-0000-0000-000000000002  (Carlos López)
--   doc1  → b0000000-0000-0000-0000-000000000001  (dueño: Ana)
--   doc2  → b0000000-0000-0000-0000-000000000002  (dueño: Carlos)


-- ============================================================
-- 1. auth.users
--    encrypted_password = bcrypt("password", cost=10)
-- ============================================================

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_sso_user,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token,
  created_at,
  updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'usuario1@typs.test',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Ana García"}',
    false,
    '', '', '', '',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'usuario2@typs.test',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Carlos López"}',
    false,
    '', '', '', '',
    now(),
    now()
  )
on conflict (id) do nothing;


-- ============================================================
-- 2. auth.identities
--    Requerido para que el login email/password funcione.
--    Sin esta tabla el usuario existe pero no puede autenticarse.
-- ============================================================

insert into auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) values
  (
    'a0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    '{"sub":"a0000000-0000-0000-0000-000000000001","email":"usuario1@typs.test"}',
    'email',
    'usuario1@typs.test',
    now(),
    now(),
    now()
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000002',
    '{"sub":"a0000000-0000-0000-0000-000000000002","email":"usuario2@typs.test"}',
    'email',
    'usuario2@typs.test',
    now(),
    now(),
    now()
  )
on conflict (id) do nothing;


-- ============================================================
-- 3. profiles
--    El trigger handle_new_user los crea automáticamente al
--    insertar en auth.users. Este insert es un fallback explícito
--    en caso de que el trigger no haya disparado.
-- ============================================================

insert into profiles (id, full_name, email)
values
  ('a0000000-0000-0000-0000-000000000001', 'Ana García',    'usuario1@typs.test'),
  ('a0000000-0000-0000-0000-000000000002', 'Carlos López',  'usuario2@typs.test')
on conflict (id) do nothing;


-- ============================================================
-- 4. documents
--    owner_id referencia profiles(id), por eso los perfiles
--    deben existir antes de este insert.
-- ============================================================

insert into documents (
  id,
  owner_id,
  title,
  content,
  files,
  active_file,
  is_public,
  created_at,
  updated_at
) values
  (
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'Mi primer documento',
    E'= Mi primer documento\n\nContenido del documento de Ana.\n\n== Introducción\n\nTypst es un sistema de composición tipográfica moderno.\n',
    '[{"name":"main.typ","content":"= Mi primer documento\n\nContenido del documento de Ana.\n\n== Introducción\n\nTypst es un sistema de composición tipográfica moderno.\n"}]'::jsonb,
    'main.typ',
    false,
    now() - interval '2 days',
    now() - interval '2 days'
  ),
  (
    'b0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000002',
    'Informe técnico',
    E'= Informe Técnico\n\n#set text(lang: "es")\n\n== Resumen\n\nArquitectura del sistema.\n',
    '[{"name":"main.typ","content":"= Informe Técnico\n\n#set text(lang: \"es\")\n\n== Resumen\n\nArquitectura del sistema.\n"},{"name":"refs.typ","content":"// Referencias bibliográficas\n"}]'::jsonb,
    'main.typ',
    false,
    now() - interval '1 day',
    now() - interval '1 day'
  )
on conflict (id) do nothing;


-- ============================================================
-- 5. document_collaborators
--    Carlos (editor) en el documento de Ana.
--    Verifica que RLS permite a Carlos leer y editar doc1
--    pero no eliminar (rol editor, no admin).
-- ============================================================

insert into document_collaborators (document_id, user_id, role, invited_by)
values (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
  'editor',
  'a0000000-0000-0000-0000-000000000001'
)
on conflict (document_id, user_id) do nothing;


-- ============================================================
-- 6. Verificación
-- ============================================================

select 'auth.users'            as tabla, count(*)::text as filas from auth.users     where id::text like 'a0000000%'
union all
select 'auth.identities',               count(*)::text          from auth.identities where user_id::text like 'a0000000%'
union all
select 'profiles',                      count(*)::text          from profiles         where id::text like 'a0000000%'
union all
select 'documents',                     count(*)::text          from documents        where id::text like 'b0000000%'
union all
select 'document_collaborators',        count(*)::text          from document_collaborators;
