-- Admin-managed image and video assets for catalog entries.
alter table public.games add column if not exists trailer_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-media','game-media',true,104857600,array['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists game_media_public_read on storage.objects;
create policy game_media_public_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'game-media');
drop policy if exists game_media_admin_insert on storage.objects;
create policy game_media_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'game-media' and (storage.foldername(name))[1] = auth.uid()::text and public.has_role(auth.uid(), 'admin'));
drop policy if exists game_media_admin_update on storage.objects;
create policy game_media_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'game-media' and (storage.foldername(name))[1] = auth.uid()::text and public.has_role(auth.uid(), 'admin'))
  with check (bucket_id = 'game-media' and (storage.foldername(name))[1] = auth.uid()::text and public.has_role(auth.uid(), 'admin'));
drop policy if exists game_media_admin_delete on storage.objects;
create policy game_media_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'game-media' and (storage.foldername(name))[1] = auth.uid()::text and public.has_role(auth.uid(), 'admin'));

grant update (trailer_url) on public.games to authenticated;
grant insert (trailer_url) on public.games to authenticated;