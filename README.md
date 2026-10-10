# RESPAWN

**Play. Compete. Respawn.**

RESPAWN is a React + Vite + TypeScript gaming community platform using Supabase for Auth, Postgres/RLS, Storage, and Realtime. This repository contains the actual application and backend schema rather than a static design. A live deployment still requires a Supabase project and trusted administrator provisioning; without those values the application intentionally shows setup/empty states instead of invented user activity.

## Included

- Responsive React application, RESPAWN identity, all requested SPA routes, search, responsive navigation, accessible forms, toasts, skeletons, and empty states.
- Supabase email/password + Google OAuth flows, email confirmation and password reset wiring, profile editing, avatar uploads, data export, account-deletion Edge Function, and private-route redirects.
- Database-backed catalog/search/reviews, community posts/reactions, tournament directory/registration, leaderboards, profile pages, notifications, private one-to-one messaging with Realtime, and protected administration UI.
- LiveKit-powered live rooms for browser screen sharing/camera streaming and spectator playback. LiveKit API secrets are kept in a Supabase Edge Function; the browser receives only short-lived, role-scoped room tokens.
- PostgreSQL migrations with explicit RLS, role checks, fixed server-side XP awards, registration capacity locking, bracket generation, manual match result confirmation/dispute flow, report workflows, storage policies, and audit history.
- Sample catalog/genre/achievement rows in the migration and `supabase/seed.sql`.

## Run locally

Requirements: Node.js 20.19+ or 22.12+, npm, and a Supabase project (or Supabase CLI + Docker for local Supabase).

```sh
npm install
cp .env.example .env.local
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`. These are the Supabase project URL and public publishable/anon key; RLS is the security boundary. **Never put a service-role/secret key in a `VITE_` variable, browser code, GitHub, or Vercel client environment.**

With the Supabase CLI installed and linked to your project:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

For local development, run `supabase start` and then `supabase db reset`; the migrations and `supabase/seed.sql` initialize local Postgres/Storage. After applying the migration, enable email confirmations and configure the email sender/rate limits in Supabase Auth. Browser routes use Vercel's SPA rewrite in `vercel.json`.

## Supabase Auth configuration

1. In Supabase Dashboard → Authentication → URL Configuration, set the Site URL to your local URL during development, and add `http://localhost:5173/**`, your Vercel preview URLs, and your production domain to Redirect URLs.
2. Enable Email provider. Configure confirmation and password-reset email templates to link back to the application. Use a production SMTP provider before public launch.
3. For Google: create an OAuth client in Google Cloud Console, configure the consent screen, and add the Supabase Auth callback URL shown in Supabase → Authentication → Providers → Google as an authorized redirect URI. Enter the Google client ID/secret in the Supabase Dashboard only (never in this repo); enable Google provider and test both local and production redirect URLs.
4. The signup form accepts a requested username as untrusted metadata. A database trigger creates a unique profile; public form metadata cannot grant roles.

## Trusted administrator and organizer setup

No public signup option grants roles. After a verified account exists, use the Supabase SQL Editor as the project owner to grant a role (replace the email):

```sql
insert into public.user_roles (user_id, role, granted_by)
select p.id, 'admin', p.id
from public.profiles p join auth.users u on u.id = p.id
where u.email = 'trusted-admin@example.com'
on conflict do nothing;
```

Grant `organizer` separately to trusted event hosts. Roles can also be revoked by the project owner in the SQL Editor. Audit every grant and keep the owner account protected with MFA. Never put service keys in browser code.

## Storage and external integrations

- Avatar uploads are public profile artwork in the `avatars` bucket; owner-only path policies restrict writes and the bucket caps uploads at 5 MB / JPEG, PNG, WebP.
- Community image uploads use `community-media`, capped at 8 MB / JPEG, PNG, WebP, GIF. Both buckets have MIME/size restrictions and owner-folder write policies. Consider malware scanning and image re-encoding at scale.
- The seeded catalog uses sample records and licensed Unsplash stock photos, not proprietary game box art. Admin-added cover URLs must be owned/licensed and comply with host terms. No external game-data API is enabled by default. Configure a legitimate provider behind a server-side Edge Function if desired, review its license/attribution/rate limits, and keep its key in Edge Function secrets.
- Tournament match results are manually submitted and confirmed by an opponent or organizer. No automatic game-result verification is claimed.
- Google OAuth requires your credentials. Realtime messaging uses Supabase Realtime and RLS for message authorization.

## Live streaming with LiveKit

The web app uses the LiveKit JavaScript client and a Supabase Edge Function that issues short-lived tokens. It does **not** need a Python LiveKit agent: the `agent-starter-python` template and `lk agent create` are for server-side AI/media agents, not ordinary screen-share publishing.

1. Create a LiveKit Cloud project and copy its WebSocket URL, API key, and API secret.
2. Deploy the `livekit-token` Supabase Edge Function and set its server-only secrets:

