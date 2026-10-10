-- RESPAWN platform foundation. Apply with `supabase db push` to a new Supabase project.
create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.app_role as enum ('admin', 'organizer', 'moderator');
create type public.tournament_status as enum ('draft', 'registration_open', 'upcoming', 'in_progress', 'completed', 'cancelled');
create type public.participant_status as enum ('registered', 'checked_in', 'eliminated', 'completed', 'withdrawn');
create type public.match_status as enum ('waiting', 'scheduled', 'result_submitted', 'disputed', 'confirmed', 'cancelled');
create type public.content_status as enum ('published', 'pending', 'removed');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext not null unique check (username::text ~ '^[a-zA-Z0-9_]{3,20}$'),
  display_name text check (display_name is null or char_length(display_name) <= 60),
  bio text check (bio is null or char_length(bio) <= 280),
  avatar_url text,
  country text check (country is null or char_length(country) <= 80),
  favorite_games text[] not null default '{}',
  platforms text[] not null default '{}',
  is_private boolean not null default false,
  xp integer not null default 0 check (xp >= 0),
  level integer not null default 1 check (level >= 1),
  account_status text not null default 'active' check (account_status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_xp_desc_idx on public.profiles (xp desc, created_at);
create index profiles_status_idx on public.profiles (account_status);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.genres (
  id uuid primary key default gen_random_uuid(),
  name citext not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 120),
  slug text not null unique,
  description text not null default '' check (char_length(description) <= 10000),
  cover_url text,
  release_date date,
  platforms text[] not null default '{}',
  average_rating numeric(4,2) not null default 0 check (average_rating between 0 and 10),
  review_count integer not null default 0 check (review_count >= 0),
  popularity integer not null default 0 check (popularity >= 0),
  is_published boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index games_published_popularity_idx on public.games (popularity desc) where is_published;
create index games_release_date_idx on public.games (release_date desc);
create index games_title_search_idx on public.games using gin (to_tsvector('english', title || ' ' || description));

create table public.game_genres (
  game_id uuid not null references public.games(id) on delete cascade,
  genre_id uuid not null references public.genres(id) on delete cascade,
  primary key (game_id, genre_id)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 10),
  body text not null check (char_length(body) between 20 and 3000),
  status public.content_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_id)
);
create index reviews_game_created_idx on public.reviews (game_id, created_at desc) where status = 'published';
create index reviews_user_created_idx on public.reviews (user_id, created_at desc);

create table public.review_votes (
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 2 and 2000),
  image_url text,
  status public.content_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_feed_idx on public.posts (created_at desc) where status = 'published';
create index posts_author_idx on public.posts (author_id, created_at desc);
create index posts_search_idx on public.posts using gin (to_tsvector('english', body));

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  status public.content_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index post_comments_post_idx on public.post_comments (post_id, created_at);

create table public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null default 'like' check (reaction in ('like', 'gg', 'fire')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index follows_following_idx on public.follows (following_id, created_at desc);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id) on delete restrict,
  game_id uuid not null references public.games(id) on delete restrict,
  title text not null check (char_length(title) between 4 and 100),
  description text not null default '' check (char_length(description) <= 5000),
  rules text not null default '' check (char_length(rules) <= 10000),
  format text not null default 'single_elimination' check (format = 'single_elimination'),
  start_at timestamptz not null,
  registration_deadline timestamptz not null,
  participant_limit integer not null default 32 check (participant_limit between 2 and 256),
  status public.tournament_status not null default 'draft',
  winner_id uuid references public.profiles(id) on delete set null,
  announcement text check (announcement is null or char_length(announcement) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (registration_deadline <= start_at)
);
create index tournaments_directory_idx on public.tournaments (start_at) where status in ('registration_open','upcoming','in_progress');
create index tournaments_organizer_idx on public.tournaments (organizer_id, created_at desc);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  tag text not null check (char_length(tag) between 2 and 8),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);
create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('captain','member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id);

create table public.tournament_participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  participant_type text not null check (participant_type in ('individual','team')),
  status public.participant_status not null default 'registered',
  seed integer,
  created_at timestamptz not null default now(),
  check ((participant_type = 'individual' and user_id is not null and team_id is null) or (participant_type = 'team' and team_id is not null and user_id is null)),
  unique (tournament_id, user_id),
  unique (tournament_id, team_id)
);
create index tournament_participants_event_idx on public.tournament_participants (tournament_id, created_at);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  match_number integer not null check (match_number > 0),
  player_one_id uuid references public.profiles(id) on delete set null,
  player_two_id uuid references public.profiles(id) on delete set null,
  winner_id uuid references public.profiles(id) on delete set null,
  status public.match_status not null default 'waiting',
  scheduled_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (tournament_id, round_number, match_number),
  check (player_one_id is null or player_two_id is null or player_one_id <> player_two_id),
  check (winner_id is null or winner_id = player_one_id or winner_id = player_two_id)
);
create index matches_tournament_round_idx on public.matches (tournament_id, round_number, match_number);

create table public.match_results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  proposed_by uuid not null references public.profiles(id) on delete cascade,
  winner_id uuid not null references public.profiles(id) on delete restrict,
  player_one_score integer not null check (player_one_score >= 0),
  player_two_score integer not null check (player_two_score >= 0),
  evidence_url text,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected','disputed')),
  created_at timestamptz not null default now(),
  unique (match_id, proposed_by)
);
create index match_results_match_idx on public.match_results (match_id, created_at desc);

