-- Repair explicit client privileges for partially migrated Supabase projects.
grant usage on schema public to anon, authenticated;
grant select on public.notifications to authenticated;
grant update (is_read) on public.notifications to authenticated;
grant select on public.profiles to anon, authenticated;
grant update (username,display_name,bio,avatar_url,country,favorite_games,platforms,is_private) on public.profiles to authenticated;

drop policy if exists notifications_recipient_read on public.notifications;
create policy notifications_recipient_read on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_recipient_update on public.notifications;
create policy notifications_recipient_update on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists profiles_read_public on public.profiles;
create policy profiles_read_public on public.profiles for select to anon, authenticated
  using (account_status = 'active' and (not is_private or id = auth.uid() or public.current_user_has_role('admin') or public.is_conversation_peer(id) or exists (
    select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = id
  )));
drop policy if exists profiles_read_owner on public.profiles;
create policy profiles_read_owner on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists profiles_update_owner on public.profiles;
create policy profiles_update_owner on public.profiles for update to authenticated
  using (id = auth.uid() and account_status = 'active') with check (id = auth.uid() and account_status = 'active');

-- Live entries contain discovery metadata only. Audio/video is peer-to-peer WebRTC.
create table public.live_streams (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 100),
  created_at timestamptz not null default now(),
  unique (host_id)
);
create index live_streams_recent_idx on public.live_streams (created_at desc);
alter table public.live_streams enable row level security;
create policy live_streams_read on public.live_streams for select to authenticated using (true);
create policy live_streams_host_insert on public.live_streams for insert to authenticated
  with check (host_id = auth.uid() and public.is_active_member() and exists (
    select 1 from public.games g where g.id = game_id and g.is_published
  ));
create policy live_streams_host_update on public.live_streams for update to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());
create policy live_streams_host_delete on public.live_streams for delete to authenticated using (host_id = auth.uid());
grant select on public.live_streams to authenticated;
grant insert (host_id,game_id,title) on public.live_streams to authenticated;
grant update (title) on public.live_streams to authenticated;
grant delete on public.live_streams to authenticated;

-- Private Realtime channels are permitted only for a currently listed stream.
create policy live_stream_signal_read on realtime.messages for select to authenticated
  using (extension = 'broadcast' and split_part(realtime.topic(), ':', 1) = 'live'
    and exists (select 1 from public.live_streams s where s.id::text = split_part(realtime.topic(), ':', 2)));
create policy live_stream_signal_send on realtime.messages for insert to authenticated
  with check (extension = 'broadcast' and split_part(realtime.topic(), ':', 1) = 'live'
    and exists (select 1 from public.live_streams s where s.id::text = split_part(realtime.topic(), ':', 2)));

alter publication supabase_realtime add table public.live_streams;