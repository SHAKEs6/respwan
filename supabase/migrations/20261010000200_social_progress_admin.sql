-- Add player-submitted game progress and complete safe administrator controls.
create table public.player_game_progress (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  platform text not null check (char_length(platform) between 2 and 40),
  player_tag text not null check (char_length(player_tag) between 1 and 80),
  rank_label text not null default '' check (char_length(rank_label) <= 80),
  player_level integer check (player_level is null or player_level >= 0),
  wins integer not null default 0 check (wins >= 0),
  matches_played integer not null default 0 check (matches_played >= wins),
  hours_played numeric(8,1) not null default 0 check (hours_played >= 0),
  notes text not null default '' check (char_length(notes) <= 500),
  verified boolean not null default false,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, game_id),
  check ((verified and verified_by is not null and verified_at is not null) or not verified)
);
create index player_game_progress_game_idx on public.player_game_progress (game_id, updated_at desc);
create index player_game_progress_player_idx on public.player_game_progress (player_id, updated_at desc);
alter table public.player_game_progress enable row level security;
create policy game_progress_public_read on public.player_game_progress for select to anon, authenticated
  using (player_id = auth.uid() or public.current_user_has_role('admin') or exists (
    select 1 from public.profiles p where p.id = player_id and p.account_status = 'active' and not p.is_private
  ));
create policy game_progress_owner_insert on public.player_game_progress for insert to authenticated
  with check (player_id = auth.uid() and public.is_active_member() and not verified and verified_by is null and verified_at is null);
create policy game_progress_owner_update on public.player_game_progress for update to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid() and not verified and verified_by is null and verified_at is null);
create policy game_progress_owner_delete on public.player_game_progress for delete to authenticated
  using (player_id = auth.uid());
create trigger game_progress_updated_at before update on public.player_game_progress for each row execute function public.set_updated_at();
grant select on public.player_game_progress to anon, authenticated;
grant insert (player_id,game_id,platform,player_tag,rank_label,player_level,wins,matches_played,hours_played,notes) on public.player_game_progress to authenticated;
grant update (platform,player_tag,rank_label,player_level,wins,matches_played,hours_played,notes) on public.player_game_progress to authenticated;
grant delete on public.player_game_progress to authenticated;

-- Role changes are routed through owner-checked RPCs and are always audited.
create or replace function public.admin_set_user_role(target_user_id uuid, target_role public.app_role, should_grant boolean)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare target_name text;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Administrator role required'; end if;
  if target_user_id is null or target_user_id = auth.uid() then raise exception 'Administrators cannot change their own roles'; end if;
  select username::text into target_name from public.profiles where id = target_user_id;
  if target_name is null then raise exception 'Player not found'; end if;
  if should_grant then
    insert into public.user_roles(user_id, role, granted_by) values (target_user_id, target_role, auth.uid())
    on conflict (user_id, role) do nothing;
  else
    if target_role = 'admin' and (select count(*) from public.user_roles where role = 'admin') <= 1 then
      raise exception 'Cannot remove the last administrator';
    end if;
    delete from public.user_roles where user_id = target_user_id and role = target_role;
  end if;
  perform public.add_audit_event(case when should_grant then 'role_granted' else 'role_revoked' end, 'user_role', target_user_id,
    jsonb_build_object('role', target_role, 'username', target_name));
end; $$;
revoke all on function public.admin_set_user_role(uuid, public.app_role, boolean) from public, anon;
grant execute on function public.admin_set_user_role(uuid, public.app_role, boolean) to authenticated;

create or replace function public.admin_verify_game_progress(target_progress_id uuid, should_verify boolean)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Administrator role required'; end if;
  update public.player_game_progress
  set verified = should_verify,
      verified_by = case when should_verify then auth.uid() else null end,
      verified_at = case when should_verify then now() else null end
  where id = target_progress_id;
  if not found then raise exception 'Game progress record not found'; end if;
  perform public.add_audit_event(case when should_verify then 'game_progress_verified' else 'game_progress_unverified' end,
    'player_game_progress', target_progress_id, '{}'::jsonb);
end; $$;
revoke all on function public.admin_verify_game_progress(uuid, boolean) from public, anon;
grant execute on function public.admin_verify_game_progress(uuid, boolean) to authenticated;