-- Foto de producto: bucket de Storage nuevo + columna products.photo_path.
--
-- Primer uso real de Supabase Storage en el repo — docs/ARCHITECTURE.md
-- solo documentaba el bucket "branding" para el logo de la empresa, nunca
-- implementado (ver docs/PROGRESS.md, Fase 6: "DEFERRED"). Bucket público
-- de lectura a propósito: son fotos de catálogo, no dato sensible del
-- negocio — mismo criterio que products_seller_select (phase2_rls.sql), que
-- ya deja ver el catálogo activo completo a cualquier vendedor autenticado.
-- Escritura (insert/update/delete de objetos) solo admin, vía RLS sobre
-- storage.objects con el mismo private.is_admin() de siempre.
--
-- La compresión de la imagen ocurre en el navegador antes de subir (Canvas
-- API nativa, sin librería nueva — ver lib/image/compress-image.ts); el
-- límite de tamaño/tipo de acá es una segunda capa de defensa, no la
-- primera (nunca confiar solo en el cliente).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

alter table public.products add column photo_path text;

create policy product_photos_admin_write
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-photos' and (select private.is_admin()));

create policy product_photos_admin_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-photos' and (select private.is_admin()))
  with check (bucket_id = 'product-photos' and (select private.is_admin()));

create policy product_photos_admin_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-photos' and (select private.is_admin()));

-- SELECT vía la API de storage.objects (listar, HEAD) además del acceso
-- directo por URL pública que ya da bucket public=true.
create policy product_photos_read
  on storage.objects for select
  to authenticated
  using (bucket_id = 'product-photos');
