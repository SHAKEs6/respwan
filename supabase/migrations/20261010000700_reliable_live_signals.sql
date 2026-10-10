-- Durable, recipient-scoped WebRTC signaling prevents transient offers being lost.
create table public.live_signals (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.live_streams(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and payload->>'kind' in ('offer','answer','ice','leave','ended','ready')
    and octet_length(payload::text) <= 65536
  ),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index live_signals_recipient_recent_idx on public.live_signals (recipient_id, created_at desc);
alter table public.live_signals enable row level security;
create policy live_signals_participant_read on public.live_signals for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());
create policy live_signals_active_stream_insert on public.live_signals for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_active_member(auth.uid())
    and exists (
      select 1 from public.live_streams s
      where s.id = stream_id
        and ((s.host_id = auth.uid() and recipient_id <> auth.uid()) or (recipient_id = s.host_id and sender_id <> s.host_id))
    )
  );
create policy live_signals_participant_delete on public.live_signals for delete to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());
grant select, insert, delete on public.live_signals to authenticated;
alter publication supabase_realtime add table public.live_signals;
create index live_signals_created_idx on public.live_signals (created_at);