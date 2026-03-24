-- ============================================================
-- Migration: thumbnails + storage RLS
-- Run this in the Supabase SQL Editor.
--
-- Before running:
--   1. Go to Storage → New bucket → "project-assets"  (private, RLS enabled)
--   2. Go to Storage → New bucket → "document-thumbnails" (PUBLIC, RLS enabled)
-- ============================================================

-- 1. Add thumbnail_url column to documents
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT DEFAULT NULL;


-- ============================================================
-- 2. RLS for "project-assets" bucket (private — images)
-- ============================================================

-- Owners can upload images into their own documents.
CREATE POLICY "owners_can_upload_images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-assets' AND
    (SELECT owner_id FROM documents
       WHERE id::text = (storage.foldername(name))[1]) = auth.uid()
  );

-- Owners AND collaborators can download images.
CREATE POLICY "users_can_read_images"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-assets' AND (
      (SELECT owner_id FROM documents
         WHERE id::text = (storage.foldername(name))[1]) = auth.uid()
      OR EXISTS (
        SELECT 1 FROM document_collaborators
         WHERE document_id::text = (storage.foldername(name))[1]
           AND user_id = auth.uid()
      )
    )
  );

-- Only owners can delete images.
CREATE POLICY "owners_can_delete_images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-assets' AND
    (SELECT owner_id FROM documents
       WHERE id::text = (storage.foldername(name))[1]) = auth.uid()
  );

-- Only owners can move/rename images.
CREATE POLICY "owners_can_update_images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-assets' AND
    (SELECT owner_id FROM documents
       WHERE id::text = (storage.foldername(name))[1]) = auth.uid()
  );


-- ============================================================
-- 3. RLS for "document-thumbnails" bucket (public — write-only guard)
--    Reads are open because the bucket is public.
-- ============================================================

-- Only document owners can upload / overwrite their thumbnail.
CREATE POLICY "owners_can_upload_thumbnail"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'document-thumbnails' AND
    (SELECT owner_id FROM documents
       WHERE id::text = (storage.foldername(name))[1]) = auth.uid()
  );

CREATE POLICY "owners_can_update_thumbnail"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'document-thumbnails' AND
    (SELECT owner_id FROM documents
       WHERE id::text = (storage.foldername(name))[1]) = auth.uid()
  );

CREATE POLICY "owners_can_delete_thumbnail"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'document-thumbnails' AND
    (SELECT owner_id FROM documents
       WHERE id::text = (storage.foldername(name))[1]) = auth.uid()
  );
