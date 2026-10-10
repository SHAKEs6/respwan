import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin') ?? '';
  const allowedOrigin = Deno.env.get('APP_ORIGIN') ?? '';
  if (request.method === 'OPTIONS') return new Response('ok', { headers: { ...corsHeaders, 'Access-Control-Allow-Origin': origin === allowedOrigin ? origin : allowedOrigin } });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  if (!allowedOrigin || origin !== allowedOrigin) return Response.json({ error: 'Origin not allowed' }, { status: 403, headers: corsHeaders });

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return Response.json({ error: 'Authentication required' }, { status: 401, headers: corsHeaders });
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return Response.json({ error: 'Server configuration is incomplete' }, { status: 500, headers: corsHeaders });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const callerClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: authError } = await callerClient.auth.getUser();
  if (authError || !user) return Response.json({ error: 'Invalid session' }, { status: 401, headers: corsHeaders });

  // The bearer token identifies the only account this endpoint is allowed to remove.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return Response.json({ error: 'Account deletion could not be completed. Contact support.' }, { status: 400, headers: corsHeaders });
  return Response.json({ deleted: true }, { status: 200, headers: { ...corsHeaders, 'Access-Control-Allow-Origin': allowedOrigin } });
});
