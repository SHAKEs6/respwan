import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { WebhookReceiver } from 'https://esm.sh/livekit-server-sdk@2';

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  const apiKey = Deno.env.get('LIVEKIT_API_KEY');
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('authorization');
  if (!apiKey || !apiSecret || !supabaseUrl || !serviceRoleKey) {
    console.error('LiveKit webhook server secrets are incomplete.');
    return Response.json({ error: 'Webhook receiver is not configured.' }, { status: 503 });
  }
  if (!authorization) return Response.json({ error: 'Missing LiveKit signature.' }, { status: 401 });

  let event: { event?: string; room?: { name?: string }; id?: string };
  try {
    // LiveKit verifies a JWT containing a hash of the original raw request body.
    // Do not parse and re-serialize this body before verification.
    const rawBody = await request.text();
    const receiver = new WebhookReceiver(apiKey, apiSecret);
    event = await receiver.receive(rawBody, authorization) as typeof event;
  } catch (error) {
    console.warn('Rejected invalid LiveKit webhook signature.', error instanceof Error ? error.message : 'unknown error');
    return Response.json({ error: 'Invalid LiveKit webhook signature.' }, { status: 401 });
  }

  if (event.event === 'room_finished') {
    const roomId = event.room?.name;
    if (!roomId) return Response.json({ error: 'Finished room event did not include a room name.' }, { status: 400 });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await serviceClient.from('live_streams').delete().eq('id', roomId);
    if (error) {
      console.error('Could not remove finished stream listing.', error.message);
      return Response.json({ error: 'Could not synchronize the finished room.' }, { status: 500 });
    }
  }

  return Response.json({ received: true, event: event.event ?? 'unknown' });
});
