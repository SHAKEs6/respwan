-- Public visitors may browse and spectate; only authenticated hosts can publish/stop streams.
drop policy if exists live_streams_read on public.live_streams;
create policy live_streams_read on public.live_streams
  for select to anon, authenticated using (true);
grant select on public.live_streams to anon;