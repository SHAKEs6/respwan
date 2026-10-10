import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Gamepad2, Headphones, Radio, ScreenShare, Square, Users, Video } from 'lucide-react';
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
type Signal = { kind: 'offer' | 'answer' | 'ice' | 'leave' | 'ended'; from: string; to: string; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
type PeerEntry = { pc: RTCPeerConnection; pendingIce: RTCIceCandidateInit[] };

export function LivePage() {
  const { user } = useAuth();
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [games, setGames] = useState<{ id: string; title: string }[]>([]);
  const [selectedGame, setSelectedGame] = useState('');
  const [title, setTitle] = useState('');
  const supportsScreenCapture = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia);
  const isMobileDevice = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const [captureMode, setCaptureMode] = useState<'screen' | 'camera'>(() => isMobileDevice || !supportsScreenCapture ? 'camera' : 'screen');
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
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const streamRowsRef = useRef<LiveStream[]>([]);

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
    if (!channelRef.current) return;
    const result = await channelRef.current.send({ type: 'broadcast', event: 'signal', payload: signal });
    if (result !== 'ok') toast.error('Streaming signal could not be sent. Check the live-stream database migration and connection.');
  }, []);

  const closePeers = () => {
    peersRef.current.forEach(({ pc }) => pc.close());
    peersRef.current.clear();
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
      await sendSignal({ kind: 'ended', from: user?.id || '', to: '*' });
    }
    if (notify && currentMode === 'viewer' && stream && viewerKeyRef.current) {
      await sendSignal({ kind: 'leave', from: viewerKeyRef.current, to: stream.host_id });
    }
    closePeers();
    clearMedia();
    if (channelRef.current && supabase) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (currentMode === 'host' && stream && supabase) {
      await supabase.from('live_streams').delete().eq('id', stream.id).eq('host_id', user?.id || stream.host_id);
      void loadStreams();
    }
    activeRef.current = null;
    modeRef.current = null;
    setActive(null); setMode(null); setStreamStatus(''); setBusy(false); setViewerMuted(true); setViewerPlaybackBlocked(false);
  }, [loadStreams, sendSignal, user?.id]);

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
    const channel = supabase.channel(`live:${streamRow.id}`, { config: { private: true, broadcast: { ack: true, self: false } } });
    localStreamRef.current = capture; activeRef.current = streamRow; modeRef.current = 'host'; channelRef.current = channel;
    channel.on('broadcast', { event: 'signal' }, async ({ payload }: { payload: Signal }) => {
      const signal = payload;
      if (!signal || signal.to !== user.id || !signal.from) return;
      if (signal.kind === 'leave') {
        peersRef.current.get(signal.from)?.pc.close(); peersRef.current.delete(signal.from); setViewerCount(peersRef.current.size); return;
      }
      if (signal.kind === 'offer' && signal.description) {
        peersRef.current.get(signal.from)?.pc.close();
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        const entry: PeerEntry = { pc, pendingIce: [] };
        peersRef.current.set(signal.from, entry);
        capture.getTracks().forEach((track) => pc.addTrack(track, capture));
        pc.onicecandidate = (event) => { if (event.candidate) void sendSignal({ kind: 'ice', from: user.id, to: signal.from, candidate: event.candidate.toJSON() }); };
        pc.onconnectionstatechange = () => { setViewerCount(peersRef.current.size); };
        try {
          await pc.setRemoteDescription(signal.description);
          for (const candidate of entry.pendingIce.splice(0)) await pc.addIceCandidate(candidate);
          const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
          await sendSignal({ kind: 'answer', from: user.id, to: signal.from, description: pc.localDescription?.toJSON() });
          setViewerCount(peersRef.current.size);
        } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Could not connect spectator.'); pc.close(); peersRef.current.delete(signal.from); }
      } else if (signal.kind === 'ice' && signal.candidate) {
        const entry = peersRef.current.get(signal.from);
        if (!entry) return;
        if (entry.pc.remoteDescription) { try { await entry.pc.addIceCandidate(signal.candidate); } catch { /* stale network candidate */ } }
        else entry.pendingIce.push(signal.candidate);
      }
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
    const channel = supabase.channel(`live:${stream.id}`, { config: { private: true, broadcast: { ack: true, self: false } } });
    const viewerKey = `${user.id}-${crypto.randomUUID()}`;
    viewerKeyRef.current = viewerKey; activeRef.current = stream; modeRef.current = 'viewer'; channelRef.current = channel;
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
    pc.onicecandidate = (event) => { if (event.candidate) void sendSignal({ kind: 'ice', from: viewerKey, to: stream.host_id, candidate: event.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') setStreamStatus('Connection interrupted. A TURN relay may be required on this network.');
    };
    channel.on('broadcast', { event: 'signal' }, async ({ payload }: { payload: Signal }) => {
      const signal = payload;
      if (!signal || signal.from !== stream.host_id) return;
      if (signal.kind === 'ended') { toast.info('The streamer ended the broadcast.'); void endActive(false); return; }
      if (signal.to !== viewerKey) return;
      if (signal.kind === 'answer' && signal.description) {
        try {
          await pc.setRemoteDescription(signal.description);
          for (const candidate of entry.pendingIce.splice(0)) await pc.addIceCandidate(candidate);
        } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Could not connect to the stream.'); }
      } else if (signal.kind === 'ice' && signal.candidate) {
        if (pc.remoteDescription) { try { await pc.addIceCandidate(signal.candidate); } catch { /* stale network candidate */ } }
        else entry.pendingIce.push(signal.candidate);
      }
    });
    channel.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        try {
          const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
          await sendSignal({ kind: 'offer', from: viewerKey, to: stream.host_id, description: pc.localDescription?.toJSON() });
          setActive(stream); setMode('viewer'); setBusy(false); setStreamStatus('Offer sent — waiting for the streamer to connect…');
        } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Could not start spectating.'); await endActive(false); }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        toast.error('Could not join this stream. Apply the live-stream Supabase migration.'); await endActive(false);
      }
    });
  };

  return <>
    <PageTitle eyebrow="LIVE LOBBY" title="Watch live players." description="Share your screen where supported, or stream with your phone/tablet camera. Other signed-in players can spectate." />
    {!active && <section className="panel live-host-panel"><div><span className="eyebrow">GO LIVE</span><h2>Stream your session</h2><p>{captureMode === 'screen' ? 'Choose a screen or app window. Screen capture support varies by browser; Android can use camera streaming when screen capture is unavailable.' : 'Use your front or rear camera with microphone. Keep this page open while streaming; the browser asks for camera and mic permission.'}</p></div><form className="live-host-form" onSubmit={(event) => { event.preventDefault(); void host(); }}><label>Stream source<select value={captureMode} onChange={(event) => setCaptureMode(event.target.value as 'screen' | 'camera')}><option value="camera">Phone/tablet camera + microphone</option><option value="screen" disabled={!supportsScreenCapture}>Share screen or app {supportsScreenCapture ? '' : '(not supported here)'}</option></select></label>{captureMode === 'camera' && <label>Camera<select value={cameraFacing} onChange={(event) => setCameraFacing(event.target.value as 'user' | 'environment')}><option value="environment">Rear camera</option><option value="user">Front camera</option></select></label>}<label>Game<select required value={selectedGame} onChange={(event) => setSelectedGame(event.target.value)}><option value="">Choose a game</option>{games.map((game) => <option value={game.id} key={game.id}>{game.title}</option>)}</select></label><label>Stream title<input required minLength={3} maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ranked grind — squad welcome" /></label><button className="btn btn-primary" disabled={busy || !selectedGame || title.trim().length < 3}>{captureMode === 'camera' ? <Camera size={16} /> : <ScreenShare size={16} />}{busy ? 'Starting…' : 'Start streaming'}</button></form>{streamStatus && <p className="live-status" role="status">{streamStatus}</p>}</section>}
    {active && <section className="live-stage panel"><div className="live-stage-head"><div><span className="live-indicator"><i /> {mode === 'host' ? 'YOU ARE LIVE' : 'LIVE SPECTATING'}</span><h2>{active.title}</h2><p>{active.games?.title || 'Game'} · @{active.profiles?.username || 'player'}</p></div><div className="live-head-actions">{mode === 'host' && <span className="spectator-count"><Users size={15} /> {viewerCount} watching</span>}{mode === 'viewer' && <button className="btn btn-quiet btn-small" onClick={() => { const video = remoteVideo.current; if (!video) return; const nextMuted = !viewerMuted; video.muted = nextMuted; setViewerMuted(nextMuted); void video.play().then(() => setViewerPlaybackBlocked(false)).catch(() => setViewerPlaybackBlocked(true)); }}>{viewerMuted ? 'Enable sound' : 'Mute'}</button>}<button className="btn btn-danger btn-small" onClick={() => void endActive()}><Square size={14} />{mode === 'host' ? 'End stream' : 'Leave stream'}</button></div></div><div className="live-video-wrap">{mode === 'host' ? <video ref={localVideo} autoPlay muted playsInline /> : <video ref={remoteVideo} autoPlay muted={viewerMuted} playsInline controls onPlaying={() => setViewerPlaybackBlocked(false)} />}{mode === 'viewer' && viewerPlaybackBlocked && <button className="live-video-overlay live-tap-play" onClick={() => { const video = remoteVideo.current; if (!video) return; void video.play().then(() => setViewerPlaybackBlocked(false)).catch(() => toast.error('Playback was blocked. Tap the video play control to continue.')); }}><Video size={22} /><strong>Tap to play live stream</strong><small>Tap Enable sound after playback starts for audio</small></button>}{mode === 'viewer' && !viewerPlaybackBlocked && !streamStatus.startsWith('Connected') && <div className="live-video-overlay"><span className="spinner" /><strong>{streamStatus || 'Connecting…'}</strong></div>}</div><p className="live-status" role="status">{streamStatus}</p>{mode === 'host' && <small className="live-privacy-note"><Headphones size={13} /> Camera mode sends camera/microphone. Android screen capture depends on browser support and may not allow app/game audio. Use Chrome over HTTPS.</small>}</section>}
    <section className="content-section live-directory"><SectionHeading title="Live now" />{loading ? <LoadingCards count={2} /> : streams.length ? <div className="live-stream-grid">{streams.map((stream) => <article className="live-stream-card panel" key={stream.id}><div className="live-card-art">{stream.games?.cover_url ? <img src={stream.games.cover_url} alt="" /> : <Gamepad2 size={28} />}<span className="live-badge"><i /> LIVE</span></div><div className="live-card-copy"><strong>{stream.title}</strong><span>{stream.games?.title || 'Game'} · {new Date(stream.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><Link className="live-host-link" to={`/players/${stream.profiles?.username || ''}`}><Avatar name={stream.profiles?.display_name || stream.profiles?.username || 'Player'} src={stream.profiles?.avatar_url} size="sm" />@{stream.profiles?.username || 'player'}</Link></div><button className="btn btn-primary btn-small" disabled={busy || mode !== null || stream.host_id === user?.id} onClick={() => void watch(stream)}><Video size={14} />Spectate</button></article>)}</div> : <EmptyState title="No one is live right now" detail="Start a stream to let your community watch your game session." icon={Radio} />}</section>
  </>;
}
