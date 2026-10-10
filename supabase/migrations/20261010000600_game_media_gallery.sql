-- Ordered images/videos used by the game-page autoplay gallery.
create table public.game_media (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('image','video')),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (game_id, sort_order)
);
create index game_media_order_idx on public.game_media (game_id, sort_order);
alter table public.game_media enable row level security;
create policy game_media_read_published on public.game_media for select to anon, authenticated
  using (exists (select 1 from public.games g where g.id = game_id and (g.is_published or public.current_user_has_role('admin'))));
create policy game_media_admin_insert on public.game_media for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));
create policy game_media_admin_update on public.game_media for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy game_media_admin_delete on public.game_media for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));
grant select on public.game_media to anon, authenticated;
grant insert (game_id,media_url,media_type,sort_order) on public.game_media to authenticated;
grant update (media_url,media_type,sort_order) on public.game_media to authenticated;
grant delete on public.game_media to authenticated;