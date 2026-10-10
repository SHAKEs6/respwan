-- Idempotent local sample data. The migration contains the canonical initial seed as well.
insert into public.genres (name, slug) values
  ('Action','action'), ('Adventure','adventure'), ('RPG','rpg'), ('Shooter','shooter'),
  ('Strategy','strategy'), ('Sports','sports'), ('Indie','indie'), ('Racing','racing')
on conflict (slug) do nothing;

insert into public.achievements (slug, name, description, badge_icon, xp_reward) values
  ('first-steps','First Steps','Set up a complete player profile.','✦',20),
  ('community-voice','Community Voice','Share your first approved community post.','◈',20),
  ('helpful-critic','Helpful Critic','Have a review marked helpful by another player.','★',20),
  ('bracket-breaker','Bracket Breaker','Complete a verified tournament.','♜',50),
  ('squad-builder','Squad Builder','Follow five players and build your network.','⌘',20)
on conflict (slug) do nothing;