create table public.xp_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('profile_complete','post_approved','review_helpful','tournament_verified','achievement_approved')),
  amount integer not null check (amount > 0),
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, event_type, reference_id)
);
create index xp_ledger_user_created_idx on public.xp_ledger (user_id, created_at desc);
create index xp_ledger_created_idx on public.xp_ledger (created_at desc);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  description text not null check (char_length(description) <= 300),
  badge_icon text not null default '✦',
  xp_reward integer not null default 20 check (xp_reward between 0 and 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  awarded_by uuid references public.profiles(id) on delete set null,
  earned_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);
create index user_achievements_user_idx on public.user_achievements (user_id, earned_at desc);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  pair_low uuid not null references public.profiles(id) on delete cascade,
  pair_high uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pair_low < pair_high),
  unique (pair_low, pair_high)
);
create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id, created_at desc);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('follow','comment','reaction','message','tournament','match','achievement','announcement','system')),
  title text not null check (char_length(title) <= 120),
  body text not null default '' check (char_length(body) <= 500),
  href text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  subject_type text not null check (subject_type in ('user','post','comment','review','tournament','match')),
  subject_id uuid not null,
  reason text not null check (char_length(reason) between 2 and 120),
  details text not null default '' check (char_length(details) <= 1000),
  status public.report_status not null default 'open',
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution text check (resolution is null or char_length(resolution) <= 1000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (reporter_id, subject_type, subject_id)
);
create index reports_queue_idx on public.reports (status, created_at);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (char_length(action) between 2 and 100),
  target_type text not null check (char_length(target_type) <= 80),
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_created_idx on public.admin_audit_logs (created_at desc);

-- Helpers run with a fixed search_path and are the only route for role checks.
create or replace function public.has_role(target_user_id uuid, required_role public.app_role)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.user_roles r where r.user_id = target_user_id and r.role = required_role); $$;
revoke all on function public.has_role(uuid, public.app_role) from public;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

create or replace function public.current_user_has_role(required_role public.app_role)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select public.has_role(auth.uid(), required_role); $$;
revoke all on function public.current_user_has_role(public.app_role) from public;
grant execute on function public.current_user_has_role(public.app_role) to anon, authenticated;

create or replace function public.is_active_member(target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.profiles p where p.id = target_user_id and p.account_status = 'active'); $$;
revoke all on function public.is_active_member(uuid) from public;
grant execute on function public.is_active_member(uuid) to authenticated;

create or replace function public.is_blocked_between(first_user uuid, second_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.user_blocks b where (b.blocker_id = first_user and b.blocked_id = second_user) or (b.blocker_id = second_user and b.blocked_id = first_user)); $$;
revoke all on function public.is_blocked_between(uuid, uuid) from public;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