```sh
supabase secrets set LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud LIVEKIT_API_KEY=YOUR_LIVEKIT_KEY LIVEKIT_API_SECRET=YOUR_LIVEKIT_SECRET APP_ORIGINS=http://localhost:5173,https://respwan-gaming.vercel.app
supabase functions deploy livekit-token
```

The function validates the caller's Supabase session and stream ownership, grants hosts publish access and spectators subscribe-only access, and returns a 30-minute token. **Never put the LiveKit API secret in Vite/Vercel client variables.** Add any custom Vercel domain to `APP_ORIGINS` too.

To receive LiveKit room lifecycle events, deploy the signed webhook receiver. LiveKit requests are verified using the raw request body and the same API key/secret pair:

```sh
supabase functions deploy livekit-webhook --project-ref YOUR_PROJECT_REF --no-verify-jwt
```

In LiveKit Cloud → **Settings → Webhooks**, create a webhook with URL `https://YOUR_PROJECT_REF.supabase.co/functions/v1/livekit-webhook` and choose the API key matching `LIVEKIT_API_KEY`. The receiver removes a RESPAWN live listing when LiveKit sends `room_finished`. Do not configure the `livekit-token` endpoint as a webhook URL.

Screen capture invokes the browser's `getDisplayMedia` picker directly from the user's click. Desktop browsers generally support this; Android/tablet support depends on the specific browser and OS version. If the browser does not expose the API, RESPAWN offers camera/microphone streaming instead. A website cannot bypass Android's screen-capture permission or force-record another app; guaranteed game-screen capture on Android requires a native app using Android MediaProjection.

## Edge Function: account deletion

Deploy the function after setting server-only Supabase secrets:

```sh
supabase secrets set SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_KEY APP_ORIGIN=https://your-domain.example
supabase functions deploy delete-account
```

The function verifies the caller's Supabase access token and deletes only that caller through the Auth Admin API. Profile-related records cascade according to the schema. Admin accounts with audit-log references may require an owner-approved retention/transfer before deletion because audit history is intentionally protected.

## Build, tests, deployment

```sh
npm run build
npm test
```

Database permission/trigger regression tests are in `supabase/tests/respawn.test.sql` and can be run against local Supabase with `supabase test db`. The browser tests verify deterministic XP-level presentation logic; database tests cover fixed XP amounts, protected writes, RLS activation, and tournament/match authorization paths. A remote project must be configured to run live integration checks.

For Vercel, import the GitHub repository, use the Vite defaults (`npm run build`, output `dist`), and configure only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as client environment variables. Set Supabase Edge Function secrets separately with `supabase secrets`. Set the production domain in Supabase Auth redirects and Google OAuth. Protect preview deployments if production data is connected.

Recommended GitHub protections: require PR review, require CI build/tests, enable Dependabot, scan secrets, protect the default branch, and never commit `.env*` files except `.env.example`.

## Security model / production checklist

- RLS is enabled on every public table. Messages require conversation membership; profile XP and level, role grants, match state, notifications, audit log writes, and report resolution are not directly client writable.
- Privileged functions use `SECURITY DEFINER` with a fixed `search_path`, re-check the caller/role/ownership, and write audit events for moderation/report actions. Add further audit coverage when adding new administrator operations.
- Configure Supabase Auth MFA for administrators, SMTP, provider abuse limits, database backups/PITR, log retention, and an incident contact before launch. Review Supabase Security Advisor and test with anon/authenticated JWTs, not only the project owner.
- The first bracket release supports solo single-elimination brackets with a power-of-two registered field; team tables and participant types are present, but team brackets and team-oriented controls require a follow-up iteration.
- Moderation queue and role-sensitive controls rely on the included SQL functions. A full operator workflow for bulk account management, tournament announcements, post/review queues, and evidence review is a follow-on before large-scale production operations.
- Privacy/terms are starter policy text, not legal advice. Add a real support contact, organization identity, jurisdiction-specific rights/retention language, and have counsel review before launch.

## Troubleshooting

- **“Connect Supabase…” banner:** `.env.local` values are missing or Vite needs restart after environment changes.
- **Signup succeeds but sign-in is unavailable:** confirm the email using the configured Supabase email template.
- **Google returns to an error page:** compare the Google Cloud redirect URI with the exact Supabase callback and application redirect allow-list.
- **Empty content:** apply migrations/seed, ensure catalog rows are published, and inspect browser network responses. Empty UI is intentional and does not substitute mock activity.
- **RLS errors:** do not solve them by disabling RLS or using the service-role key in the browser. Check the caller's verified role and the matching SQL policy.
- **Realtime appears stale:** enable the Supabase Realtime publication and verify the active user's conversation membership and message SELECT policy.
#   r e s p w a n 
 
 