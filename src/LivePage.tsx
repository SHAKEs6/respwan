import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Gamepad2, Radio, ScreenShare, Square, Users, Video } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, EmptyState, LoadingCards, PageTitle, SectionHeading } from './components';
import { useAuth } from './lib/auth';
import { supabase } from './lib/supabase';

type LiveStream = {
  id: string;
  host_id: string;
  game_id: string;
  title: string;
  created_at: string;
  games?: { title: string; cover_url?: string | null } | null;
  profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null;
};
type Signal = { kind: 'offer' | 'answer' | 'ice' | 'leave' | 'ended' | 'ready'; from: string; to: string; senderUserId?: string; recipientUserId?: string; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
type PeerEntry = { pc: RTCPeerConnection; pendingIce: RTCIceCandidateInit[] };

export function LivePage() {
  const { user } = useAuth();
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [games, setGames] = useState<{ id: string; title: string }[]>([]);
  const [selectedGame, setSelectedGame] = useState('');
  const [title, setTitle] = useState('');
  const supportsScreenCapture = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia);
  const [captureMode, setCaptureMode] = useState<'screen' | 'camera'>(() => supportsScreenCapture ? 'screen' : 'camera');
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('environment');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<LiveStream | null>(null);
  const [mode, setMode] = useState<'host' | 'viewer' | null>(null);
  const [streamStatus, setStreamStatus] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [viewerMuted, setViewerMuted] = useState(true);
  const [viewerPlaybackBlocked, setViewerPlaybackBlocked] = useState(false);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const channelRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef<LiveStream | null>(null);
  const modeRef = useRef<'host' | 'viewer' | null>(null);
  const viewerKeyRef = useRef('');
  const peersRef = useRef(new Map<string, PeerEntry>());
  const pendingHostIceRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const streamRowsRef = useRef<LiveStream[]>([]);
  const viewerTimeoutRef = useRef<number | null>(null);
  const retryOfferRef = useRef<(() => Promise<void>) | null>(null);

  const clearViewerTimeout = () => {
    if (viewerTimeoutRef.current !== null) window.clearTimeout(viewerTimeoutRef.current);
    viewerTimeoutRef.current = null;
  };

  const loadStreams = useCallback(async () => {
    if (!supabase) { setStreams([]); setLoading(false); return; }
    const { data, error } = await supabase.from('live_streams')
      .select('id,host_id,game_id,title,created_at,games(title,cover_url),profiles(username,display_name,avatar_url)')
      .order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    else { setStreams((data ?? []) as unknown as LiveStream[]); streamRowsRef.current = (data ?? []) as unknown as LiveStream[]; }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    void loadStreams();
    void supabase.from('games').select('id,title').eq('is_published', true).order('title')
      .then(({ data, error }) => { if (error) toast.error(error.message); else setGames(data ?? []); });
    const directory = supabase.channel('live-stream-directory').on('postgres_changes',
      { event: '*', schema: 'public', table: 'live_streams' }, () => { void loadStreams(); }).subscribe();
    return () => { void supabase!.removeChannel(directory); };
  }, [loadStreams]);

  useEffect(() => {
    if (localVideo.current) localVideo.current.srcObject = localStreamRef.current;
  }, [mode, active]);
  useEffect(() => {
    const video = remoteVideo.current;
    if (!video) return;
    video.srcObject = remoteStreamRef.current;
    if (mode === 'viewer' && video.srcObject) void video.play().then(() => setViewerPlaybackBlocked(false)).catch(() => setViewerPlaybackBlocked(true));
  }, [mode, active]);

  const sendSignal = useCallback(async (signal: Signal) => {
    const stream = activeRef.current;
    const senderId = user?.id;
    const recipientId = signal.recipientUserId || signal.to;
    if (!supabase || !stream || !senderId || !recipientId) return false;
    const { error } = await supabase.from('live_signals').insert({
      stream_id: stream.id,
      sender_id: senderId,
      recipient_id: recipientId,
      payload: signal,
    });
    if (error) { toast.error(`Live connection signal failed: ${error.message}. Apply the reliable live-signals migration.`); return false; }
    return true;
  }, [user?.id]);

  const stopStreamListing = useCallback(async (stream: LiveStream) => {
    if (!supabase || !user || stream.host_id !== user.id) return;
    const { data: priorSignals, error: lookupError } = await supabase.from('live_signals')
      .select('sender_id,recipient_id').eq('stream_id', stream.id).limit(500);
    if (lookupError) toast.error(`Could not notify spectators: ${lookupError.message}`);
    const recipients = new Set<string>();
    for (const signal of priorSignals ?? []) {
      if (signal.sender_id !== user.id) recipients.add(signal.sender_id);
      if (signal.recipient_id !== user.id) recipients.add(signal.recipient_id);
    }
    if (recipients.size) {
      const { error } = await supabase.from('live_signals').insert([...recipients].map((recipient_id) => ({
        stream_id: stream.id,
        sender_id: user.id,
        recipient_id,
        payload: { kind: 'ended', from: user.id, to: recipient_id } satisfies Signal,
      })));
      if (error) toast.error(`Could not notify all spectators before stopping: ${error.message}`);
    }
    const { error } = await supabase.from('live_streams').delete().eq('id', stream.id).eq('host_id', user.id);
    if (error) toast.error(`Could not stop the live listing: ${error.message}`);
    else { toast.success('Stream stopped'); void loadStreams(); }
  }, [loadStreams, user?.id]);

  const closePeers = () => {
    peersRef.current.forEach(({ pc }) => pc.close());
    peersRef.current.clear();
    pendingHostIceRef.current.clear();
    setViewerCount(0);
  };

  const clearMedia = () => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current = null;
    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
  };

  const endActive = useCallback(async (notify = true) => {
    const stream = activeRef.current;
    const currentMode = modeRef.current;
    if (notify && currentMode === 'host' && stream) {
      await stopStreamListing(stream);
    }
    if (notify && currentMode === 'viewer' && stream && viewerKeyRef.current) {
      await sendSignal({ kind: 'leave', from: viewerKeyRef.current, to: stream.host_id });
    }
    closePeers();
    clearViewerTimeout();
    retryOfferRef.current = null;
    clearMedia();
    if (channelRef.current && supabase) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (currentMode === 'host' && stream && !notify && supabase) { await supabase.from('live_streams').delete().eq('id', stream.id).eq('host_id', user?.id || stream.host_id); void loadStreams(); }
    activeRef.current = null;
    modeRef.current = null;
    setActive(null); setMode(null); setStreamStatus(''); setBusy(false); setViewerMuted(true); setViewerPlaybackBlocked(false);
  }, [loadStreams, sendSignal, stopStreamListing, user?.id]);

  useEffect(() => () => {
    const stream = activeRef.current;
    const currentMode = modeRef.current;
    if (currentMode === 'host' && stream && supabase) void supabase.from('live_streams').delete().eq('id', stream.id).eq('host_id', stream.host_id);
    if (currentMode === 'viewer' && stream && channelRef.current) void channelRef.current.send({ type: 'broadcast', event: 'signal', payload: { kind: 'leave', from: viewerKeyRef.current, to: stream.host_id } });
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    peersRef.current.forEach(({ pc }) => pc.close());
    if (channelRef.current && supabase) void supabase.removeChannel(channelRef.current);
  }, []);

  const host = async () => {
    if (!supabase || !user || !selectedGame || title.trim().length < 3) return;
    if (!navigator.mediaDevices) { toast.error('Camera and screen sharing require a current browser on HTTPS.'); return; }
    if (captureMode === 'screen' && !navigator.mediaDevices.getDisplayMedia) { toast.error('This browser does not support screen sharing. Select Camera stream instead.'); setCaptureMode('camera'); return; }
    setBusy(true); setStreamStatus(captureMode === 'screen' ? 'Choose a screen or game window to share…' : 'Allow camera and microphone access…');
    let capture: MediaStream;
    try {
      capture = captureMode === 'screen'
        ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 60 } }, audio: true })
        : await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: cameraFacing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: { echoCancellation: true, noiseSuppression: true } });
    }
    catch (error) { setBusy(false); setStreamStatus(''); toast.error(error instanceof Error ? error.message : 'Screen sharing was cancelled.'); return; }
    const { data: row, error } = await supabase.from('live_streams').insert({ host_id: user.id, game_id: selectedGame, title: title.trim() })
      .select('id,host_id,game_id,title,created_at,games(title,cover_url),profiles(username,display_name,avatar_url)').single();
    if (error || !row) {
      capture.getTracks().forEach((track) => track.stop()); setBusy(false); setStreamStatus('');
      toast.error(error?.message || 'Could not create live stream.'); return;
    }
    const streamRow = row as unknown as LiveStream;
    const channel = supabase.channel(`live-signals-host:${streamRow.id}:${user.id}`);
    localStreamRef.current = capture; activeRef.current = streamRow; modeRef.current = 'host'; channelRef.current = channel;
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_signals', filter: `recipient_id=eq.${user.id}` }, async (change: any) => {
      const row = change.new;
      if (row.stream_id !== streamRow.id) return;
      const signal = { ...(row.payload as Signal), senderUserId: row.sender_id };
      if (!signal || signal.to !== user.id || !signal.from) return;
      if (signal.kind === 'leave') {
        peersRef.current.get(signal.from)?.pc.close(); peersRef.current.delete(signal.from); setViewerCount(peersRef.current.size); void supabase!.from('live_signals').delete().eq('id', row.id); return;
      }
      if (signal.kind === 'offer' && signal.description) {
        setStreamStatus('A spectator is connecting…');
        peersRef.current.get(signal.from)?.pc.close();
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        const entry: PeerEntry = { pc, pendingIce: pendingHostIceRef.current.get(signal.from) ?? [] };
        pendingHostIceRef.current.delete(signal.from);
        peersRef.current.set(signal.from, entry);
        capture.getTracks().forEach((track) => pc.addTrack(track, capture));
        pc.onicecandidate = (event) => { if (event.candidate && signal.senderUserId) void sendSignal({ kind: 'ice', from: user.id, to: signal.from, recipientUserId: signal.senderUserId, candidate: event.candidate.toJSON() }); };
        pc.onconnectionstatechange = () => { setViewerCount(peersRef.current.size); };
        try {
          await pc.setRemoteDescription(signal.description);
          if (signal.senderUserId) await sendSignal({ kind: 'ready', from: user.id, to: signal.from, recipientUserId: signal.senderUserId });
          for (const candidate of entry.pendingIce.splice(0)) await pc.addIceCandidate(candidate);
          const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
          if (signal.senderUserId) await sendSignal({ kind: 'answer', from: user.id, to: signal.from, recipientUserId: signal.senderUserId, description: pc.localDescription?.toJSON() });
          setViewerCount(peersRef.current.size);
        } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Could not connect spectator.'); pc.close(); peersRef.current.delete(signal.from); }
      } else if (signal.kind === 'ice' && signal.candidate) {
        const entry = peersRef.current.get(signal.from);
        if (!entry) { pendingHostIceRef.current.set(signal.from, [...(pendingHostIceRef.current.get(signal.from) ?? []), signal.candidate]); void supabase!.from('live_signals').delete().eq('id', row.id); return; }
        if (entry.pc.remoteDescription) { try { await entry.pc.addIceCandidate(signal.candidate); } catch { /* stale network candidate */ } }
        else entry.pendingIce.push(signal.candidate);
      }
      void supabase!.from('live_signals').delete().eq('id', row.id);
    });
    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        setActive(streamRow); setMode('host'); setStreamStatus(`${captureMode === 'screen' ? 'Screen share' : 'Camera stream'} is live — share this page link with players who want to spectate.`); setBusy(false);
        void loadStreams();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        toast.error('Could not open the private streaming channel. Apply the live-stream Supabase migration.');
        void endActive(false);
      }
    });
    capture.getVideoTracks()[0]?.addEventListener('ended', () => { void endActive(); }, { once: true });
  };

  const watch = async (stream: LiveStream) => {
    if (!supabase || !user || busy) return;
    if (stream.host_id === user.id) { toast.info('This is your live stream.'); return; }
    setBusy(true); setStreamStatus('Connecting to the live player…');
    setViewerMuted(true); setViewerPlaybackBlocked(false);
    const channel = supabase.channel(`live-signals-viewer:${stream.id}:${user.id}`);
    const viewerKey = `${user.id}-${crypto.randomUUID()}`;
    viewerKeyRef.current = viewerKey; activeRef.current = stream; modeRef.current = 'viewer'; channelRef.current = channel;
    setActive(stream); setMode('viewer'); setStreamStatus('Opening live player…');
    setBusy(false);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    const entry: PeerEntry = { pc, pendingIce: [] }; peersRef.current.set(stream.host_id, entry);
    remoteStreamRef.current = new MediaStream();
    pc.ontrack = (event) => {
      const target = remoteStreamRef.current;
      if (!target) return;
      event.streams[0]?.getTracks().forEach((track) => { if (!target.getTracks().some((existing) => existing.id === track.id)) target.addTrack(track); });
      if (!event.streams[0]) target.addTrack(event.track);
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = target;
        void remoteVideo.current.play().then(() => setViewerPlaybackBlocked(false)).catch(() => setViewerPlaybackBlocked(true));
      }
      setStreamStatus('Connected — spectating live.');
    };
    pc.onicecandidate = (event) => { if (event.candidate) void sendSignal({ kind: 'ice', from: viewerKey, to: stream.host_id, senderUserId: user.id, recipientUserId: stream.host_id, candidate: event.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') { clearViewerTimeout(); setStreamStatus('Connected — spectating live.'); }
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') setStreamStatus('Connection interrupted. Retry, or try a network that allows peer-to-peer media.');
    };
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_signals', filter: `recipient_id=eq.${user.id}` }, async (change: any) => {
      const row = change.new;
      if (row.stream_id !== stream.id) return;
      const signal = { ...(row.payload as Signal), senderUserId: row.sender_id };
      if (!signal || signal.from !== stream.host_id) return;
      if (signal.kind === 'ended' && signal.to === user.id) { toast.info('The streamer ended the broadcast.'); void supabase!.from('live_signals').delete().eq('id', row.id); void endActive(false); return; }
      if (signal.to !== viewerKey) return;
      if (signal.kind === 'ready') {
        clearViewerTimeout();
        setStreamStatus('Streamer received your request — connecting…');
      } else if (signal.kind === 'answer' && signal.description) {
        clearViewerTimeout();
        try {
          await pc.setRemoteDescription(signal.description);
          for (const candidate of entry.pendingIce.splice(0)) await pc.addIceCandidate(candidate);
        } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Could not connect to the stream.'); }
      } else if (signal.kind === 'ice' && signal.candidate) {
        if (pc.remoteDescription) { try { await pc.addIceCandidate(signal.candidate); } catch { /* stale network candidate */ } }
        else entry.pendingIce.push(signal.candidate);
      }
      void supabase!.from('live_signals').delete().eq('id', row.id);
    });
    channel.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        try {
          const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
          const sendOffer = async () => {
            const description = pc.localDescription?.toJSON();
            if (!description) return;
            const sent = await sendSignal({ kind: 'offer', from: viewerKey, to: stream.host_id, senderUserId: user.id, recipientUserId: stream.host_id, description });
            if (!sent) { setStreamStatus('Connection request failed. Check the live-signaling migration, then retry.'); return; }
            setStreamStatus('Live player open — asking the streamer to connect…');
            clearViewerTimeout();
            viewerTimeoutRef.current = window.setTimeout(() => {
              if (pc.connectionState !== 'connected') setStreamStatus('No video yet. Make sure the streamer is still live and has the latest page open, then retry.');
            }, 12000);
          };
          retryOfferRef.current = sendOffer;
          await sendOffer();
        } catch (reason) { const detail = reason instanceof Error ? reason.message : 'Could not create the stream connection.'; toast.error(detail); setStreamStatus(`Could not connect: ${detail}`); setBusy(false); }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        toast.error('Could not join this stream. Apply the live-stream Supabase migration.'); await endActive(false);
      }
    });
  };

  return <>
    <PageTitle eyebrow="LIVE LOBBY" title="Watch live players." description="Share a screen when the browser supports it, or stream with your phone/tablet camera. Other signed-in players can spectate." />
    {!active && <section className="panel live-host-panel"><div><span className="eyebrow">GO LIVE</span><h2>Stream your session</h2><p>{captureMode === 'screen' ? 'Choose a screen or app window. Screen capture support varies by browser; Android can use camera streaming when screen capture is unavailable.' : 'Use your front or rear camera with microphone. Keep this page open while streaming; the browser asks for camera and mic permission.'}</p></div><form className="live-host-form" onSubmit={(event) => { event.preventDefault(); void host(); }}><label>Stream source<select value={captureMode} onChange={(event) => setCaptureMode(event.target.value as 'screen' | 'camera')}><option value="camera">Phone/tablet camera + microphone</option><option value="screen" disabled={!supportsScreenCapture}>Share screen or app {supportsScreenCapture ? '' : '(not supported here)'}</option></select></label>{captureMode === 'camera' && <label>Camera<select value={cameraFacing} onChange={(event) => setCameraFacing(event.target.value as 'user' | 'environment')}><option value="environment">Rear camera</option><option value="user">Front camera</option></select></label>}<label>Game<select required value={selectedGame} onChange={(event) => setSelectedGame(event.target.value)}><option value="">Choose a game</option>{games.map((game) => <option value={game.id} key={game.id}>{game.title}</option>)}</select></label><label>Stream title<input required minLength={3} maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ranked grind — squad welcome" /></label><button className="btn btn-primary" disabled={busy || !selectedGame || title.trim().length < 3}>{captureMode === 'camera' ? <Camera size={16} /> : <ScreenShare size={16} />}{busy ? 'Starting…' : 'Start streaming'}</button></form>{streamStatus && <p className="live-status" role="status">{streamStatus}</p>}</section>}
    {active && <section className="live-stage panel"><div className="live-stage-head"><div><span className="live-indicator"><i /> {mode === 'host' ? 'YOU ARE LIVE' : 'LIVE SPECTATING'}</span><h2>{active.title}</h2><p>{active.games?.title || 'Game'} · @{active.profiles?.username || 'player'}</p></div><div className="live-head-actions">{mode === 'host' && <span className="spectator-count"><Users size={15} /> {viewerCount} watching</span>}{mode === 'viewer' && <button className="btn btn-quiet btn-small" onClick={() => { const video = remoteVideo.current; if (!video) return; const nextMuted = !viewerMuted; video.muted = nextMuted; setViewerMuted(nextMuted); void video.play().then(() => setViewerPlaybackBlocked(false)).catch(() => setViewerPlaybackBlocked(true)); }}>{viewerMuted ? 'Enable sound' : 'Mute'}</button>}{mode === 'viewer' && (streamStatus.startsWith('No video') || streamStatus.startsWith('Connection request failed') || streamStatus.startsWith('Could not connect')) && <button className="btn btn-primary btn-small" onClick={() => { if (retryOfferRef.current) void retryOfferRef.current(); }}>Retry connection</button>}</div></div><div className="live-video-wrap">{mode === 'host' ? <video ref={localVideo} autoPlay muted playsInline /> : <video ref={remoteVideo} autoPlay muted={viewerMuted} playsInline controls onPlaying={() => setViewerPlaybackBlocked(false)} />}{mode === 'viewer' && viewerPlaybackBlocked && <button className="live-video-overlay live-tap-play" onClick={() => { const video = remoteVideo.current; if (!video) return; void video.play().then(() => setViewerPlaybackBlocked(false)).catch(() => toast.error('Playback was blocked. Tap the video play control to continue.')); }}><Video size={22} /><strong>Tap to play live stream</strong><small>Tap Enable sound after playback starts for audio</small></button>}{mode === 'viewer' && !viewerPlaybackBlocked && !streamStatus.startsWith('Connected') && <div className="live-video-overlay"><span className="spinner" /><strong>{streamStatus || 'Connecting…'}</strong></div>}</div><p className="live-status" role="status">{streamStatus}</p>
    {mode !== null && <button className={`btn btn-small ${mode === 'host' ? 'btn-danger' : 'btn-quiet'}`} onClick={() => void endActive()}><Square size={14} />{mode === 'host' ? 'Stop stream' : 'Leave spectating'}</button>}
    </section>}
    <section className="content-section live-directory"><SectionHeading title="Live now" />{loading ? <LoadingCards count={2} /> : streams.length ? <div className="live-stream-grid">{streams.map((stream) => <article className="live-stream-card panel" key={stream.id}><div className="live-card-art">{stream.games?.cover_url ? <img src={stream.games.cover_url} alt="" /> : <Gamepad2 size={28} />}<span className="live-badge"><i /> LIVE</span></div><div className="live-card-copy"><strong>{stream.title}</strong><span>{stream.games?.title || 'Game'} · {new Date(stream.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><Link className="live-host-link" to={`/players/${stream.profiles?.username || ''}`}><Avatar name={stream.profiles?.display_name || stream.profiles?.username || 'Player'} src={stream.profiles?.avatar_url} size="sm" />@{stream.profiles?.username || 'player'}</Link></div><button className="btn btn-primary btn-small" disabled={busy || mode !== null || stream.host_id === user?.id} onClick={() => void watch(stream)}><Video size={14} />Spectate</button>
    {stream.host_id === user?.id ? <button className="btn btn-danger btn-small" disabled={busy} onClick={() => { if (activeRef.current?.id === stream.id && modeRef.current === 'host') void endActive(); else void stopStreamListing(stream); }}><Square size={14} />Stop stream</button> : <button className="btn btn-primary btn-small" disabled={busy || mode !== null} onClick={() => void watch(stream)}><Video size={14} />Spectate</button>}
    </article>)}</div> : <EmptyState title="No one is live right now" detail="Start a stream to let your community watch your game session." icon={Radio} />}</section>
  </>;
}
