import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Gamepad2, Radio, ScreenShare, Square, Users, Video } from 'lucide-react';
import { Room, RoomEvent, Track, createLocalAudioTrack, createLocalScreenTracks, createLocalVideoTrack, type LocalTrack, type RemoteTrack } from 'livekit-client';
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

export function LiveKitPage() {
  const { user } = useAuth();
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [games, setGames] = useState<{ id: string; title: string }[]>([]);
  const [selectedGame, setSelectedGame] = useState('');
  const [title, setTitle] = useState('');
  const [captureMode, setCaptureMode] = useState<'screen' | 'camera'>(() => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia ? 'screen' : 'camera');
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('environment');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<LiveStream | null>(null);
  const [mode, setMode] = useState<'host' | 'viewer' | null>(null);
  const [status, setStatus] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [viewerTrackTimedOut, setViewerTrackTimedOut] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const activeRef = useRef<LiveStream | null>(null);
  const modeRef = useRef<'host' | 'viewer' | null>(null);
  const localTracksRef = useRef<LocalTrack[]>([]);
  const remoteTracksRef = useRef(new Map<string, RemoteTrack>());
  const viewerTrackTimerRef = useRef<number | null>(null);

  const clearViewerTrackTimer = () => {
    if (viewerTrackTimerRef.current !== null) window.clearTimeout(viewerTrackTimerRef.current);
    viewerTrackTimerRef.current = null;
  };

  const loadStreams = useCallback(async () => {
    if (!supabase) { setStreams([]); setLoading(false); return; }
    const { data, error } = await supabase.from('live_streams')
      .select('id,host_id,game_id,title,created_at,games(title,cover_url),profiles(username,display_name,avatar_url)')
      .order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    else setStreams((data ?? []) as unknown as LiveStream[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    void loadStreams();
    void supabase.from('games').select('id,title').eq('is_published', true).order('title')
      .then(({ data, error }) => { if (error) toast.error(error.message); else setGames(data ?? []); });
    const directory = supabase.channel('livekit-directory').on('postgres_changes',
      { event: '*', schema: 'public', table: 'live_streams' }, () => { void loadStreams(); }).subscribe();
    return () => { void supabase!.removeChannel(directory); };
  }, [loadStreams]);

  const getToken = async (stream: LiveStream, role: 'host' | 'viewer') => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.functions.invoke('livekit-token', { body: { stream_id: stream.id, role } });
    if (error) {
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response && context.status === 404) {
        throw new Error('LiveKit token function is not deployed. In the project folder run: npx supabase functions deploy livekit-token --project-ref wsofkugntunmhfvsldoc');
      }
      if (context instanceof Response) {
        const responseBody = await context.clone().json().catch(() => null) as { error?: string } | null;
        if (responseBody?.error) throw new Error(responseBody.error);
      }
      throw new Error(error.message || 'LiveKit token service failed. Check Supabase Edge Function deployment and network access.');
    }
    if (!data?.url || !data?.token) throw new Error(data?.error || 'LiveKit token service returned an incomplete response.');
    return { url: data.url as string, token: data.token as string };
  };

  const attachRemoteTrack = (track: RemoteTrack) => {
    remoteTracksRef.current.set(track.sid ?? track.mediaStreamTrack.id, track);
    if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
      track.attach(remoteVideoRef.current);
      void remoteVideoRef.current.play().then(() => setPlaybackBlocked(false)).catch(() => setPlaybackBlocked(true));
    } else if (track.kind === Track.Kind.Audio && audioContainerRef.current) {
      const element = track.attach();
      element.autoplay = true;
      audioContainerRef.current.append(element);
    }
  };

  const detachRemoteTrack = (track: RemoteTrack) => {
    remoteTracksRef.current.delete(track.sid ?? track.mediaStreamTrack.id);
    track.detach();
  };

  const makeRoom = (stream: LiveStream, role: 'host' | 'viewer') => {
    const room = new Room({ adaptiveStream: true, dynacast: true, stopLocalTrackOnUnpublish: true });
    room.on(RoomEvent.TrackPublished, (_publication, participant) => {
      if (role === 'viewer') setStatus(`Connected to ${participant.name || 'streamer'} — subscribing to their video…`);
    });
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (role === 'viewer') {
        clearViewerTrackTimer(); setViewerTrackTimedOut(false); attachRemoteTrack(track);
        if (track.kind === Track.Kind.Video) setStatus('Live video connected.');
      }
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => detachRemoteTrack(track));
    room.on(RoomEvent.TrackSubscriptionFailed, (trackSid, participant, reason) => {
      if (role === 'viewer') setStatus(`Could not subscribe to ${participant.name || 'streamer'} video (${reason || trackSid}).`);
    });
    const updateViewerCount = () => { if (role === 'host') setViewerCount(room.remoteParticipants.size); };
    room.on(RoomEvent.ParticipantConnected, updateViewerCount);
    room.on(RoomEvent.ParticipantDisconnected, updateViewerCount);
    room.on(RoomEvent.Disconnected, () => {
      if (activeRef.current?.id === stream.id && modeRef.current === 'viewer') setStatus('Disconnected from the live room.');
    });
    roomRef.current = room;
    return room;
  };

  const stopStreamListing = useCallback(async (stream: LiveStream) => {
    if (!supabase || !user || stream.host_id !== user.id) return;
    if (activeRef.current?.id === stream.id && modeRef.current === 'host') {
      await stopActive();
      return;
    }
    const { error } = await supabase.from('live_streams').delete().eq('id', stream.id).eq('host_id', user.id);
    if (error) toast.error(`Could not stop the stream listing: ${error.message}`);
    else { toast.success('Stream stopped'); void loadStreams(); }
  }, [loadStreams, user?.id]);

  const stopActive = useCallback(async () => {
    const stream = activeRef.current;
    const oldMode = modeRef.current;
    localTracksRef.current.forEach((track) => { try { track.stop(); } catch { /* track already stopped */ } });
    localTracksRef.current = [];
    for (const track of remoteTracksRef.current.values()) detachRemoteTrack(track);
    remoteTracksRef.current.clear();
    clearViewerTrackTimer(); setViewerTrackTimedOut(false);
    if (roomRef.current) {
      await roomRef.current.disconnect(true);
      roomRef.current = null;
    }
    if (oldMode === 'host' && stream && supabase && user) {
      const { error } = await supabase.from('live_streams').delete().eq('id', stream.id).eq('host_id', user.id);
      if (error) toast.error(`The room ended, but its listing could not be removed: ${error.message}`);
      else void loadStreams();
    }
    activeRef.current = null; modeRef.current = null;
    setActive(null); setMode(null); setStatus(''); setViewerCount(0); setPlaybackBlocked(false); setSoundEnabled(false); setBusy(false);
  }, [loadStreams, user?.id]);

  useEffect(() => () => {
    localTracksRef.current.forEach((track) => { try { track.stop(); } catch { /* ignore during unmount */ } });
    if (roomRef.current) void roomRef.current.disconnect(true);
    if (viewerTrackTimerRef.current !== null) window.clearTimeout(viewerTrackTimerRef.current);
  }, []);

  const getLocalCaptureTracks = async () => {
    if (!navigator.mediaDevices) throw new Error('Live capture requires HTTPS and a current browser.');
    if (captureMode === 'screen') {
      if (!navigator.mediaDevices.getDisplayMedia) throw new Error('Screen capture is not available in this browser. On Android, use a browser that offers system screen sharing or choose camera mode.');
      return createLocalScreenTracks({ audio: true, video: true });
    }
    const tracks: LocalTrack[] = [];
    try {
      tracks.push(await createLocalVideoTrack({ facingMode: cameraFacing, resolution: { width: 1280, height: 720, frameRate: 30 } }));
      tracks.push(await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true }));
      return tracks;
    } catch (error) {
      tracks.forEach((track) => track.stop());
      throw error;
    }
  };

  const startStream = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) { toast.error('Sign in to start streaming. Anyone can spectate public streams.'); return; }
    if (!supabase || !selectedGame || title.trim().length < 3 || busy) return;
    setBusy(true); setStatus(captureMode === 'screen' ? 'Choose the screen/app to capture…' : 'Allow camera and microphone…');
    let localTracks: LocalTrack[] = [];
    try {
      // Capture directly from the click gesture; browsers require this for screen sharing.
      localTracks = await getLocalCaptureTracks();
      localTracksRef.current = localTracks;
    } catch (error) {
      setBusy(false); setStatus(''); toast.error(error instanceof Error ? error.message : 'Could not capture media.'); return;
    }
    const { data: row, error: insertError } = await supabase.from('live_streams').insert({ host_id: user.id, game_id: selectedGame, title: title.trim() })
      .select('id,host_id,game_id,title,created_at,games(title,cover_url),profiles(username,display_name,avatar_url)').single();
    if (insertError || !row) {
      localTracks.forEach((track) => track.stop()); localTracksRef.current = []; setBusy(false); setStatus('');
      toast.error(insertError?.message || 'Could not create the live listing.'); return;
    }
    const stream = row as unknown as LiveStream;
    const room = makeRoom(stream, 'host');
    activeRef.current = stream; modeRef.current = 'host'; setActive(stream); setMode('host');
    try {
      const { url, token } = await getToken(stream, 'host');
      setStatus('Connecting to LiveKit…');
      await room.connect(url, token, { autoSubscribe: true });
      for (const track of localTracks) {
        const isVideo = track.kind === Track.Kind.Video;
        const source = captureMode === 'screen'
          ? (isVideo ? Track.Source.ScreenShare : Track.Source.ScreenShareAudio)
          : (isVideo ? Track.Source.Camera : Track.Source.Microphone);
        await room.localParticipant.publishTrack(track, { source });
        if (isVideo && localVideoRef.current) track.attach(localVideoRef.current);
        if (isVideo) track.mediaStreamTrack.addEventListener('ended', () => { void stopActive(); }, { once: true });
      }
      setStatus(`${captureMode === 'screen' ? 'Screen share' : 'Camera stream'} is live through LiveKit. Spectators can join now.`);
      setBusy(false); void loadStreams();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'LiveKit connection failed.';
      toast.error(`Stream could not start: ${message}`);
      await room.disconnect(true);
      localTracks.forEach((track) => track.stop()); localTracksRef.current = [];
      await supabase.from('live_streams').delete().eq('id', stream.id).eq('host_id', user.id);
      roomRef.current = null; activeRef.current = null; modeRef.current = null;
      setActive(null); setMode(null); setBusy(false); setStatus(''); void loadStreams();
    }
  };

  const spectate = async (stream: LiveStream) => {
    if (!supabase || busy) return;
    if (user && stream.host_id === user.id) { toast.info('Your stream is already open.'); return; }
    setBusy(true); setActive(stream); setMode('viewer'); setStatus('Requesting secure LiveKit access…'); setPlaybackBlocked(false); setSoundEnabled(false); setViewerTrackTimedOut(false);
    activeRef.current = stream; modeRef.current = 'viewer';
    const room = makeRoom(stream, 'viewer');
    try {
      const { url, token } = await getToken(stream, 'viewer');
      await room.connect(url, token, { autoSubscribe: true });
      setStatus('Connected to LiveKit — waiting for the host to publish video…'); setBusy(false);
      clearViewerTrackTimer();
      viewerTrackTimerRef.current = window.setTimeout(() => {
        if (remoteTracksRef.current.size === 0) {
          setViewerTrackTimedOut(true);
          setStatus('Room connected, but the host has not delivered video. Ask them to confirm their stream is live, then leave and rejoin.');
        }
      }, 12000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not connect to the live stream.';
      toast.error(`Spectating failed: ${message}`);
      setStatus(`Could not connect: ${message}`); setBusy(false);
      await room.disconnect(true); roomRef.current = null; activeRef.current = null; modeRef.current = null;
    }
  };

  return <>
    <PageTitle eyebrow="LIVE LOBBY" title="Watch live players." description="LiveKit streams use a media relay for more reliable connections; screen sharing still depends on browser support." />
    {!active && <section className="panel live-host-panel"><div><span className="eyebrow">{user ? 'GO LIVE' : 'OPEN SPECTATING'}</span><h2>{user ? 'Stream your session' : 'Watch without signing in'}</h2><p>{user ? (captureMode === 'screen' ? 'Choose a screen or app. Android will open the system sharing picker where supported; otherwise switch to camera capture.' : 'Stream with your front/rear camera and mic. For game screen capture, choose Share screen if your Android browser supports it.') : 'Anyone can watch a public stream. Sign in only if you want to start your own broadcast.'}</p></div>{user ? <form className="live-host-form" onSubmit={(event) => void startStream(event)}><label>Stream source<select value={captureMode} onChange={(event) => setCaptureMode(event.target.value as 'screen' | 'camera')}><option value="camera">Phone/tablet camera + microphone</option><option value="screen" disabled={typeof navigator !== 'undefined' && !navigator.mediaDevices?.getDisplayMedia}>Share screen/app</option></select></label>{captureMode === 'camera' && <label>Camera<select value={cameraFacing} onChange={(event) => setCameraFacing(event.target.value as 'user' | 'environment')}><option value="environment">Rear camera</option><option value="user">Front camera</option></select></label>}<label>Game<select required value={selectedGame} onChange={(event) => setSelectedGame(event.target.value)}><option value="">Choose a game</option>{games.map((game) => <option value={game.id} key={game.id}>{game.title}</option>)}</select></label><label>Stream title<input required minLength={3} maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ranked grind — squad welcome" /></label><button className="btn btn-primary" disabled={busy || !selectedGame || title.trim().length < 3}>{captureMode === 'screen' ? <ScreenShare size={16} /> : <Camera size={16} />}{busy ? 'Connecting…' : 'Start streaming'}</button></form> : <Link className="btn btn-quiet" to="/login?next=%2Flive">Sign in to stream</Link>}{status && <p className="live-status" role="status">{status}</p>}</section>}
    {active && <section className="live-stage panel"><div className="live-stage-head"><div><span className="live-indicator"><i /> {mode === 'host' ? 'YOU ARE LIVE' : 'LIVE SPECTATING'}</span><h2>{active.title}</h2><p>{active.games?.title || 'Game'} · @{active.profiles?.username || 'player'}</p></div><div className="live-head-actions">{mode === 'host' && <span className="spectator-count"><Users size={15} /> {viewerCount} watching</span>}{mode === 'viewer' && <button className="btn btn-quiet btn-small" onClick={() => { if (!remoteVideoRef.current) return; const next = !soundEnabled; remoteVideoRef.current.muted = !next; setSoundEnabled(next); void remoteVideoRef.current.play().catch(() => setPlaybackBlocked(true)); }}>{soundEnabled ? 'Mute' : 'Enable sound'}</button>}<button className={`btn btn-small ${mode === 'host' ? 'btn-danger' : 'btn-quiet'}`} onClick={() => void stopActive()}><Square size={14} />{mode === 'host' ? 'Stop stream' : 'Leave spectating'}</button></div></div><div className="live-video-wrap"><video ref={mode === 'host' ? localVideoRef : remoteVideoRef} autoPlay playsInline muted={mode === 'host' || !soundEnabled} controls={mode === 'viewer'} onPlaying={() => setPlaybackBlocked(false)} />{playbackBlocked && mode === 'viewer' && <button className="live-video-overlay live-tap-play" onClick={() => void remoteVideoRef.current?.play().then(() => setPlaybackBlocked(false)).catch(() => toast.error('Tap the video player to start playback.'))}><Video size={22} /><strong>Tap to play live stream</strong></button>}{viewerTrackTimedOut && mode === 'viewer' && <div className="live-video-overlay"><Video size={22} /><strong>No video track is being published</strong><small>Check the host’s stream status and screen/camera permissions.</small></div>}</div><div ref={audioContainerRef} className="livekit-audio-track" aria-hidden="true" />{status && <p className="live-status" role="status">{status}</p>}</section>}
    <section className="content-section live-directory"><SectionHeading title="Live now" />{loading ? <LoadingCards count={2} /> : streams.length ? <div className="live-stream-grid">{streams.map((stream) => <article className="live-stream-card panel" key={stream.id}><div className="live-card-art">{stream.games?.cover_url ? <img src={stream.games.cover_url} alt="" /> : <Gamepad2 size={28} />}<span className="live-badge"><i /> LIVE</span></div><div className="live-card-copy"><strong>{stream.title}</strong><span>{stream.games?.title || 'Game'} · {new Date(stream.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><Link className="live-host-link" to={`/players/${stream.profiles?.username || ''}`}><Avatar name={stream.profiles?.display_name || stream.profiles?.username || 'Player'} src={stream.profiles?.avatar_url} size="sm" />@{stream.profiles?.username || 'player'}</Link></div>{stream.host_id === user?.id ? <button className="btn btn-danger btn-small" disabled={busy} onClick={() => void stopStreamListing(stream)}><Square size={14} />Stop stream</button> : <button className="btn btn-primary btn-small" disabled={busy || mode !== null} onClick={() => void spectate(stream)}><Video size={14} />Spectate</button>}</article>)}</div> : <EmptyState title="No one is live right now" detail="Start a stream to let your community watch your game session." icon={Radio} />}</section>
  </>;
}
