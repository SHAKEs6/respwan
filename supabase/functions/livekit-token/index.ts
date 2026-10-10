import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const origins = (Deno.env.get('APP_ORIGINS') ?? Deno.env.get('APP_ORIGIN') ?? '')
  .split(',').map((value) => value.trim()).filter(Boolean);
const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

function json(request: Request, body: unknown, status = 200) {
  const origin = request.headers.get('origin') ?? '';
  const allowedOrigin = origins.includes(origin) ? origin : (origins[0] ?? '');
  return Response.json(body, { status, headers: { ...baseCorsHeaders, 'Access-Control-Allow-Origin': allowedOrigin } });
}

const base64Url = (value: Uint8Array) => {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
};

async function createLiveKitToken(apiKey: string, apiSecret: string, identity: string, name: string, room: string, canPublish: boolean) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({
    iss: apiKey,
    sub: identity,
    name,
    nbf: now - 5,
    iat: now,
    exp: now + 60 * 30,
    video: { roomJoin: true, room, canPublish, canSubscribe: true, canPublishData: false },
  })));
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned)));
  return `${unsigned}.${base64Url(signature)}`;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin') ?? '';
  if (request.method === 'OPTIONS') {
    if (!origins.includes(origin)) return json(request, { error: 'Origin not allowed' }, 403);
    return new Response('ok', { headers: { ...baseCorsHeaders, 'Access-Control-Allow-Origin': origin } });
  }
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);
  if (!origins.includes(origin)) return json(request, { error: 'Origin not allowed' }, 403);

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return json(request, { error: 'A Supabase API authorization header is required.' }, 401);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const liveKitUrl = Deno.env.get('LIVEKIT_URL');
  const liveKitApiKey = Deno.env.get('LIVEKIT_API_KEY');
  const liveKitApiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!supabaseUrl || !supabaseAnonKey || !liveKitUrl || !liveKitApiKey || !liveKitApiSecret) {
    return json(request, { error: 'LiveKit is not configured on the server. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET as Supabase function secrets.' }, 503);
  }

  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: userError } = await callerClient.auth.getUser();

  let body: { stream_id?: string; role?: string };
  try { body = await request.json(); } catch { return json(request, { error: 'Invalid request body.' }, 400); }
  if (!body.stream_id || !['host', 'viewer'].includes(body.role ?? '')) return json(request, { error: 'A stream ID and host/viewer role are required.' }, 400);
  if (body.role === 'host' && (userError || !user)) return json(request, { error: 'Sign in before starting a live stream.' }, 401);
  const { data: stream, error: streamError } = await callerClient.from('live_streams')
    .select('id,host_id,profiles(username)')
    .eq('id', body.stream_id).maybeSingle();
  if (streamError || !stream) return json(request, { error: 'This live stream is no longer available.' }, 404);
  const isHost = Boolean(user && stream.host_id === user.id);
  if (body.role === 'host' && !isHost) return json(request, { error: 'You are not allowed to publish to this live room.' }, 403);

  const username = (stream.profiles as { username?: string } | null)?.username ?? 'player';
  const identity = isHost ? user!.id : `spectator-${crypto.randomUUID()}`;
  const token = await createLiveKitToken(liveKitApiKey, liveKitApiSecret, identity, isHost ? username : 'Spectator', stream.id, isHost);
  return json(request, { url: liveKitUrl, token, identity, role: isHost ? 'host' : 'viewer' });
});
