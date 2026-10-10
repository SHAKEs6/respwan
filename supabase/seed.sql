-- Idempotent local sample data. The migration contains the canonical initial seed as well.
insert into public.genres (name, slug) values
  ('Action','action'), ('Adventure','adventure'), ('RPG','rpg'), ('Shooter','shooter'),
  ('Strategy','strategy'), ('Sports','sports'), ('Indie','indie'), ('Racing','racing')
on conflict (slug) do nothing;

insert into public.games (id,title,slug,description,cover_url,release_date,platforms,popularity,is_published) values
  ('10000000-0000-4000-8000-000000000006','Call of Duty Mobile','call-of-duty-mobile','Fast, social FPS action built for mobile with ranked play, operators, and squad-based firefights.','https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=900&q=80','2019-10-01',array['Android','iOS'],96,true),
  ('10000000-0000-4000-8000-000000000007','Delta Force','delta-force','A tactical mobile shooter focused on high-intensity engagements, squad tactics, and objective control.','https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=900&q=80','2024-01-17',array['Android','iOS'],88,true),
  ('10000000-0000-4000-8000-000000000008','PUBG Mobile','pubg-mobile','Battle royale matches built around looting, rotating, and surviving until the final circle.','https://images.unsplash.com/photo-1560253023-3ec5d502959f?auto=format&fit=crop&w=900&q=80','2018-03-19',array['Android','iOS'],94,true),
  ('10000000-0000-4000-8000-000000000009','eFootball','efootball','Competitive football action with live club identity, match simulation, and mobile-friendly tactics.','https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=900&q=80','2022-09-14',array['Android','iOS'],81,true),
  ('10000000-0000-4000-8000-000000000010','Free Fire','free-fire','A highly mobile battle royale with quick drops, loot loops, and close-quarters survival pressure.','https://images.unsplash.com/photo-1535223289827-42f1e9919769?auto=format&fit=crop&w=900&q=80','2017-12-04',array['Android','iOS'],90,true),
  ('10000000-0000-4000-8000-000000000011','Blood Strike','blood-strike','A tactical shooter with armory loadouts, ranked pressure, and short-form combat sessions designed for mobile.','https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=900&q=80','2021-07-11',array['Android','iOS'],85,true)
on conflict (slug) do nothing;

update public.games
set is_published = true
where slug in ('call-of-duty-mobile','efootball','pubg-mobile','delta-force','free-fire','blood-strike')
  and not is_published;

update public.games
set is_published = false
where slug not in ('call-of-duty-mobile','efootball','pubg-mobile','delta-force','free-fire','blood-strike')
  and is_published;

insert into public.achievements (slug, name, description, badge_icon, xp_reward) values
  ('first-steps','First Steps','Set up a complete player profile.','✦',20),
  ('community-voice','Community Voice','Share your first approved community post.','◈',20),
  ('helpful-critic','Helpful Critic','Have a review marked helpful by another player.','★',20),
  ('bracket-breaker','Bracket Breaker','Complete a verified tournament.','♜',50),
  ('squad-builder','Squad Builder','Follow five players and build your network.','⌘',20)
on conflict (slug) do nothing;