create or replace function public.is_conversation_member(target_conversation_id uuid, target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.conversation_members cm where cm.conversation_id = target_conversation_id and cm.user_id = target_user_id); $$;
revoke all on function public.is_conversation_member(uuid, uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;

create or replace function public.is_conversation_peer(target_user_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (
  select 1 from public.conversation_members mine
  join public.conversation_members peer on peer.conversation_id = mine.conversation_id
  where mine.user_id = auth.uid() and peer.user_id = target_user_id
); $$;
revoke all on function public.is_conversation_peer(uuid) from public, anon;
grant execute on function public.is_conversation_peer(uuid) to anon, authenticated;

create or replace function public.can_view_author_posts(target_author_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select auth.uid() is null or not public.is_blocked_between(auth.uid(), target_author_id); $$;
revoke all on function public.can_view_author_posts(uuid) from public;
grant execute on function public.can_view_author_posts(uuid) to anon, authenticated;

create or replace function public.xp_amount(event_name text)
returns integer language sql immutable security invoker set search_path = public, pg_temp
as $$ select case event_name when 'profile_complete' then 50 when 'post_approved' then 10 when 'review_helpful' then 2 when 'tournament_verified' then 25 when 'achievement_approved' then 20 else 0 end; $$;
revoke all on function public.xp_amount(text) from public, anon;
grant execute on function public.xp_amount(text) to authenticated;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp
as $$ begin new.updated_at = now(); return new; end; $$;

create or replace function public.bootstrap_profile()
returns trigger language plpgsql security definer set search_path = public, auth, pg_temp
as $$
declare candidate text; base_name text; suffix text := ''; attempt integer := 0;
begin
  base_name := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(coalesce(new.email, 'player'), '@', 1)), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base_name) < 3 then base_name := 'player_' || substr(replace(new.id::text, '-', ''), 1, 8); end if;
  base_name := substr(base_name, 1, 16);
  loop
    candidate := substr(base_name, 1, 20 - char_length(suffix)) || suffix;
    exit when not exists (select 1 from public.profiles p where p.username = candidate);
    attempt := attempt + 1; suffix := '_' || substr(replace(new.id::text, '-', ''), 1, least(3 + attempt, 8));
    if attempt > 5 then suffix := '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8); end if;
  end loop;
  insert into public.profiles(id, username, display_name) values (new.id, candidate, nullif(new.raw_user_meta_data->>'display_name', ''));
  return new;
end; $$;
create trigger on_auth_user_created_profile after insert on auth.users for each row execute function public.bootstrap_profile();

-- XP amounts are fixed here. Clients cannot write ledger entries or profile XP.
create or replace function public.apply_xp(target_user uuid, kind text, ref_id uuid, extra jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare value integer;
begin
  value := public.xp_amount(kind);
  if value <= 0 or target_user is null or ref_id is null then return; end if;
  insert into public.xp_ledger(user_id, event_type, amount, reference_id, metadata)
  values (target_user, kind, value, ref_id, coalesce(extra, '{}'::jsonb)) on conflict (user_id, event_type, reference_id) do nothing;
  if found then
    update public.profiles set xp = xp + value, level = 1 + floor((xp + value)::numeric / 1000)::integer where id = target_user;
  end if;
end; $$;
revoke all on function public.apply_xp(uuid, text, uuid, jsonb) from public, anon, authenticated;

create or replace function public.profile_completion_xp()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if old.bio is null and new.bio is not null and char_length(new.bio) >= 20 and cardinality(new.platforms) > 0 then
    perform public.apply_xp(new.id, 'profile_complete', new.id, jsonb_build_object('source', 'profile_completion'));
  end if;
  return new;
end; $$;

create or replace function public.post_approval_xp()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$ begin
  if old.status <> 'published' and new.status = 'published' then perform public.apply_xp(new.author_id, 'post_approved', new.id, jsonb_build_object('source', 'moderated_post')); end if;
  return new;
end; $$;

create or replace function public.helpful_review_xp()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare author uuid;
begin
  select r.user_id into author from public.reviews r where r.id = new.review_id and r.status = 'published';
  if author is not null and author <> new.user_id then perform public.apply_xp(author, 'review_helpful', new.review_id, jsonb_build_object('first_helpful_vote_by', new.user_id)); end if;
  return new;
end; $$;

create or replace function public.achievement_xp()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare reward integer;
begin
  select xp_reward into reward from public.achievements where id = new.achievement_id and is_active;
  if coalesce(reward, 0) > 0 then
    insert into public.xp_ledger(user_id, event_type, amount, reference_id, metadata) values (new.user_id, 'achievement_approved', reward, new.achievement_id, jsonb_build_object('user_achievement_id', new.id)) on conflict do nothing;
    if found then update public.profiles set xp = xp + reward, level = 1 + floor((xp + reward)::numeric / 1000)::integer where id = new.user_id; end if;
  end if;
  return new;
end; $$;

create or replace function public.verified_tournament_xp()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' and new.user_id is not null then perform public.apply_xp(new.user_id, 'tournament_verified', new.tournament_id, jsonb_build_object('participant_id', new.id)); end if;
  return new;
end; $$;

create or replace function public.update_game_review_totals()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare target_game uuid;
begin
  target_game := coalesce(new.game_id, old.game_id);
  update public.games g set review_count = q.count, average_rating = coalesce(q.average, 0)
  from (select count(*)::integer as count, round(avg(rating), 2) as average from public.reviews where game_id = target_game and status = 'published') q
  where g.id = target_game;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;

create or replace function public.create_notification(target uuid, actor uuid, kind text, heading text, content text, destination text)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if target is null or actor is null or target = actor or public.is_blocked_between(target, actor) then return; end if;
  insert into public.notifications(user_id, actor_id, type, title, body, href) values (target, actor, kind, left(heading, 120), left(content, 500), destination);
end; $$;
revoke all on function public.create_notification(uuid, uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.notify_follow()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$ declare handle text; begin select username::text into handle from public.profiles where id = new.follower_id; perform public.create_notification(new.following_id, new.follower_id, 'follow', 'New player followed you', '@' || coalesce(handle, 'A player') || ' is now following you.', '/players/' || handle); return new; end; $$;
create or replace function public.notify_comment()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$ declare owner_id uuid; begin select author_id into owner_id from public.posts where id = new.post_id; perform public.create_notification(owner_id, new.author_id, 'comment', 'New comment on your post', left(new.body, 180), '/community'); return new; end; $$;
create or replace function public.notify_reaction()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$ declare owner_id uuid; begin select author_id into owner_id from public.posts where id = new.post_id; perform public.create_notification(owner_id, new.user_id, 'reaction', 'Someone reacted to your post', 'A player reacted to your community post.', '/community'); return new; end; $$;
create or replace function public.notify_message()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$ declare receiver uuid; handle text; begin
  select cm.user_id into receiver from public.conversation_members cm where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id limit 1;
  select username::text into handle from public.profiles where id = new.sender_id;
  perform public.create_notification(receiver, new.sender_id, 'message', 'New message', 'New message from @' || coalesce(handle, 'player') || '.', '/messages');
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end; $$;

create or replace function public.get_or_create_conversation(target_user_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare caller uuid := auth.uid(); low_id uuid; high_id uuid; result uuid;
begin
  if caller is null or target_user_id is null or caller = target_user_id then raise exception 'Invalid conversation participants'; end if;
  if not public.is_active_member(caller) or not public.is_active_member(target_user_id) then raise exception 'Account unavailable'; end if;
  if public.is_blocked_between(caller, target_user_id) then raise exception 'Messaging is unavailable between these players'; end if;
  low_id := least(caller, target_user_id); high_id := greatest(caller, target_user_id);
  insert into public.conversations(pair_low, pair_high) values (low_id, high_id) on conflict (pair_low, pair_high) do update set updated_at = public.conversations.updated_at returning id into result;
  insert into public.conversation_members(conversation_id, user_id) values (result, low_id), (result, high_id) on conflict do nothing;
  return result;
end; $$;
revoke all on function public.get_or_create_conversation(uuid) from public, anon;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;

create or replace function public.mark_conversation_read(target_conversation_id uuid)
returns void language sql security definer set search_path = public, pg_temp
as $$ update public.conversation_members set last_read_at = now() where conversation_id = target_conversation_id and user_id = auth.uid(); $$;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

create or replace function public.add_audit_event(kind text, object_type text, object_id uuid, extra jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$ begin insert into public.admin_audit_logs(admin_id, action, target_type, target_id, metadata) values (auth.uid(), left(kind, 100), left(object_type, 80), object_id, coalesce(extra, '{}'::jsonb)); end; $$;
revoke all on function public.add_audit_event(text, text, uuid, jsonb) from public, anon, authenticated;

create or replace function public.resolve_report(target_report_id uuid, resolution text)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare next_status public.report_status;
begin
  if not public.has_role(auth.uid(), 'admin') and not public.has_role(auth.uid(), 'moderator') then raise exception 'Moderator role required'; end if;
  if resolution not in ('resolved','dismissed') then raise exception 'Invalid report resolution'; end if;
  next_status := resolution::public.report_status;
  update public.reports set status = next_status, resolved_by = auth.uid(), resolved_at = now(), resolution = left(resolution, 1000) where id = target_report_id and status in ('open','reviewing');
  if not found then raise exception 'Report is not open'; end if;
  perform public.add_audit_event('report_' || resolution, 'report', target_report_id, '{}'::jsonb);
end; $$;
revoke all on function public.resolve_report(uuid, text) from public, anon;
grant execute on function public.resolve_report(uuid, text) to authenticated;

create or replace function public.admin_moderate_content(subject_kind text, subject_uuid uuid, next_status public.content_status, note text default '')
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.has_role(auth.uid(), 'admin') and not public.has_role(auth.uid(), 'moderator') then raise exception 'Moderator role required'; end if;
  if subject_kind = 'post' then
    update public.posts set status = next_status where id = subject_uuid;
  elsif subject_kind = 'review' then
    update public.reviews set status = next_status where id = subject_uuid;
  elsif subject_kind = 'comment' then
    update public.post_comments set status = next_status where id = subject_uuid;
  else
    raise exception 'Unsupported content type';
  end if;
  if not found then raise exception 'Content not found'; end if;
  perform public.add_audit_event('content_' || next_status::text, subject_kind, subject_uuid, jsonb_build_object('note', left(note, 500)));
end; $$;
revoke all on function public.admin_moderate_content(text, uuid, public.content_status, text) from public, anon;
grant execute on function public.admin_moderate_content(text, uuid, public.content_status, text) to authenticated;

create or replace function public.admin_set_account_status(target_user_id uuid, next_status text, note text default '')
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Administrator role required'; end if;
  if target_user_id = auth.uid() then raise exception 'Administrators cannot suspend their own account'; end if;
  if next_status not in ('active','suspended') then raise exception 'Invalid account status'; end if;
  update public.profiles set account_status = next_status where id = target_user_id;
  if not found then raise exception 'Player not found'; end if;
  perform public.add_audit_event('account_' || next_status, 'profile', target_user_id, jsonb_build_object('note', left(note, 500)));
end; $$;
revoke all on function public.admin_set_account_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_account_status(uuid, text, text) to authenticated;

create or replace function public.register_tournament_entry()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare event_row public.tournaments%rowtype; current_count integer;
begin
  select * into event_row from public.tournaments where id = new.tournament_id for update;
  if event_row.id is null or event_row.status <> 'registration_open' or event_row.registration_deadline <= now() then raise exception 'Registration is closed'; end if;
  if not public.is_active_member(coalesce(new.user_id, auth.uid())) then raise exception 'Active account required'; end if;
  select count(*) into current_count from public.tournament_participants where tournament_id = new.tournament_id and status not in ('withdrawn');
  if current_count >= event_row.participant_limit then raise exception 'Tournament is full'; end if;
  if new.participant_type = 'individual' and new.user_id <> auth.uid() and not public.has_role(auth.uid(), 'admin') and not public.has_role(auth.uid(), 'organizer') then raise exception 'You can only register yourself'; end if;
  if new.participant_type = 'team' and not exists (select 1 from public.team_members tm where tm.team_id = new.team_id and tm.user_id = auth.uid() and tm.member_role = 'captain') then raise exception 'Team captain required'; end if;
  return new;
end; $$;

create or replace function public.generate_single_elimination(target_tournament_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare event_row public.tournaments%rowtype; entrants uuid[]; entrant_count integer; i integer; rounds integer := 0; total integer; round_matches integer;
begin
  if not public.has_role(auth.uid(), 'admin') and not public.has_role(auth.uid(), 'organizer') then raise exception 'Organizer role required'; end if;
  select * into event_row from public.tournaments where id = target_tournament_id for update;
  if event_row.id is null or (event_row.organizer_id <> auth.uid() and not public.has_role(auth.uid(), 'admin')) then raise exception 'Tournament not found or unauthorized'; end if;
  if event_row.status not in ('registration_open','upcoming') then raise exception 'Tournament is not ready for a bracket'; end if;
  select array_agg(user_id order by created_at, id) into entrants from public.tournament_participants where tournament_id = target_tournament_id and participant_type = 'individual' and status = 'registered';
  entrant_count := coalesce(array_length(entrants, 1), 0);
  if entrant_count < 2 or (entrant_count & (entrant_count - 1)) <> 0 then raise exception 'The first bracket release requires a power-of-two number of individual entrants (2, 4, 8, 16, ...)'; end if;
  if exists (select 1 from public.matches where tournament_id = target_tournament_id) then raise exception 'Bracket already generated'; end if;
  total := entrant_count; round_matches := entrant_count / 2;
  while total > 1 loop
    rounds := rounds + 1;
    for i in 1..round_matches loop
      if rounds = 1 then
        insert into public.matches(tournament_id, round_number, match_number, player_one_id, player_two_id, status)
        values (target_tournament_id, rounds, i, entrants[(i * 2) - 1], entrants[i * 2], 'scheduled');
      else
        insert into public.matches(tournament_id, round_number, match_number, status) values (target_tournament_id, rounds, i, 'waiting');
      end if;
    end loop;
    total := total / 2; round_matches := greatest(1, total / 2);
  end loop;
  update public.tournaments set status = 'in_progress' where id = target_tournament_id;
  perform public.add_audit_event('tournament_bracket_generated', 'tournament', target_tournament_id, jsonb_build_object('entrants', entrant_count, 'rounds', rounds));
  return rounds;
end; $$;
revoke all on function public.generate_single_elimination(uuid) from public, anon;
grant execute on function public.generate_single_elimination(uuid) to authenticated;

create or replace function public.submit_match_result(target_match_id uuid, selected_winner uuid, score_one integer, score_two integer, proof_url text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare match_row public.matches%rowtype; result_id uuid; user_is_organizer boolean;
begin
  select * into match_row from public.matches where id = target_match_id for update;
  if match_row.id is null or match_row.status not in ('scheduled','result_submitted','disputed') then raise exception 'Match is unavailable for result submission'; end if;
  user_is_organizer := public.has_role(auth.uid(), 'admin') or (public.has_role(auth.uid(), 'organizer') and exists (select 1 from public.tournaments t where t.id = match_row.tournament_id and t.organizer_id = auth.uid()));
  if auth.uid() not in (match_row.player_one_id, match_row.player_two_id) and not user_is_organizer then raise exception 'Only match participants or its organizer can submit a result'; end if;
  if selected_winner not in (match_row.player_one_id, match_row.player_two_id) or score_one = score_two then raise exception 'Winner and score are invalid'; end if;
  insert into public.match_results(match_id, proposed_by, winner_id, player_one_score, player_two_score, evidence_url, status)
  values (target_match_id, auth.uid(), selected_winner, score_one, score_two, proof_url, 'pending')
  on conflict (match_id, proposed_by) do update set winner_id = excluded.winner_id, player_one_score = excluded.player_one_score, player_two_score = excluded.player_two_score, evidence_url = excluded.evidence_url, status = 'pending', created_at = now()
  returning id into result_id;
  update public.matches set status = 'result_submitted', updated_at = now() where id = target_match_id;
  return result_id;
end; $$;
revoke all on function public.submit_match_result(uuid, uuid, integer, integer, text) from public, anon;
grant execute on function public.submit_match_result(uuid, uuid, integer, integer, text) to authenticated;

create or replace function public.confirm_match_result(target_match_id uuid, target_result_id uuid, accept_result boolean)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare match_row public.matches%rowtype; result_row public.match_results%rowtype; event_owner uuid; user_is_organizer boolean; round_count integer;
begin
  select * into match_row from public.matches where id = target_match_id for update;
  select * into result_row from public.match_results where id = target_result_id and match_id = target_match_id for update;
  if match_row.id is null or result_row.id is null or result_row.status <> 'pending' then raise exception 'Pending result not found'; end if;
  select organizer_id into event_owner from public.tournaments where id = match_row.tournament_id;
  user_is_organizer := public.has_role(auth.uid(), 'admin') or (public.has_role(auth.uid(), 'organizer') and event_owner = auth.uid());
  if auth.uid() = result_row.proposed_by then raise exception 'Submitter cannot confirm their own result'; end if;
  if auth.uid() not in (match_row.player_one_id, match_row.player_two_id) and not user_is_organizer then raise exception 'Only the opponent or tournament organizer may confirm'; end if;
  if accept_result then
    update public.match_results set status = 'confirmed' where id = target_result_id;
    update public.matches set status = 'confirmed', winner_id = result_row.winner_id, updated_at = now() where id = target_match_id;
    update public.tournament_participants set status = 'completed' where tournament_id = match_row.tournament_id and user_id in (match_row.player_one_id, match_row.player_two_id) and user_id <> result_row.winner_id;
    if match_row.round_number > 0 then
      if mod(match_row.match_number, 2) = 1 then
        update public.matches set player_one_id = result_row.winner_id, status = 'scheduled' where tournament_id = match_row.tournament_id and round_number = match_row.round_number + 1 and match_number = ceil(match_row.match_number::numeric / 2) and status = 'waiting';
      else
        update public.matches set player_two_id = result_row.winner_id, status = case when player_one_id is not null then 'scheduled' else 'waiting' end where tournament_id = match_row.tournament_id and round_number = match_row.round_number + 1 and match_number = ceil(match_row.match_number::numeric / 2) and status = 'waiting';
      end if;
    end if;
    select count(*) into round_count from public.matches where tournament_id = match_row.tournament_id and round_number = match_row.round_number and status <> 'confirmed';
    if round_count = 0 and not exists (select 1 from public.matches where tournament_id = match_row.tournament_id and round_number > match_row.round_number) then
      update public.tournaments set winner_id = result_row.winner_id, status = 'completed' where id = match_row.tournament_id;
      update public.tournament_participants set status = 'completed' where tournament_id = match_row.tournament_id and user_id = result_row.winner_id;
    end if;
  else
    update public.match_results set status = 'disputed' where id = target_result_id;
    update public.matches set status = 'disputed', updated_at = now() where id = target_match_id;
    insert into public.reports(reporter_id, subject_type, subject_id, reason, details) values (auth.uid(), 'match', target_match_id, 'Match result dispute', 'A submitted match result was disputed.') on conflict do nothing;
  end if;
end; $$;
revoke all on function public.confirm_match_result(uuid, uuid, boolean) from public, anon;
grant execute on function public.confirm_match_result(uuid, uuid, boolean) to authenticated;

-- Timestamp, aggregate, XP, and notification triggers.
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger games_updated_at before update on public.games for each row execute function public.set_updated_at();
create trigger reviews_updated_at before update on public.reviews for each row execute function public.set_updated_at();
create trigger posts_updated_at before update on public.posts for each row execute function public.set_updated_at();
create trigger comments_updated_at before update on public.post_comments for each row execute function public.set_updated_at();
create trigger tournaments_updated_at before update on public.tournaments for each row execute function public.set_updated_at();
create trigger matches_updated_at before update on public.matches for each row execute function public.set_updated_at();
create trigger profile_completion_award after update of bio, platforms on public.profiles for each row execute function public.profile_completion_xp();
create trigger approved_post_award after update of status on public.posts for each row execute function public.post_approval_xp();
create trigger review_aggregate_insert after insert on public.reviews for each row execute function public.update_game_review_totals();
create trigger review_aggregate_update after update of rating, status on public.reviews for each row execute function public.update_game_review_totals();
create trigger review_aggregate_delete after delete on public.reviews for each row execute function public.update_game_review_totals();
create trigger review_helpful_award after insert on public.review_votes for each row execute function public.helpful_review_xp();
create trigger user_achievement_award after insert on public.user_achievements for each row execute function public.achievement_xp();
create trigger tournament_verified_award after update of status on public.tournament_participants for each row execute function public.verified_tournament_xp();
create trigger tournament_registration_guard before insert on public.tournament_participants for each row execute function public.register_tournament_entry();
create trigger follow_notification after insert on public.follows for each row execute function public.notify_follow();
create trigger comment_notification after insert on public.post_comments for each row execute function public.notify_comment();
create trigger reaction_notification after insert on public.post_reactions for each row execute function public.notify_reaction();
create trigger message_notification after insert on public.messages for each row execute function public.notify_message();

-- Public-facing relations use least-privilege, explicit Row Level Security.
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.genres enable row level security;
alter table public.games enable row level security;
alter table public.game_genres enable row level security;
alter table public.reviews enable row level security;
alter table public.review_votes enable row level security;
alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_reactions enable row level security;
alter table public.follows enable row level security;
alter table public.user_blocks enable row level security;
alter table public.tournaments enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.tournament_participants enable row level security;
alter table public.matches enable row level security;
alter table public.match_results enable row level security;
alter table public.xp_ledger enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.admin_audit_logs enable row level security;

create policy profiles_read_public on public.profiles for select to anon, authenticated using (account_status = 'active' and (not is_private or id = auth.uid() or public.current_user_has_role('admin') or public.is_conversation_peer(id) or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = id)));
create policy profiles_read_owner on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_owner on public.profiles for update to authenticated using (id = auth.uid() and account_status = 'active') with check (id = auth.uid());
create policy profiles_admin_read on public.profiles for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy roles_admin_read on public.user_roles for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy genres_public_read on public.genres for select to anon, authenticated using (true);
create policy games_published_read on public.games for select to anon, authenticated using (is_published or public.current_user_has_role('admin'));
create policy games_admin_insert on public.games for insert to authenticated with check (public.has_role(auth.uid(), 'admin') and created_by = auth.uid());
create policy games_admin_update on public.games for update to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy games_admin_delete on public.games for delete to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy game_genres_public_read on public.game_genres for select to anon, authenticated using (exists (select 1 from public.games g where g.id = game_id and g.is_published));
create policy reviews_read_published on public.reviews for select to anon, authenticated using (status = 'published' or user_id = auth.uid() or public.current_user_has_role('moderator') or public.current_user_has_role('admin'));
create policy reviews_insert_self on public.reviews for insert to authenticated with check (user_id = auth.uid() and public.is_active_member() and exists (select 1 from public.games g where g.id = game_id and g.is_published));
create policy reviews_update_self on public.reviews for update to authenticated using (user_id = auth.uid() and status <> 'removed') with check (user_id = auth.uid());
create policy reviews_moderator_update on public.reviews for update to authenticated using (public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin'));
create policy reviews_delete_self on public.reviews for delete to authenticated using (user_id = auth.uid());
create policy review_votes_read on public.review_votes for select to anon, authenticated using (true);
create policy review_votes_insert_self on public.review_votes for insert to authenticated with check (user_id = auth.uid() and public.is_active_member() and exists (select 1 from public.reviews r where r.id = review_id and r.status = 'published' and r.user_id <> auth.uid()));
create policy review_votes_delete_self on public.review_votes for delete to authenticated using (user_id = auth.uid());
create policy posts_read_published on public.posts for select to anon, authenticated using ((status = 'published' and public.can_view_author_posts(author_id)) or author_id = auth.uid() or public.current_user_has_role('moderator') or public.current_user_has_role('admin'));
create policy posts_insert_self on public.posts for insert to authenticated with check (author_id = auth.uid() and public.is_active_member() and status = 'published');
create policy posts_update_self on public.posts for update to authenticated using (author_id = auth.uid() and status = 'published') with check (author_id = auth.uid());
create policy posts_moderator_update on public.posts for update to authenticated using (public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin'));
create policy posts_delete_author on public.posts for delete to authenticated using (author_id = auth.uid() or public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin'));
create policy comments_read_published on public.post_comments for select to anon, authenticated using (status = 'published' or author_id = auth.uid() or public.current_user_has_role('moderator') or public.current_user_has_role('admin'));
create policy comments_insert_self on public.post_comments for insert to authenticated with check (author_id = auth.uid() and public.is_active_member() and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published'));
create policy comments_update_self on public.post_comments for update to authenticated using (author_id = auth.uid() and status = 'published') with check (author_id = auth.uid());
create policy comments_delete_author_mod on public.post_comments for delete to authenticated using (author_id = auth.uid() or public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin'));
create policy reactions_read on public.post_reactions for select to anon, authenticated using (true);
create policy reactions_insert_self on public.post_reactions for insert to authenticated with check (user_id = auth.uid() and public.is_active_member() and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published' and p.author_id <> auth.uid()));
create policy reactions_delete_self on public.post_reactions for delete to authenticated using (user_id = auth.uid());
create policy follows_read on public.follows for select to anon, authenticated using (true);
create policy follows_insert_self on public.follows for insert to authenticated with check (follower_id = auth.uid() and public.is_active_member() and not public.is_blocked_between(follower_id, following_id));
create policy follows_delete_self on public.follows for delete to authenticated using (follower_id = auth.uid());
create policy blocks_read_self on public.user_blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_insert_self on public.user_blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy blocks_delete_self on public.user_blocks for delete to authenticated using (blocker_id = auth.uid());
create policy tournaments_public_read on public.tournaments for select to anon, authenticated using (status <> 'draft' or organizer_id = auth.uid() or public.current_user_has_role('admin'));
create policy tournaments_organizer_insert on public.tournaments for insert to authenticated with check ((public.has_role(auth.uid(), 'organizer') or public.has_role(auth.uid(), 'admin')) and organizer_id = auth.uid() and public.is_active_member());
create policy tournaments_organizer_update on public.tournaments for update to authenticated using (organizer_id = auth.uid() and (public.has_role(auth.uid(), 'organizer') or public.has_role(auth.uid(), 'admin'))) with check (organizer_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy tournaments_admin_update on public.tournaments for update to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy teams_read on public.teams for select to anon, authenticated using (true);
create policy teams_insert_owner on public.teams for insert to authenticated with check (owner_id = auth.uid() and public.is_active_member());
create policy teams_update_owner on public.teams for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy team_members_read on public.team_members for select to anon, authenticated using (true);
create policy team_members_captain_manage on public.team_members for all to authenticated using (exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid())) with check (exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid()));
create policy participants_public_read on public.tournament_participants for select to anon, authenticated using (exists (select 1 from public.tournaments t where t.id = tournament_id and t.status <> 'draft') or user_id = auth.uid() or public.current_user_has_role('admin'));
create policy participants_insert_self on public.tournament_participants for insert to authenticated with check (public.is_active_member() and ((participant_type = 'individual' and user_id = auth.uid() and team_id is null) or (participant_type = 'team' and user_id is null and exists (select 1 from public.team_members tm where tm.team_id = tournament_participants.team_id and tm.user_id = auth.uid() and tm.member_role = 'captain'))));
create policy participants_withdraw_self on public.tournament_participants for update to authenticated using (user_id = auth.uid() and status = 'registered') with check (user_id = auth.uid() and status = 'withdrawn');
create policy matches_public_read on public.matches for select to anon, authenticated using (exists (select 1 from public.tournaments t where t.id = tournament_id and t.status <> 'draft') or public.current_user_has_role('admin'));
create policy match_results_participant_read on public.match_results for select to authenticated using (proposed_by = auth.uid() or exists (select 1 from public.matches m where m.id = match_id and (m.player_one_id = auth.uid() or m.player_two_id = auth.uid())) or public.has_role(auth.uid(), 'organizer') or public.has_role(auth.uid(), 'admin'));
create policy xp_read_public on public.xp_ledger for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy achievements_read_active on public.achievements for select to anon, authenticated using (is_active);
create policy achievements_admin_manage on public.achievements for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy user_achievements_read on public.user_achievements for select to anon, authenticated using (exists (select 1 from public.profiles p where p.id = user_id and (not p.is_private or p.id = auth.uid())) or public.current_user_has_role('admin'));
create policy user_achievements_admin_insert on public.user_achievements for insert to authenticated with check (public.has_role(auth.uid(), 'admin') and awarded_by = auth.uid());
create policy conversations_members_read on public.conversations for select to authenticated using (exists (select 1 from public.conversation_members cm where cm.conversation_id = id and cm.user_id = auth.uid()));
create policy conversation_members_self_read on public.conversation_members for select to authenticated using (public.is_conversation_member(conversation_id));
create policy conversation_members_self_update on public.conversation_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy messages_members_read on public.messages for select to authenticated using (public.is_conversation_member(conversation_id) and not exists (select 1 from public.conversation_members other where other.conversation_id = conversation_id and other.user_id <> auth.uid() and public.is_blocked_between(auth.uid(), other.user_id)));
create policy messages_member_insert on public.messages for insert to authenticated with check (sender_id = auth.uid() and public.is_active_member() and public.is_conversation_member(conversation_id) and not exists (select 1 from public.conversation_members other where other.conversation_id = conversation_id and other.user_id <> auth.uid() and public.is_blocked_between(auth.uid(), other.user_id)));
create policy notifications_recipient_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_recipient_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reports_insert_self on public.reports for insert to authenticated with check (reporter_id = auth.uid() and public.is_active_member() and not exists (select 1 from public.reports prior where prior.reporter_id = auth.uid() and prior.subject_type = subject_type and prior.subject_id = subject_id));
create policy reports_admin_read on public.reports for select to authenticated using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'moderator'));
create policy audit_admin_read on public.admin_audit_logs for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Explicit grants. No client has a table-level UPDATE grant on protected rows.
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.genres, public.games, public.game_genres, public.reviews, public.review_votes, public.posts, public.post_comments, public.post_reactions, public.follows, public.tournaments, public.teams, public.team_members, public.tournament_participants, public.matches, public.achievements, public.user_achievements to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant select on public.notifications, public.conversations, public.conversation_members, public.messages, public.xp_ledger, public.reports, public.admin_audit_logs, public.user_roles, public.match_results to authenticated;
grant insert (game_id,user_id,rating,body) on public.reviews to authenticated;
grant update (rating,body) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;
grant insert (review_id,user_id) on public.review_votes to authenticated;
grant delete on public.review_votes to authenticated;
grant insert (author_id,body,image_url) on public.posts to authenticated;
grant update (body,image_url) on public.posts to authenticated;
grant delete on public.posts to authenticated;
grant insert (post_id,author_id,body) on public.post_comments to authenticated;
grant update (body) on public.post_comments to authenticated;
grant delete on public.post_comments to authenticated;
grant insert (post_id,user_id,reaction) on public.post_reactions to authenticated;
grant delete on public.post_reactions to authenticated;
grant insert (follower_id,following_id) on public.follows to authenticated;
grant delete on public.follows to authenticated;
grant insert (blocker_id,blocked_id) on public.user_blocks to authenticated;
grant delete on public.user_blocks to authenticated;
grant update (username,display_name,bio,avatar_url,country,favorite_games,platforms,is_private) on public.profiles to authenticated;
grant insert (id,username,display_name) on public.profiles to authenticated;
grant update (is_read) on public.notifications to authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;
grant insert (conversation_id,sender_id,body) on public.messages to authenticated;
grant insert (organizer_id,game_id,title,description,rules,format,start_at,registration_deadline,participant_limit,status) on public.tournaments to authenticated;
grant update (title,description,rules,start_at,registration_deadline,participant_limit,status,announcement) on public.tournaments to authenticated;
grant insert (name,tag,owner_id) on public.teams to authenticated;
grant update (name,tag) on public.teams to authenticated;
grant select, insert, update, delete on public.team_members to authenticated;
grant insert (tournament_id,user_id,team_id,participant_type) on public.tournament_participants to authenticated;
grant update (status) on public.tournament_participants to authenticated;
grant insert (reporter_id,subject_type,subject_id,reason,details) on public.reports to authenticated;
grant insert (title,slug,description,cover_url,release_date,platforms,popularity,is_published,created_by) on public.games to authenticated;
grant update (title,slug,description,cover_url,release_date,platforms,popularity,is_published) on public.games to authenticated;
grant delete on public.games to authenticated;
grant insert, update, delete on public.achievements to authenticated;
grant insert (user_id,achievement_id,awarded_by) on public.user_achievements to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- No client may insert or mutate XP, match rows/results, role grants, or audit history directly.
revoke insert, update, delete on public.xp_ledger, public.matches, public.match_results, public.admin_audit_logs, public.user_roles, public.conversations, public.conversation_members, public.notifications from anon, authenticated;

-- Image buckets: public reads, owner-folder writes; bucket restrictions are enforced by Storage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars','avatars',true,5242880,array['image/jpeg','image/png','image/webp']), ('community-media','community-media',true,8388608,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy avatar_images_public_read on storage.objects for select to anon, authenticated using (bucket_id = 'avatars');
create policy avatar_images_owner_insert on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatar_images_owner_delete on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy community_media_public_read on storage.objects for select to anon, authenticated using (bucket_id = 'community-media');
create policy community_media_owner_insert on storage.objects for insert to authenticated with check (bucket_id = 'community-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy community_media_owner_delete on storage.objects for delete to authenticated using (bucket_id = 'community-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- Realtime delivery is authorized by messages SELECT RLS; clients subscribe only to their conversation.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;

-- Editable catalog seed. Covers are licensed Unsplash stock photography, not game box art.
insert into public.genres (name,slug) values
 ('Action','action'),('Adventure','adventure'),('RPG','rpg'),('Shooter','shooter'),('Strategy','strategy'),('Sports','sports'),('Indie','indie'),('Racing','racing')
on conflict (slug) do nothing;
insert into public.games (id,title,slug,description,cover_url,release_date,platforms,popularity,is_published) values
 ('10000000-0000-4000-8000-000000000006','Call of Duty Mobile','call-of-duty-mobile','Fast, social FPS action built for mobile with ranked play, operators, and squad-based firefights.','https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=900&q=80','2019-10-01',array['Android','iOS'],96,true),
 ('10000000-0000-4000-8000-000000000007','Delta Force','delta-force','A tactical mobile shooter focused on high-intensity engagements, squad tactics, and objective control.','https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=900&q=80','2024-01-17',array['Android','iOS'],88,true),
 ('10000000-0000-4000-8000-000000000008','PUBG Mobile','pubg-mobile','Battle royale matches built around looting, rotating, and surviving until the final circle.','https://images.unsplash.com/photo-1560253023-3ec5d502959f?auto=format&fit=crop&w=900&q=80','2018-03-19',array['Android','iOS'],94,true),
 ('10000000-0000-4000-8000-000000000009','eFootball','efootball','Competitive football action with live club identity, match simulation, and mobile-friendly tactics.','https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=900&q=80','2022-09-14',array['Android','iOS'],81,true),
 ('10000000-0000-4000-8000-000000000010','Free Fire','free-fire','A highly mobile battle royale with quick drops, loot loops, and close-quarters survival pressure.','https://images.unsplash.com/photo-1535223289827-42f1e9919769?auto=format&fit=crop&w=900&q=80','2017-12-04',array['Android','iOS'],90,true),
 ('10000000-0000-4000-8000-000000000011','Blood Strike','blood-strike','A tactical shooter with armory loadouts, ranked pressure, and short-form combat sessions designed for mobile.','https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=900&q=80','2021-07-11',array['Android','iOS'],85,true)
on conflict (slug) do nothing;
insert into public.game_genres (game_id,genre_id)
select g.id, gen.id from public.games g join public.genres gen on gen.slug = any(case g.slug when 'call-of-duty-mobile' then array['shooter','action'] when 'delta-force' then array['shooter','strategy'] when 'pubg-mobile' then array['shooter','action'] when 'efootball' then array['sports'] when 'free-fire' then array['shooter','action'] when 'blood-strike' then array['shooter','action'] else array[]::text[] end)
on conflict do nothing;
insert into public.achievements (slug,name,description,badge_icon,xp_reward) values
 ('first-steps','First Steps','Set up a complete player profile.','✦',20),
 ('community-voice','Community Voice','Share your first approved community post.','◈',20),
 ('helpful-critic','Helpful Critic','Have a review marked helpful by another player.','★',20),
 ('bracket-breaker','Bracket Breaker','Complete a verified tournament.','♜',50),
 ('squad-builder','Squad Builder','Follow five players and build your network.','⌘',20)
on conflict (slug) do nothing;
