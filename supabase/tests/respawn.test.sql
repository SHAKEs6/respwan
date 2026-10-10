begin;
select plan(11);

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles enables RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.xp_ledger'::regclass), 'XP ledger enables RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.messages'::regclass), 'messages enable RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.matches'::regclass), 'matches enable RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.user_roles'::regclass), 'roles enable RLS');

select is(public.xp_amount('profile_complete'), 50, 'profile completion XP is fixed');
select is(public.xp_amount('post_approved'), 10, 'approved post XP is fixed');
select is(public.xp_amount('review_helpful'), 2, 'helpful review vote XP is fixed');
select is(public.xp_amount('tournament_verified'), 25, 'verified tournament XP is fixed');
select is(public.xp_amount('client_claimed_admin'), 0, 'unknown XP events cannot award points');

select ok(not has_table_privilege('authenticated', 'public.xp_ledger', 'INSERT'), 'authenticated clients cannot forge XP ledger rows');
select ok(not has_table_privilege('authenticated', 'public.user_roles', 'INSERT'), 'authenticated clients cannot grant platform roles');
select ok(not has_table_privilege('authenticated', 'public.matches', 'UPDATE'), 'authenticated clients cannot directly edit match state');
select ok(not has_table_privilege('authenticated', 'public.admin_audit_logs', 'INSERT'), 'authenticated clients cannot forge audit records');

select * from finish();
rollback;
