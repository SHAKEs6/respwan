import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowDownUp, ArrowRight, Bell, CalendarDays, Check, ChevronRight, CircleAlert, Gamepad2,
  Heart, ImagePlus, LockKeyhole, MessageCircle, Plus, Search, Send, Shield, ShieldAlert, Star, Swords,
  ThumbsUp, Trophy, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, Brand, EmptyState, LoadingCards, PageTitle, SectionHeading } from './components';
import { useAuth } from './lib/auth';
import { isSupabaseConfigured, supabase } from './lib/supabase';

const art = {
  arena: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1600&q=85',
  neon: 'https://images.unsplash.com/photo-1593305841991-05c297ba4575?auto=format&fit=crop&w=1000&q=82',
};

type Game = { id: string; title: string; cover_url: string | null; description: string | null; release_date: string | null; platforms: string[] | null; genres?: string[] | null; average_rating?: number | null; review_count?: number | null; popularity?: number | null };
type Post = { id: string; body: string; image_url: string | null; created_at: string; author_id: string; profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null; post_reactions?: { user_id: string }[]; post_comments?: { id: string }[] };
type Tournament = { id: string; title: string; game_id: string; start_at: string; registration_deadline: string; participant_limit: number | null; status: string; games?: { title: string; cover_url: string | null } | null; tournament_participants?: { id: string }[] };

function useLoad<T>(loader: () => Promise<T>, dependencies: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await loader()); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load data.'); }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
  useEffect(() => { void reload(); }, [reload]);
  return { data, loading, error, reload };
}

function GameCard({ game, index = 0 }: { game: Game; index?: number }) {
  return <Link to={`/games/${game.id}`} className={`game-card game-card-${index % 4}`}>
    <div className="game-art">{game.cover_url ? <img src={game.cover_url} alt="" loading="lazy" /> : <div className="cover-fallback"><Gamepad2 size={32} /><span>{game.title.slice(0, 1)}</span></div>}<span className="cover-shade" /><span className="cover-rating"><Star size={12} fill="currentColor" />{game.average_rating ? Number(game.average_rating).toFixed(1) : 'New'}</span></div>
    <div className="game-meta"><strong>{game.title}</strong><span>{game.genres?.slice(0, 2).join(' · ') || game.platforms?.slice(0, 2).join(' · ') || 'Game'}</span></div>
  </Link>;
}

function PostCard({ post, onReact }: { post: Post; onReact?: (id: string) => void }) {
  const { user } = useAuth();
  const author = post.profiles;
  const reacted = Boolean(post.post_reactions?.some((reaction) => reaction.user_id === user?.id));
  return <article className="post-card">
    <div className="post-author"><Link to={`/players/${author?.username ?? ''}`}><Avatar name={author?.display_name || author?.username || 'Player'} src={author?.avatar_url} /></Link><div><Link to={`/players/${author?.username ?? ''}`} className="post-name">{author?.display_name || author?.username || 'RESPAWN player'}</Link><span className="post-handle">{author?.username ? `@${author.username}` : 'Community member'} · {timeAgo(post.created_at)}</span></div><button className="icon-button post-more" aria-label="Report post" onClick={() => reportContent('post', post.id)}>•••</button></div>
    <p className="post-body">{post.body}</p>
    {post.image_url && <img className="post-image" src={post.image_url} alt="Attachment shared by a community member" loading="lazy" />}
    <div className="post-actions"><button className={reacted ? 'reacted' : ''} onClick={() => onReact?.(post.id)} disabled={!user}><Heart size={16} fill={reacted ? 'currentColor' : 'none'} />{post.post_reactions?.length ?? 0}</button><Link to="/community"><MessageCircle size={16} />{post.post_comments?.length ?? 0}</Link><span className="post-action-spacer" /><span className="post-tag"><Gamepad2 size={13} /> Community</span></div>
  </article>;
}

function TournamentCard({ tournament }: { tournament: Tournament }) {
  return <Link to={`/tournaments/${tournament.id}`} className="tournament-card">
    <div className="tournament-art">{tournament.games?.cover_url ? <img src={tournament.games.cover_url} alt="" loading="lazy" /> : <Swords size={24} />}<span className="tournament-status">{tournament.status}</span></div>
    <div className="tournament-info"><span className="eyebrow">{tournament.games?.title || 'Tournament'}</span><strong>{tournament.title}</strong><span><CalendarDays size={14} />{new Date(tournament.start_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><span><Users size={14} />{tournament.tournament_participants?.length ?? 0}{tournament.participant_limit ? ` / ${tournament.participant_limit}` : ''} registered</span></div>
    <ChevronRight className="tournament-arrow" size={18} />
  </Link>;
}

export function HomePage() {
  const games = useLoad(async () => {
    if (!supabase) return [];
    const { data, error } = await supabase.from('games').select('id,title,cover_url,description,release_date,platforms,average_rating,review_count,popularity').eq('is_published', true).order('popularity', { ascending: false }).limit(5);
    if (error) throw error; return (data ?? []) as Game[];
  });
  const tournaments = useLoad(async () => {
    if (!supabase) return [];
    const { data, error } = await supabase.from('tournaments').select('id,title,game_id,start_at,registration_deadline,participant_limit,status,games(title,cover_url),tournament_participants(id)').in('status', ['registration_open','upcoming']).order('start_at').limit(3);
    if (error) throw error; return (data ?? []) as unknown as Tournament[];
  });
  const posts = useLoad(async () => {
    if (!supabase) return [];
    const { data, error } = await supabase.from('posts').select('id,body,image_url,created_at,author_id,profiles(username,display_name,avatar_url),post_reactions(user_id),post_comments(id)').eq('status', 'published').order('created_at', { ascending: false }).limit(2);
    if (error) throw error; return (data ?? []) as unknown as Post[];
  });
  const leaders = useLoad(async () => {
    if (!supabase) return [];
    const { data, error } = await supabase.from('profiles').select('id,username,display_name,avatar_url,xp,level').order('xp', { ascending: false }).limit(3);
    if (error) throw error; return data ?? [];
  });
  const reviewRows = useLoad(async () => {
    if (!supabase) return [];
    const { data, error } = await supabase.from('reviews').select('id,rating,body,created_at,profiles(username,display_name),games(id,title)').eq('status', 'published').order('created_at', { ascending: false }).limit(2);
    if (error) throw error; return data ?? [];
  });
  return <>
    <section className="hero-panel" style={{ backgroundImage: `linear-gradient(90deg, rgba(8,10,9,.98) 0%, rgba(8,10,9,.82) 45%, rgba(8,10,9,.22) 100%), linear-gradient(0deg, #090b0a, transparent 40%), url(${art.arena})` }}>
      <div className="hero-content"><span className="hero-kicker"><span className="live-dot" /> THE PLAYER-FIRST GAMING COMMUNITY</span><h1>Find your<br /><span>next level.</span></h1><p>Discover games. Build your squad. Make every match count.</p><div className="hero-actions"><Link className="btn btn-primary" to="/discover">Explore games <ArrowRight size={17} /></Link><Link className="btn btn-glass" to="/community">Enter community</Link></div><div className="hero-proof"><span className="proof-avatars"><Avatar name="V" size="sm" /><Avatar name="R" size="sm" /><Avatar name="J" size="sm" /></span><span>Built for players, by players</span></div></div>
      <div className="hero-badge"><span className="hero-badge-icon"><Trophy size={17} /></span><span><b>YOUR GAME.</b><small>YOUR PEOPLE.</small></span></div>
    </section>
    <div className="home-intro"><div><p className="eyebrow">THE DROP ZONE</p><h2>What’s happening, player?</h2></div><Link to="/discover" className="text-link">Explore the platform <ArrowRight size={15} /></Link></div>
    <section className="content-section"><SectionHeading title="Featured games" link="Browse all" to="/discover" />{games.loading ? <LoadingCards count={5} /> : games.data?.length ? <div className="games-grid">{games.data.map((game, i) => <GameCard key={game.id} game={game} index={i} />)}</div> : <EmptyState title="Your discovery starts soon" detail={isSupabaseConfigured ? 'There are no published games yet. An admin can add games in the dashboard.' : 'Connect your Supabase project and apply the database seed to publish the starting game catalog.'} icon={Gamepad2} action={<Link className="text-link" to="/discover">Explore discover <ArrowRight size={14} /></Link>} />}</section>
    <section className="home-two-col">
      <div className="content-section"><SectionHeading title="Community pulse" link="Open feed" to="/community" />{posts.loading ? <LoadingCards count={1} /> : posts.data?.length ? <div className="post-list">{posts.data.map((post) => <PostCard key={post.id} post={post} />)}</div> : <EmptyState title="The feed is warming up" detail="When players share their plays, clips, and takes, you’ll find them here." icon={MessageCircle} />}</div>
      <div className="content-section"><SectionHeading title="Top players" link="Full rankings" to="/leaderboards" />{leaders.loading ? <LoadingCards count={2} /> : leaders.data?.length ? <div className="leader-card">{leaders.data.map((player: any, i: number) => <Link to={`/players/${player.username}`} className="leader-row" key={player.id}><span className={`rank-number rank-${i + 1}`}>{String(i + 1).padStart(2, '0')}</span><Avatar name={player.display_name || player.username} src={player.avatar_url} /><span className="leader-name"><strong>{player.display_name || player.username}</strong><small>Level {player.level}</small></span><span className="leader-xp">{Number(player.xp).toLocaleString()} XP</span></Link>)}</div> : <EmptyState title="Ranks are waiting" detail="Player rankings are calculated from the verified XP ledger. Be the first to climb." icon={Trophy} />}</div>
    </section>
    <section className="content-section"><SectionHeading title="Upcoming tournaments" link="Tournament hub" to="/tournaments" />{tournaments.loading ? <LoadingCards count={2} /> : tournaments.data?.length ? <div className="tournament-list">{tournaments.data.map((item) => <TournamentCard key={item.id} tournament={item} />)}</div> : <EmptyState title="No tournaments on the board" detail="Check back for upcoming competitions or ask an approved organizer to create one." icon={Swords} action={<Link to="/tournaments" className="text-link">Visit tournaments <ArrowRight size={14} /></Link>} />}</section>
    <section className="home-two-col bottom-sections"><div className="content-section"><SectionHeading title="Latest reviews" link="Discover games" to="/discover" />{reviewRows.loading ? <LoadingCards count={1} /> : reviewRows.data?.length ? <div className="review-stack">{reviewRows.data.map((review: any) => <Link to={`/games/${review.games?.id}`} className="review-mini" key={review.id}><span className="review-stars"><Star size={14} fill="currentColor" /> {review.rating}/10</span><strong>{review.games?.title || 'Game review'}</strong><span>{review.body}</span><small>by @{review.profiles?.username || 'player'} · {timeAgo(review.created_at)}</small></Link>)}</div> : <EmptyState title="No reviews yet" detail="The next great recommendation could be yours." icon={Star} />}</div><div className="community-callout"><div className="callout-orbit orbit-a" /><div className="callout-orbit orbit-b" /><span className="callout-icon"><Users size={20} /></span><p className="eyebrow">SQUAD UP</p><h2>Every great run<br />starts with a crew.</h2><p>Find the people who make your favorite games even better.</p><Link className="btn btn-primary" to="/community">Find your community <ArrowRight size={16} /></Link></div></section>
  </>;
}

export function DiscoverPage() {
  const [term, setTerm] = useState('');
  const [genre, setGenre] = useState('All genres');
  const [sort, setSort] = useState('popular');
  const [games, setGames] = useState<Game[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    if (!supabase) { setGames([]); setGenres([]); setLoading(false); return; }
    let request = supabase.from('games').select('id,title,cover_url,description,release_date,platforms,average_rating,review_count,popularity,game_genres(genres(name))').eq('is_published', true);
    if (term.trim()) request = request.ilike('title', `%${term.trim().replaceAll('%', '\\%')}%`);
    if (sort === 'recent') request = request.order('created_at', { ascending: false });
    else if (sort === 'rating') request = request.order('average_rating', { ascending: false, nullsFirst: false });
    else request = request.order('popularity', { ascending: false });
    const { data, error: requestError } = await request.limit(60);
    if (requestError) setError(requestError.message);
    else {
      const formatted = (data ?? []).map((game: any) => ({ ...game, genres: game.game_genres?.map((row: any) => row.genres?.name).filter(Boolean) ?? [] })) as Game[];
      setGenres([...new Set(formatted.flatMap((g) => g.genres ?? []))].sort());
      setGames(genre === 'All genres' ? formatted : formatted.filter((g) => g.genres?.includes(genre)));
    }
    setLoading(false);
  }, [term, sort, genre]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 180); return () => window.clearTimeout(timer); }, [load]);
  return <>
    <PageTitle eyebrow="THE GAME LIBRARY" title="Find your next obsession." description="A player-curated catalog for the games worth your time." />
    <div className="discover-controls"><label className="input-with-icon"><Search size={17} /><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search titles..." aria-label="Search game catalog" /></label><label className="select-wrap"><span className="sr-only">Filter by genre</span><select value={genre} onChange={(e) => setGenre(e.target.value)}><option>All genres</option>{genres.map((value) => <option key={value}>{value}</option>)}</select></label><label className="select-wrap sort-select"><ArrowDownUp size={15} /><span className="sr-only">Sort games</span><select value={sort} onChange={(e) => setSort(e.target.value)}><option value="popular">Popular</option><option value="rating">Top rated</option><option value="recent">Recently added</option></select></label></div>
    <div className="result-count">{loading ? 'Loading games…' : `${games.length} ${games.length === 1 ? 'game' : 'games'} in the catalog`}</div>
    {error && <div className="inline-error"><CircleAlert size={16} />{error}</div>}
    {loading ? <LoadingCards count={6} /> : games.length ? <div className="games-grid discover-grid">{games.map((game, i) => <GameCard key={game.id} game={game} index={i} />)}</div> : <EmptyState title={term || genre !== 'All genres' ? 'No matches found' : 'No games in the catalog yet'} detail={term || genre !== 'All genres' ? 'Try another title or remove the genre filter.' : isSupabaseConfigured ? 'An administrator can add games from the protected dashboard.' : 'Configure Supabase and apply the seed migration to load real catalog records.'} icon={Search} action={term || genre !== 'All genres' ? <button className="btn btn-quiet" onClick={() => { setTerm(''); setGenre('All genres'); }}>Clear filters</button> : undefined} />}
  </>;
}

export function GamePage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [game, setGame] = useState<Game | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(8);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    if (!supabase) { setGame(null); setReviews([]); setLoading(false); return; }
    const [gameResult, reviewResult] = await Promise.all([
      supabase.from('games').select('id,title,cover_url,description,release_date,platforms,average_rating,review_count,game_genres(genres(name))').eq('id', id).eq('is_published', true).maybeSingle(),
      supabase.from('reviews').select('id,rating,body,created_at,user_id,profiles(username,display_name,avatar_url),review_votes(user_id)').eq('game_id', id).eq('status', 'published').order('created_at', { ascending: false }).limit(30),
    ]);
    if (gameResult.error) toast.error(gameResult.error.message);
    if (gameResult.data) setGame({ ...gameResult.data, genres: (gameResult.data as any).game_genres?.map((row: any) => row.genres?.name).filter(Boolean) } as Game);
    setReviews(reviewResult.data ?? []);
    setLoading(false);
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !supabase) return;
    if (body.trim().length < 20) { toast.error('Reviews need at least 20 characters.'); return; }
    setSaving(true);
    const { error } = await supabase.from('reviews').upsert({ user_id: user.id, game_id: id, rating, body: body.trim(), status: 'published' }, { onConflict: 'user_id,game_id' });
    setSaving(false);
    if (error) toast.error(error.message); else { toast.success('Review published'); setBody(''); await load(); }
  };
  const vote = async (reviewId: string) => {
    if (!user || !supabase) { toast.error('Sign in to vote on reviews.'); return; }
    const current = reviews.find((review) => review.id === reviewId);
    const hasVoted = current?.review_votes?.some((voteRow: any) => voteRow.user_id === user.id);
    const result = hasVoted ? await supabase.from('review_votes').delete().eq('review_id', reviewId).eq('user_id', user.id) : await supabase.from('review_votes').insert({ review_id: reviewId, user_id: user.id });
    if (result.error) toast.error(result.error.message); else await load();
  };
  if (loading) return <><div className="skeleton hero-skeleton" /><LoadingCards count={2} /></>;
  if (!game) return <EmptyState title="Game not found" detail="This game may have been removed or is not published." icon={Gamepad2} action={<Link className="btn btn-primary" to="/discover">Back to discover</Link>} />;
  return <>
    <section className="game-detail-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(9,11,10,.98), rgba(9,11,10,.7) 55%, rgba(9,11,10,.25)), linear-gradient(0deg, #090b0a, transparent 50%), url(${game.cover_url || art.neon})` }}>
      <div className="breadcrumb"><Link to="/discover">Discover</Link><ChevronRight size={14} /><span>{game.title}</span></div>
      <div className="game-detail-copy"><p className="eyebrow">{game.genres?.join(' · ') || 'FEATURED GAME'}</p><h1>{game.title}</h1><div className="game-detail-stats"><span><Star size={16} fill="currentColor" />{game.average_rating ? Number(game.average_rating).toFixed(1) : 'No rating'} <small>community rating</small></span><span><MessageCircle size={16} />{game.review_count ?? reviews.length} <small>reviews</small></span></div><p>{game.description || 'This game is in the RESPAWN catalog. Reviews and recommendations from the community will appear here.'}</p><div className="platform-pills">{game.platforms?.map((platform) => <span key={platform}>{platform}</span>)}</div></div>
    </section>
    <section className="content-section reviews-section"><SectionHeading title="Player reviews" />{user ? <form className="review-form panel" onSubmit={submit}><div className="review-form-heading"><div><p className="eyebrow">YOUR TAKE</p><strong>How would you rate {game.title}?</strong></div><label className="rating-select"><Star size={15} fill="currentColor" /><select value={rating} onChange={(event) => setRating(Number(event.target.value))} aria-label="Your rating">{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} / 10</option>)}</select></label></div><textarea value={body} onChange={(event) => setBody(event.target.value)} minLength={20} maxLength={3000} placeholder="What did you love? What should other players know?" aria-label="Write your game review" /><div className="review-form-footer"><small>{body.length}/3000 · At least 20 characters</small><button className="btn btn-primary btn-small" disabled={saving || body.trim().length < 20}>{saving ? 'Publishing…' : 'Publish review'} <ArrowRight size={15} /></button></div></form> : <div className="signin-nudge"><span className="empty-icon"><Star size={19} /></span><span><strong>Played it? Leave a review.</strong><small>Sign in to share your rating with the community.</small></span><Link to="/login" className="btn btn-quiet btn-small">Sign in</Link></div>}
      {reviews.length ? <div className="review-list">{reviews.map((review) => <article className="review-card" key={review.id}><div className="review-card-head"><Avatar name={review.profiles?.display_name || review.profiles?.username || 'Player'} src={review.profiles?.avatar_url} /><div className="reviewer"><strong>{review.profiles?.display_name || review.profiles?.username || 'Player'}</strong><small>@{review.profiles?.username || 'community'} · {timeAgo(review.created_at)}</small></div><span className="review-score"><Star size={14} fill="currentColor" />{review.rating}<small>/10</small></span></div><p>{review.body}</p><div className="review-card-actions"><button onClick={() => void vote(review.id)}><ThumbsUp size={14} /> Helpful · {review.review_votes?.length ?? 0}</button>{review.user_id === user?.id && <button className="review-edit" onClick={() => { setRating(review.rating); setBody(review.body); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit your review</button>}</div></article>)}</div> : <EmptyState title="No reviews yet" detail="Start the conversation with a helpful, honest review." icon={MessageCircle} />}</section>
  </>;
}

export function CommunityPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 12;
  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    if (!supabase) { setPosts([]); setLoading(false); return; }
    const { data, error } = await supabase.from('posts').select('id,body,image_url,created_at,author_id,profiles(username,display_name,avatar_url),post_reactions(user_id),post_comments(id)').eq('status', 'published').order('created_at', { ascending: false }).range(nextPage * pageSize, nextPage * pageSize + pageSize - 1);
    if (error) toast.error(error.message); else setPosts((data ?? []) as unknown as Post[]);
    setLoading(false);
  }, [page]);
  useEffect(() => { void load(page); }, [page, load]);
  const publish = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !supabase) return;
    if (body.trim().length < 2) { toast.error('Add a little more to your post.'); return; }
    if (file && (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024)) { toast.error('Choose an image under 8 MB.'); return; }
    setPosting(true);
    let image_url: string | null = null;
    if (file) {
      const safeName = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { data: uploaded, error: uploadError } = await supabase.storage.from('community-media').upload(safeName, file, { contentType: file.type, upsert: false });
      if (uploadError) { setPosting(false); toast.error(uploadError.message); return; }
      image_url = supabase.storage.from('community-media').getPublicUrl(uploaded.path).data.publicUrl;
    }
    const { error } = await supabase.from('posts').insert({ author_id: user.id, body: body.trim(), image_url });
    setPosting(false);
    if (error) toast.error(error.message); else { setBody(''); setFile(null); toast.success('Post shared'); setPage(0); await load(0); }
  };
  const react = async (postId: string) => {
    if (!user || !supabase) { toast.error('Sign in to react.'); return; }
    const post = posts.find((item) => item.id === postId);
    const exists = post?.post_reactions?.some((reaction) => reaction.user_id === user.id);
    const result = exists ? await supabase.from('post_reactions').delete().eq('post_id', postId).eq('user_id', user.id) : await supabase.from('post_reactions').insert({ post_id: postId, user_id: user.id, reaction: 'like' });
    if (result.error) toast.error(result.error.message); else await load(page);
  };
  return <>
    <PageTitle eyebrow="THE LOBBY" title="Community" description="Highlights, hot takes, clips, and the players behind them." action={user && <button className="btn btn-primary" onClick={() => document.getElementById('post-composer')?.focus()}><Plus size={17} /> New post</button>} />
    {user && <form className="composer panel" onSubmit={publish}><Avatar name={user.email || 'Player'} /><div className="composer-main"><textarea id="post-composer" value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} placeholder="What are you playing today?" aria-label="Write a community post" /><div className="composer-actions">{file && <span className="selected-file">{file.name}<button type="button" onClick={() => setFile(null)} aria-label="Remove attachment">×</button></span>}<label className="icon-button upload-button" title="Attach an image"><ImagePlus size={17} /><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><small>{body.length}/2000</small><button className="btn btn-primary btn-small" disabled={posting || !body.trim()}>{posting ? 'Sharing…' : 'Share post'} <Send size={14} /></button></div></div></form>}
    {!user && <div className="join-banner"><div><p className="eyebrow">YOUR PEOPLE ARE HERE</p><strong>Join the conversation.</strong><span>Sign in to share clips, reactions, and the latest from your game.</span></div><Link to="/login" className="btn btn-primary btn-small">Sign in</Link></div>}
    <div className="feed-toolbar"><span><span className="live-dot" /> Latest from the lobby</span><button className="filter-chip" onClick={() => { setPage(0); void load(0); }}>Refresh <ArrowDownUp size={14} /></button></div>
    {loading ? <LoadingCards count={3} /> : posts.length ? <><div className="post-list">{posts.map((post) => <PostCard key={post.id} post={post} onReact={(id) => void react(id)} />)}</div><div className="pagination"><button className="btn btn-quiet btn-small" disabled={page === 0} onClick={() => setPage((old) => Math.max(0, old - 1))}>Newer</button><span>Page {page + 1}</span><button className="btn btn-quiet btn-small" disabled={posts.length < pageSize} onClick={() => setPage((old) => old + 1)}>Older</button></div></> : <EmptyState title="No posts in the lobby yet" detail="Be the first to share a play, a clip, or a question." icon={MessageCircle} />}
  </>;
}

export function TournamentsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('All');
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [gameId, setGameId] = useState('');
  const [games, setGames] = useState<Game[]>([]);
  const [startAt, setStartAt] = useState('');
  const [limit, setLimit] = useState('32');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    if (!supabase) { setItems([]); setLoading(false); return; }
    let request = supabase.from('tournaments').select('id,title,game_id,start_at,registration_deadline,participant_limit,status,games(title,cover_url),tournament_participants(id)').order('start_at').limit(60);
    if (tab === 'Open') request = request.eq('status', 'registration_open');
    if (tab === 'Upcoming') request = request.eq('status', 'upcoming');
    const { data, error } = await request;
    if (error) toast.error(error.message); else setItems((data ?? []) as unknown as Tournament[]);
    setLoading(false);
  }, [tab]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!supabase || !user) return; supabase.from('games').select('id,title').eq('is_published', true).order('title').then(({ data }) => setGames((data ?? []) as Game[])); }, [user]);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !user || !gameId || !startAt) return;
    setBusy(true);
    const starts = new Date(startAt);
    const { error } = await supabase.from('tournaments').insert({ organizer_id: user.id, title: title.trim(), game_id: gameId, start_at: starts.toISOString(), registration_deadline: starts.toISOString(), participant_limit: Number(limit), status: 'registration_open', format: 'single_elimination' });
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success('Tournament created'); setCreateOpen(false); setTitle(''); await load(); }
  };
  const register = async (tournamentId: string) => {
    if (!user || !supabase) { toast.error('Sign in to register.'); return; }
    const { error } = await supabase.from('tournament_participants').insert({ tournament_id: tournamentId, user_id: user.id, participant_type: 'individual', status: 'registered' });
    if (error) toast.error(error.message); else { toast.success('Registration confirmed'); await load(); }
  };
  return <>
    <PageTitle eyebrow="ENTER THE ARENA" title="Tournaments" description="Find your next bracket. Compete with players across the community." action={user && <button className="btn btn-primary" onClick={() => setCreateOpen((open) => !open)}><Plus size={17} /> Host tournament</button>} />
    {createOpen && <form className="panel tournament-create" onSubmit={create}><div className="section-heading"><h2>Create a tournament</h2><button className="text-link" type="button" onClick={() => setCreateOpen(false)}>Cancel</button></div><p className="form-note">Tournament hosting requires an organizer or administrator role. Results are manually verified; no game API verification is implied.</p><div className="form-grid"><label>Title<input required minLength={4} maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Friday Night Finals" /></label><label>Game<select required value={gameId} onChange={(e) => setGameId(e.target.value)}><option value="">Choose a game</option>{games.map((game) => <option key={game.id} value={game.id}>{game.title}</option>)}</select></label><label>Starts at<input required type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></label><label>Player limit<input type="number" min="2" max="256" value={limit} onChange={(e) => setLimit(e.target.value)} /></label></div><button className="btn btn-primary btn-small" disabled={busy}>{busy ? 'Creating…' : 'Create tournament'}</button></form>}
    {!user && <div className="join-banner"><div><p className="eyebrow">READY TO COMPETE?</p><strong>Sign in to register.</strong><span>Players can join open tournaments after signing in.</span></div><Link to="/login" className="btn btn-primary btn-small">Sign in</Link></div>}
    <div className="segmented-tabs" role="tablist" aria-label="Tournament status">{['All','Open','Upcoming','Completed'].map((label) => <button role="tab" aria-selected={tab === label} className={tab === label ? 'selected' : ''} key={label} onClick={() => setTab(label)}>{label}</button>)}</div>
    {loading ? <LoadingCards count={3} /> : items.length ? <div className="tournament-directory">{items.map((item) => <div className="tournament-row-wrap" key={item.id}><TournamentCard tournament={item} />{user && item.status === 'registration_open' && <button className="btn btn-primary btn-small tournament-register" onClick={() => void register(item.id)}>Register <ArrowRight size={14} /></button>}</div>)}</div> : <EmptyState title="No tournaments in this view" detail="Organized competitions appear here when they’re published. Ask an organizer to schedule the first bracket." icon={Trophy} />}
  </>;
}

export function TournamentPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [tournament, setTournament] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    if (!supabase) { setTournament(null); setLoading(false); return; }
    const [eventResult, matchResult] = await Promise.all([
      supabase.from('tournaments').select('*,games(title,cover_url),tournament_participants(id,user_id,status,profiles(username,display_name,avatar_url))').eq('id', id).maybeSingle(),
      supabase.from('matches').select('id,round_number,match_number,status,scheduled_at,player_one_id,player_two_id,winner_id,profiles!matches_player_one_id_fkey(username,display_name),opponent:profiles!matches_player_two_id_fkey(username,display_name)').eq('tournament_id', id).order('round_number').order('match_number'),
    ]);
    setTournament(eventResult.data); setMatches(matchResult.data ?? []);
    if (eventResult.error) toast.error(eventResult.error.message);
    setLoading(false);
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  const register = async () => {
    if (!user || !supabase) return;
    const { error } = await supabase.from('tournament_participants').insert({ tournament_id: id, user_id: user.id, participant_type: 'individual', status: 'registered' });
    if (error) toast.error(error.message); else { toast.success('Registration confirmed'); await load(); }
  };
  if (loading) return <><div className="skeleton hero-skeleton" /><LoadingCards count={2} /></>;
  if (!tournament) return <EmptyState title="Tournament not found" detail="This competition may no longer be available." icon={Trophy} action={<Link to="/tournaments" className="btn btn-primary">Tournament directory</Link>} />;
  return <>
    <div className="breadcrumb"><Link to="/tournaments">Tournaments</Link><ChevronRight size={14} /><span>{tournament.title}</span></div>
    <section className="detail-banner panel"><div className="detail-banner-cover">{tournament.games?.cover_url ? <img src={tournament.games.cover_url} alt="" /> : <Swords size={30} />}</div><div className="detail-banner-copy"><p className="eyebrow">{tournament.games?.title} · {tournament.status}</p><h1>{tournament.title}</h1><p>{tournament.description || 'Community-run competition. Match results are manually verified by opponents or organizers.'}</p><div className="game-detail-stats"><span><CalendarDays size={15} />{new Date(tournament.start_at).toLocaleString()}</span><span><Users size={15} />{tournament.tournament_participants?.length ?? 0}{tournament.participant_limit ? ` / ${tournament.participant_limit}` : ''} players</span></div></div>{user && tournament.status === 'registration_open' && <button className="btn btn-primary" onClick={() => void register()}>Join tournament <ArrowRight size={16} /></button>}</section>
    <section className="tournament-detail-grid"><div className="panel detail-panel"><SectionHeading title="Bracket & matches" />{matches.length ? <div className="match-list">{matches.map((match) => <div className="match-row" key={match.id}><span className="match-round">ROUND {match.round_number} · MATCH {match.match_number}</span><div><strong>{match.profiles?.display_name || match.profiles?.username || 'TBD'}</strong><span>vs</span><strong>{match.opponent?.display_name || match.opponent?.username || 'TBD'}</strong></div><span className="match-status">{match.status}</span></div>)}</div> : <EmptyState title="Bracket not generated yet" detail="The organizer generates the first single-elimination bracket once registration is finalized." icon={Swords} />}</div><div className="panel detail-panel"><SectionHeading title="Players" />{tournament.tournament_participants?.length ? <div className="participant-list">{tournament.tournament_participants.map((participant: any) => <Link to={`/players/${participant.profiles?.username}`} key={participant.id}><Avatar name={participant.profiles?.display_name || participant.profiles?.username || 'Player'} src={participant.profiles?.avatar_url} /><span>{participant.profiles?.display_name || participant.profiles?.username || 'Player'}</span><span className="status-pill">{participant.status}</span></Link>)}</div> : <EmptyState title="No registered players" detail="Be the first to enter the bracket." icon={Users} />}</div></section>
  </>;
}

export function LeaderboardsPage() {
  const [period, setPeriod] = useState('All time');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    if (!supabase) { setRows([]); setLoading(false); return; }
    if (period === 'All time') {
      const { data, error } = await supabase.from('profiles').select('id,username,display_name,avatar_url,xp,level').order('xp', { ascending: false }).limit(50);
      if (error) toast.error(error.message); else setRows(data ?? []);
    } else {
      const duration = period === 'This week' ? 7 : 30;
      const since = new Date(Date.now() - duration * 86400000).toISOString();
      const { data, error } = await supabase.from('xp_ledger').select('user_id,amount,profiles(id,username,display_name,avatar_url,level)').gte('created_at', since).gt('amount', 0).limit(2000);
      if (error) toast.error(error.message); else {
        const summary = new Map<string, any>();
        for (const entry of data ?? []) {
          const existing = summary.get(entry.user_id) ?? { ...(entry as any).profiles, xp: 0 };
          existing.xp += entry.amount; summary.set(entry.user_id, existing);
        }
        setRows([...summary.values()].sort((a, b) => b.xp - a.xp).slice(0, 50));
      }
    }
    setLoading(false);
  }, [period]);
  useEffect(() => { void load(); }, [load]);
  return <>
    <PageTitle eyebrow="THE CLIMB" title="Leaderboards" description="XP earned through approved, auditable community contributions." />
    <div className="leaderboard-feature"><div className="feature-copy"><span className="eyebrow">RANK UP. SHOW UP.</span><h2>Every contribution<br />moves you forward.</h2><p>XP comes from trusted platform events—never client-submitted scores.</p></div><div className="xp-symbol"><Trophy size={42} /><span>XP</span></div></div>
    <div className="leaderboard-controls"><div className="segmented-tabs" role="tablist">{['This week','This month','All time'].map((item) => <button role="tab" aria-selected={period === item} className={period === item ? 'selected' : ''} key={item} onClick={() => setPeriod(item)}>{item}</button>)}</div><span className="ledger-note"><ShieldAlert size={14} /> Verified XP ledger</span></div>
    {loading ? <LoadingCards count={4} /> : rows.length ? <div className="leaderboard-table"><div className="leaderboard-table-head"><span>RANK</span><span>PLAYER</span><span>LEVEL</span><span>XP EARNED</span></div>{rows.map((player: any, index) => <Link to={`/players/${player.username}`} className="leaderboard-table-row" key={player.id}><span className={`leaderboard-rank ${index < 3 ? `rank-${index + 1}` : ''}`}>{String(index + 1).padStart(2, '0')}</span><span className="leaderboard-player"><Avatar name={player.display_name || player.username} src={player.avatar_url} /><span><strong>{player.display_name || player.username}</strong><small>@{player.username}</small></span></span><span className="level-badge">LVL {player.level ?? 1}</span><strong className="leader-xp">{Number(player.xp || 0).toLocaleString()} XP</strong></Link>)}</div> : <EmptyState title="The board is yours to build" detail="As players earn approved XP, rankings will appear here. No placeholder scores are shown." icon={Trophy} />}
  </>;
}

export function PlayerPage() {
  const { username = '' } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [following, setFollowing] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('Activity');
  const load = useCallback(async () => {
    setLoading(true);
    if (!supabase) { setProfile(null); setLoading(false); return; }
    const { data: player, error } = await supabase.from('profiles').select('id,username,display_name,bio,avatar_url,country,platforms,favorite_games,xp,level,created_at,is_private').eq('username', username).maybeSingle();
    if (error) toast.error(error.message);
    setProfile(player);
    if (player) {
      const [postResult, achievementResult, followResult] = await Promise.all([
        supabase.from('posts').select('id,body,image_url,created_at,author_id,profiles(username,display_name,avatar_url),post_reactions(user_id),post_comments(id)').eq('author_id', player.id).eq('status', 'published').order('created_at', { ascending: false }).limit(20),
        supabase.from('user_achievements').select('id,earned_at,achievements(name,description,badge_icon)').eq('user_id', player.id),
        user ? supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', player.id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      setPosts((postResult.data ?? []) as unknown as Post[]); setAchievements(achievementResult.data ?? []); setFollowing(Boolean(followResult.data));
    }
    setLoading(false);
  }, [username, user?.id]);
  useEffect(() => { void load(); }, [load]);
  const follow = async () => {
    if (!user || !supabase) { toast.error('Sign in to follow players.'); return; }
    if (user.id === profile?.id) return;
    const result = following ? await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', profile.id) : await supabase.from('follows').insert({ follower_id: user.id, following_id: profile.id });
    if (result.error) toast.error(result.error.message); else { setFollowing(!following); toast.success(following ? 'Unfollowed player' : 'Following player'); }
  };
  if (loading) return <><div className="skeleton profile-skeleton" /><LoadingCards count={2} /></>;
  if (!profile || (profile.is_private && profile.id !== user?.id)) return <EmptyState title="Player profile unavailable" detail="This profile doesn’t exist or has limited visibility." icon={Users} action={<Link className="btn btn-primary" to="/community">Explore community</Link>} />;
  const progress = Math.min(100, Math.round((profile.xp % 1000) / 10));
  return <>
    <div className="profile-cover" style={{ backgroundImage: `linear-gradient(90deg,rgba(9,11,10,.9),rgba(9,11,10,.15)), url(${art.arena})` }} />
    <section className="profile-header panel"><Avatar name={profile.display_name || profile.username} src={profile.avatar_url} size="lg" /><div className="profile-ident"><p className="eyebrow">LEVEL {profile.level} PLAYER</p><h1>{profile.display_name || profile.username}</h1><span>@{profile.username} {profile.country && `· ${profile.country}`}</span></div>{profile.id !== user?.id && user && <div className="profile-actions"><button className={`btn ${following ? 'btn-quiet' : 'btn-primary'}`} onClick={() => void follow()}>{following ? <><Check size={16} /> Following</> : <><Plus size={16} /> Follow</>}</button><Link className="btn btn-quiet" to={`/messages?with=${profile.username}`}><MessageCircle size={16} /> Message</Link><button className="icon-button report-button" title="Report player" onClick={() => reportContent('user', profile.id)}><ShieldAlert size={17} /></button></div>}</section>
    <section className="profile-grid"><div className="profile-main"><div className="profile-bio panel"><p>{profile.bio || 'This player hasn’t added a bio yet.'}</p><span>Joined {new Date(profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span></div><div className="segmented-tabs profile-tabs">{['Activity','Achievements','Reviews','Tournaments'].map((item) => <button className={tab === item ? 'selected' : ''} key={item} onClick={() => setTab(item)}>{item}</button>)}</div>{tab === 'Activity' ? posts.length ? <div className="post-list">{posts.map((post) => <PostCard post={post} key={post.id} />)}</div> : <EmptyState title="No public activity yet" detail="Their community posts will show here." icon={MessageCircle} /> : tab === 'Achievements' ? achievements.length ? <div className="achievement-grid">{achievements.map((item) => <div className="achievement-card" key={item.id}><span className="achievement-icon">{item.achievements?.badge_icon || '✦'}</span><strong>{item.achievements?.name}</strong><small>{item.achievements?.description}</small></div>)}</div> : <EmptyState title="No achievements unlocked" detail="Approved milestones will appear here." icon={Trophy} /> : <EmptyState title={`No ${tab.toLowerCase()} yet`} detail="Verified records appear when this player participates on RESPAWN." icon={tab === 'Reviews' ? Star : Swords} />}</div><aside className="profile-aside"><div className="panel xp-panel"><div className="xp-heading"><span className="eyebrow">PLAYER PROGRESS</span><strong>{Number(profile.xp).toLocaleString()} XP</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>{1000 - (profile.xp % 1000)} XP to level {profile.level + 1}</small></div><div className="panel profile-favorites"><SectionHeading title="Favorite games" />{profile.favorite_games?.length ? <div className="favorite-tags">{profile.favorite_games.map((item: string) => <span key={item}><Gamepad2 size={13} />{item}</span>)}</div> : <p className="muted-copy">No favorite games added.</p>}<SectionHeading title="Platforms" />{profile.platforms?.length ? <div className="favorite-tags">{profile.platforms.map((item: string) => <span key={item}>{item}</span>)}</div> : <p className="muted-copy">No platforms added.</p>}</div></aside></section>
  </>;
}

export function SearchPage() {
  const [params] = useSearchParams();
  const [term, setTerm] = useState(params.get('q') || '');
  const [results, setResults] = useState<{ games: Game[]; players: any[]; posts: Post[] }>({ games: [], players: [], posts: [] });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const search = async (event?: FormEvent) => {
    event?.preventDefault();
    const query = term.trim();
    if (!query || !supabase) { setResults({ games: [], players: [], posts: [] }); return; }
    navigate(`/search?q=${encodeURIComponent(query)}`, { replace: true }); setLoading(true);
    const safeQuery = query.replaceAll('%', '\\%').replaceAll('_', '\\_');
    const [games, players, posts] = await Promise.all([
      supabase.from('games').select('id,title,cover_url,description,release_date,platforms,average_rating,review_count,popularity').eq('is_published', true).ilike('title', `%${safeQuery}%`).limit(12),
      supabase.from('profiles').select('id,username,display_name,avatar_url,level,xp').eq('is_private', false).ilike('username', `%${safeQuery}%`).limit(12),
      supabase.from('posts').select('id,body,image_url,created_at,author_id,profiles(username,display_name,avatar_url),post_reactions(user_id),post_comments(id)').eq('status', 'published').ilike('body', `%${safeQuery}%`).order('created_at', { ascending: false }).limit(12),
    ]);
    const error = games.error || players.error || posts.error;
    if (error) toast.error(error.message);
    setResults({ games: (games.data ?? []) as Game[], players: players.data ?? [], posts: (posts.data ?? []) as unknown as Post[] }); setLoading(false);
  };
  useEffect(() => { const query = params.get('q'); if (query) { setTerm(query); void search(); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <><PageTitle eyebrow="SEARCH RESPAWN" title="Find your people." description="Search the catalog, player profiles, and community posts." /><form className="large-search panel" onSubmit={search}><Search size={21} /><input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Try a game, player, or topic" aria-label="Search RESPAWN" /><button className="btn btn-primary" disabled={!term.trim()}>Search</button></form>{loading ? <LoadingCards count={3} /> : term.trim() ? <div className="search-results">{results.games.length > 0 && <section className="content-section"><SectionHeading title="Games" /><div className="games-grid">{results.games.map((game, i) => <GameCard key={game.id} game={game} index={i} />)}</div></section>}{results.players.length > 0 && <section className="content-section"><SectionHeading title="Players" /><div className="player-search-results">{results.players.map((player: any) => <Link className="panel player-search-card" key={player.id} to={`/players/${player.username}`}><Avatar name={player.display_name || player.username} src={player.avatar_url} /><span><strong>{player.display_name || player.username}</strong><small>@{player.username} · Level {player.level}</small></span><ChevronRight size={18} /></Link>)}</div></section>}{results.posts.length > 0 && <section className="content-section"><SectionHeading title="Community posts" /><div className="post-list">{results.posts.map((post) => <PostCard post={post} key={post.id} />)}</div></section>}{!results.games.length && !results.players.length && !results.posts.length && <EmptyState title="No results found" detail="Try a different search term or browse discover and community." icon={Search} />}</div> : <EmptyState title="Search the whole community" detail="Find a game to play, a player to follow, or a topic to discuss." icon={Search} />}</>;
}

export function MessagesPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [conversations, setConversations] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [draft, setDraft] = useState('');
  const [target, setTarget] = useState(params.get('with') || '');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const navigate = useNavigate();
  const loadConversations = useCallback(async () => {
    if (!supabase || !user) { setConversations([]); setLoading(false); return; }
    setLoading(true);
    const { data: memberships, error } = await supabase.from('conversation_members').select('conversation_id,conversations(id,updated_at,conversation_members(user_id,profiles(username,display_name,avatar_url)))').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    setConversations(memberships ?? []); setLoading(false);
  }, [user?.id]);
  useEffect(() => { void loadConversations(); }, [loadConversations]);
  const openConversation = useCallback(async (conversationId: string) => {
    if (!supabase || !user) return;
    const { data, error } = await supabase.from('messages').select('id,conversation_id,sender_id,body,created_at,profiles(username,display_name)').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(100);
    if (error) toast.error(error.message);
    setMessages(data ?? []);
    const row = conversations.find((item) => item.conversation_id === conversationId);
    setActive({ id: conversationId, members: (row?.conversations as any)?.conversation_members ?? [] });
    void supabase.rpc('mark_conversation_read', { target_conversation_id: conversationId });
  }, [user?.id, conversations]);
  useEffect(() => {
    const requested = params.get('with');
    if (!requested || !supabase || !user || active) return;
    let alive = true;
    supabase.from('profiles').select('id,username,display_name,avatar_url').eq('username', requested).maybeSingle().then(async ({ data: targetProfile, error }) => {
      if (!alive || error || !targetProfile || targetProfile.id === user.id) return;
      const { data: conversationId, error: startError } = await supabase!.rpc('get_or_create_conversation', { target_user_id: targetProfile.id });
      if (startError) { toast.error(startError.message); return; }
      await loadConversations();
      setActive({ id: conversationId, members: [{ user_id: targetProfile.id, profiles: targetProfile }] });
      if (alive) {
        const { data } = await supabase!.from('messages').select('id,conversation_id,sender_id,body,created_at,profiles(username,display_name)').eq('conversation_id', conversationId).order('created_at').limit(100);
        setMessages(data ?? []);
      }
    });
    return () => { alive = false; };
  }, [params, user?.id, active, loadConversations]);
  useEffect(() => {
    if (!supabase || !active?.id) return;
    const channel = supabase.channel(`conversation:${active.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${active.id}` }, (payload) => {
      setMessages((current) => current.some((message) => message.id === payload.new.id) ? current : [...current, payload.new]);
    }).subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [active?.id]);
  const start = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !user || !target.trim()) return;
    const { data: player, error } = await supabase.from('profiles').select('id,username,display_name,avatar_url').eq('username', target.trim().replace(/^@/, '')).maybeSingle();
    if (error || !player) { toast.error(error?.message || 'Player not found. Search by exact username.'); return; }
    if (player.id === user.id) { toast.error('You can’t message yourself.'); return; }
    const { data: conversationId, error: startError } = await supabase.rpc('get_or_create_conversation', { target_user_id: player.id });
    if (startError) { toast.error(startError.message); return; }
    setActive({ id: conversationId, members: [{ user_id: player.id, profiles: player }] }); setMessages([]); await loadConversations(); navigate('/messages');
    const { data } = await supabase.from('messages').select('id,conversation_id,sender_id,body,created_at,profiles(username,display_name)').eq('conversation_id', conversationId).order('created_at').limit(100);
    setMessages(data ?? []);
  };
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !user || !active || !draft.trim()) return;
    setSending(true);
    const { data, error } = await supabase.from('messages').insert({ conversation_id: active.id, sender_id: user.id, body: draft.trim() }).select('id,conversation_id,sender_id,body,created_at,profiles(username,display_name)').single();
    setSending(false);
    if (error) toast.error(error.message); else { setDraft(''); setMessages((old) => old.some((message) => message.id === data.id) ? old : [...old, data]); }
  };
  const recipient = active?.members?.find((member: any) => member.user_id !== user?.id)?.profiles;
  return <><PageTitle eyebrow="DIRECT COMMS" title="Messages" description="Private one-to-one conversations. Only conversation members can read messages." />{!user ? <EmptyState title="Sign in to open your inbox" detail="Private messages are protected and visible only to conversation participants." icon={LockKeyhole} action={<Link to="/login" className="btn btn-primary">Sign in</Link>} /> : <div className="messages-layout panel"><aside className="conversation-sidebar"><form className="start-chat" onSubmit={start}><input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Username to message" aria-label="Username to message" /><button className="icon-button" aria-label="Start conversation"><Plus size={17} /></button></form><div className="conversation-list">{loading ? <p className="muted-copy">Loading conversations…</p> : conversations.length ? conversations.map((row) => { const other = (row.conversations as any)?.conversation_members?.find((member: any) => member.user_id !== user.id)?.profiles; return <button className={`conversation-item ${active?.id === row.conversation_id ? 'active' : ''}`} key={row.conversation_id} onClick={() => void openConversation(row.conversation_id)}><Avatar name={other?.display_name || other?.username || 'Player'} src={other?.avatar_url} /><span><strong>{other?.display_name || other?.username || 'Player'}</strong><small>Open conversation</small></span></button>; }) : <p className="muted-copy conversation-empty">Your conversations will appear here.</p>}</div></aside><section className="conversation-view">{active ? <><header className="conversation-header"><Avatar name={recipient?.display_name || recipient?.username || 'Player'} src={recipient?.avatar_url} /><div><strong>{recipient?.display_name || recipient?.username || 'Conversation'}</strong><small>Private conversation</small></div></header><div className="message-stream">{messages.length ? messages.map((message) => <div className={`message-bubble ${message.sender_id === user.id ? 'mine' : ''}`} key={message.id}><p>{message.body}</p><small>{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></div>) : <EmptyState title="Start the conversation" detail="Keep it respectful. Messages are rate-limited to reduce abuse." icon={MessageCircle} />}</div><form className="send-message" onSubmit={send}><input maxLength={2000} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a message…" aria-label="Write a private message" /><button className="btn btn-primary btn-small" disabled={sending || !draft.trim()} aria-label="Send message"><Send size={16} /></button></form></> : <div className="conversation-placeholder"><span className="empty-icon"><MessageCircle size={22} /></span><strong>Your inbox, player to player.</strong><p>Choose a conversation or start one by entering a player’s exact username.</p></div>}</section></div>}</>;
}

export function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    if (!supabase || !user) { setItems([]); setLoading(false); return; }
    const { data, error } = await supabase.from('notifications').select('id,type,title,body,href,is_read,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
    if (error) toast.error(error.message); else setItems(data ?? []);
    setLoading(false);
  }, [user?.id]);
  useEffect(() => { void load(); }, [load]);
  const markRead = async (id: string) => {
    if (!supabase || !user) return;
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id).eq('user_id', user.id);
    if (error) toast.error(error.message); else setItems((old) => old.map((item) => item.id === id ? { ...item, is_read: true } : item));
  };
  return <><PageTitle eyebrow="UPDATES" title="Notifications" description="Your recent follows, replies, match updates, and achievements." />{!user ? <EmptyState title="Sign in to view notifications" detail="Your notifications are private to your account." icon={LockKeyhole} action={<Link to="/login" className="btn btn-primary">Sign in</Link>} /> : loading ? <LoadingCards count={3} /> : items.length ? <div className="notification-list">{items.map((item) => <article className={`notification-row panel ${item.is_read ? '' : 'unread'}`} key={item.id}><span className="notification-icon"><Bell size={17} /></span><div className="notification-copy"><strong>{item.title}</strong><p>{item.body}</p><small>{timeAgo(item.created_at)}</small></div>{!item.is_read && <button className="text-link" onClick={() => void markRead(item.id)}>Mark read</button>}{item.href && <Link className="notification-open" to={item.href} onClick={() => !item.is_read && void markRead(item.id)} aria-label="Open notification"><ChevronRight size={17} /></Link>}</article>)}</div> : <EmptyState title="All caught up" detail="When something happens in your community, you’ll see it here." icon={Bell} />}</>;
}

export function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [stats, setStats] = useState({ users: 0, games: 0, posts: 0, reports: 0 });
  const [reports, setReports] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [tab, setTab] = useState('Overview');
  const load = useCallback(async () => {
    setChecking(true);
    if (!supabase || !user) { setAuthorized(false); setChecking(false); return; }
    const { data: role, error } = await supabase.rpc('has_role', { target_user_id: user.id, required_role: 'admin' });
    if (error || !role) { setAuthorized(false); setChecking(false); return; }
    setAuthorized(true);
    const [users, games, postCount, reportCount, reportRows, playerRows, postRows, reviewRows, eventRows] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('games').select('id', { count: 'exact', head: true }),
      supabase.from('posts').select('id', { count: 'exact', head: true }),
      supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('reports').select('id,reporter_id,subject_type,subject_id,reason,details,status,created_at,profiles(username)').eq('status', 'open').order('created_at').limit(40),
      supabase.from('profiles').select('id,username,display_name,avatar_url,xp,level,account_status,created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('posts').select('id,body,created_at,author_id,status,profiles(username)').neq('status', 'removed').order('created_at', { ascending: false }).limit(40),
      supabase.from('reviews').select('id,body,rating,created_at,user_id,status,profiles(username),games(title)').neq('status', 'removed').order('created_at', { ascending: false }).limit(40),
      supabase.from('tournaments').select('id,title,status,start_at,games(title)').order('start_at', { ascending: false }).limit(40),
    ]);
    setStats({ users: users.count ?? 0, games: games.count ?? 0, posts: postCount.count ?? 0, reports: reportCount.count ?? 0 });
    setReports(reportRows.data ?? []); setPlayers(playerRows.data ?? []); setPosts(postRows.data ?? []); setReviews(reviewRows.data ?? []); setEvents(eventRows.data ?? []); setChecking(false);
  }, [user?.id]);
  useEffect(() => { if (!authLoading) void load(); }, [authLoading, load]);
  const reviewReport = async (report: any, decision: 'dismissed' | 'resolved') => {
    if (!supabase || !user) return;
    const { error } = await supabase.rpc('resolve_report', { target_report_id: report.id, resolution: decision });
    if (error) toast.error(error.message); else { toast.success(`Report ${decision}`); await load(); }
  };
  const moderate = async (kind: 'post' | 'review', id: string, status: 'published' | 'removed') => {
    if (!supabase) return;
    const { error } = await supabase.rpc('admin_moderate_content', { subject_kind: kind, subject_uuid: id, next_status: status, note: 'Reviewed in admin console' });
    if (error) toast.error(error.message); else { toast.success(`${kind === 'post' ? 'Post' : 'Review'} ${status}`); await load(); }
  };
  const setAccountStatus = async (player: any) => {
    if (!supabase) return;
    const nextStatus = player.account_status === 'active' ? 'suspended' : 'active';
    const { error } = await supabase.rpc('admin_set_account_status', { target_user_id: player.id, next_status: nextStatus, note: 'Updated in admin console' });
    if (error) toast.error(error.message); else { toast.success(`Account ${nextStatus}`); await load(); }
  };
  const setTournamentStatus = async (event: any, status: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('tournaments').update({ status }).eq('id', event.id);
    if (error) toast.error(error.message); else { toast.success('Tournament status updated'); await load(); }
  };
  if (checking || authLoading) return <div className="admin-loading"><span className="spinner" /> Checking administrator permissions…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: '/admin' }} />;
  if (!authorized) return <div className="admin-denied"><span className="empty-icon"><ShieldAlert size={22} /></span><h1>Restricted area</h1><p>This dashboard is limited to administrators. Roles are verified against the database, not editable client metadata.</p><Link className="btn btn-quiet" to="/">Back to RESPAWN</Link></div>;
  return <div className="admin-dashboard"><PageTitle eyebrow="TRUST & SAFETY" title="Admin console" description="Platform operations, content moderation, and accountability." action={<span className="admin-role"><Shield size={14} /> Platform administrator</span>} />
    <div className="admin-tabs">{['Overview','Users','Moderation','Reports','Tournaments','Games','Audit log'].map((item) => <button className={tab === item ? 'selected' : ''} key={item} onClick={() => setTab(item)}>{item}</button>)}</div>
    {tab === 'Overview' && <><div className="admin-stat-grid">{[['Total players', stats.users, Users], ['Game catalog', stats.games, Gamepad2], ['Community posts', stats.posts, MessageCircle], ['Open reports', stats.reports, ShieldAlert]].map(([label, value, Icon]: any) => <div className="admin-stat panel" key={label}><span>{label}</span><strong>{value.toLocaleString()}</strong><Icon size={18} /></div>)}</div><div className="panel admin-overview-note"><span className="empty-icon"><Shield size={19} /></span><div><strong>Security posture</strong><p>RLS is enabled across the public schema. Privileged actions require database authorization and are written to the audit log.</p></div></div><AdminReports reports={reports.slice(0, 5)} onResolve={reviewReport} /></>}
    {tab === 'Users' && <AdminUsers players={players} onStatus={setAccountStatus} />}
    {tab === 'Moderation' && <AdminModeration posts={posts} reviews={reviews} onModerate={moderate} />}
    {tab === 'Reports' && <AdminReports reports={reports} onResolve={reviewReport} />}
    {tab === 'Tournaments' && <AdminTournaments events={events} onStatus={setTournamentStatus} />}
    {tab === 'Games' && <AdminGames reload={load} />}
    {tab === 'Audit log' && <AdminAudit />}
  </div>;
}

function AdminUsers({ players, onStatus }: { players: any[]; onStatus: (player: any) => void }) {
  const [query, setQuery] = useState('');
  const visible = players.filter((player) => `${player.username} ${player.display_name || ''}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="content-section"><div className="admin-list-toolbar"><SectionHeading title="Player accounts" /><input aria-label="Filter player accounts" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter username…" /></div>{visible.length ? <div className="admin-entity-list">{visible.map((player) => <div className="admin-entity panel" key={player.id}><Avatar name={player.display_name || player.username} src={player.avatar_url} /><span className="admin-entity-main"><strong>{player.display_name || player.username}</strong><small>@{player.username} · Level {player.level} · {Number(player.xp).toLocaleString()} XP</small></span><span className={`account-status ${player.account_status}`}>{player.account_status}</span><button className={`btn ${player.account_status === 'active' ? 'btn-danger' : 'btn-quiet'} btn-small`} onClick={() => onStatus(player)}>{player.account_status === 'active' ? 'Suspend' : 'Restore'}</button></div>)}</div> : <EmptyState title="No players match" detail="Try a different username." icon={Users} />}</section>;
}

function AdminModeration({ posts, reviews, onModerate }: { posts: any[]; reviews: any[]; onModerate: (kind: 'post' | 'review', id: string, status: 'published' | 'removed') => void }) {
  return <div className="moderation-grid"><section className="content-section"><SectionHeading title="Community posts" />{posts.length ? <div className="admin-entity-list">{posts.map((post) => <article className="admin-content-item panel" key={post.id}><span className="status-pill">{post.status}</span><p>{post.body}</p><small>@{post.profiles?.username || 'player'} · {timeAgo(post.created_at)}</small><div className="report-actions">{post.status !== 'published' && <button className="btn btn-quiet btn-small" onClick={() => onModerate('post', post.id, 'published')}>Restore</button>}<button className="btn btn-danger btn-small" onClick={() => onModerate('post', post.id, 'removed')}>Remove</button></div></article>)}</div> : <EmptyState title="No posts to review" detail="Recent community posts will appear here." icon={MessageCircle} />}</section><section className="content-section"><SectionHeading title="Game reviews" />{reviews.length ? <div className="admin-entity-list">{reviews.map((review) => <article className="admin-content-item panel" key={review.id}><span className="status-pill">{review.status}</span><p><b>{review.games?.title || 'Game'} · {review.rating}/10</b><br />{review.body}</p><small>@{review.profiles?.username || 'player'} · {timeAgo(review.created_at)}</small><div className="report-actions">{review.status !== 'published' && <button className="btn btn-quiet btn-small" onClick={() => onModerate('review', review.id, 'published')}>Restore</button>}<button className="btn btn-danger btn-small" onClick={() => onModerate('review', review.id, 'removed')}>Remove</button></div></article>)}</div> : <EmptyState title="No reviews to moderate" detail="New catalog reviews will appear here." icon={Star} />}</section></div>;
}

function AdminTournaments({ events, onStatus }: { events: any[]; onStatus: (event: any, status: string) => void }) {
  return <section className="content-section"><SectionHeading title="Tournament operations" />{events.length ? <div className="admin-entity-list">{events.map((event) => <article className="admin-entity panel" key={event.id}><span className="admin-entity-main"><strong>{event.title}</strong><small>{event.games?.title || 'Game'} · {new Date(event.start_at).toLocaleString()}</small></span><span className="status-pill">{event.status}</span>{event.status !== 'cancelled' && event.status !== 'completed' && <button className="btn btn-danger btn-small" onClick={() => onStatus(event, 'cancelled')}>Cancel event</button>}</article>)}</div> : <EmptyState title="No tournaments yet" detail="Events created by organizers appear here." icon={Trophy} />}</section>;
}

function AdminReports({ reports, onResolve }: { reports: any[]; onResolve: (report: any, decision: 'dismissed' | 'resolved') => void }) {
  return <section className="content-section"><SectionHeading title="Report queue" />{reports.length ? <div className="report-list">{reports.map((report) => <article className="panel report-row" key={report.id}><span className="report-type">{report.subject_type}</span><div><strong>{report.reason}</strong><p>{report.details || 'No additional details provided.'}</p><small>Reported by @{report.profiles?.username || 'player'} · {timeAgo(report.created_at)}</small></div><div className="report-actions"><button className="btn btn-quiet btn-small" onClick={() => onResolve(report, 'dismissed')}>Dismiss</button><button className="btn btn-danger btn-small" onClick={() => onResolve(report, 'resolved')}>Resolve</button></div></article>)}</div> : <EmptyState title="No open reports" detail="New community reports will appear here for review." icon={Check} />}</section>;
}

function AdminGames({ reload }: { reload: () => Promise<void> }) {
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [cover, setCover] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase) return;
    setBusy(true);
    const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { error } = await supabase.from('games').insert({ title: title.trim(), slug, description: description.trim(), cover_url: cover.trim() || null, created_by: (await supabase.auth.getUser()).data.user?.id, platforms: [], is_published: true });
    setBusy(false); if (error) toast.error(error.message); else { toast.success('Game published'); setTitle(''); setDescription(''); setCover(''); await reload(); }
  };
  return <section className="panel admin-game-form"><SectionHeading title="Add a catalog game" /><p className="form-note">Use artwork you own or are licensed to display. External game-data providers require a server-side integration and compliance with their image terms.</p><form onSubmit={submit} className="form-grid"><label>Game title<input required minLength={2} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></label><label>Cover image URL<input type="url" maxLength={1000} value={cover} onChange={(e) => setCover(e.target.value)} placeholder="https://… (licensed artwork only)" /></label><label className="form-span">Description<textarea maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} /></label><button className="btn btn-primary btn-small" disabled={busy}>{busy ? 'Publishing…' : 'Publish game'}</button></form></section>;
}

function AdminAudit() {
  const [logs, setLogs] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { if (!supabase) { setLoading(false); return; } supabase.from('admin_audit_logs').select('id,action,target_type,target_id,metadata,created_at,profiles(username)').order('created_at', { ascending: false }).limit(50).then(({ data, error }) => { if (error) toast.error(error.message); setLogs(data ?? []); setLoading(false); }); }, []);
  return <section className="content-section"><SectionHeading title="Sensitive action history" />{loading ? <LoadingCards count={2} /> : logs.length ? <div className="audit-list">{logs.map((log) => <div className="audit-row panel" key={log.id}><span className="audit-mark"><Shield size={15} /></span><div><strong>{log.action} · {log.target_type}</strong><small>by @{log.profiles?.username || 'admin'} · {new Date(log.created_at).toLocaleString()}</small></div></div>)}</div> : <EmptyState title="No audit events yet" detail="Administrative actions are recorded as they occur." icon={Shield} />}</section>;
}

export function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [country, setCountry] = useState(profile?.country || '');
  const [platforms, setPlatforms] = useState(profile?.platforms?.join(', ') || '');
  const [favorites, setFavorites] = useState(profile?.favorite_games?.join(', ') || '');
  const [privacy, setPrivacy] = useState(profile?.is_private || false);
  const [busy, setBusy] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  useEffect(() => { setDisplayName(profile?.display_name || ''); setUsername(profile?.username || ''); setBio(profile?.bio || ''); setCountry(profile?.country || ''); setPlatforms(profile?.platforms?.join(', ') || ''); setFavorites(profile?.favorite_games?.join(', ') || ''); setPrivacy(profile?.is_private || false); }, [profile]);
  const deleteAccount = async () => {
    if (!supabase || !window.confirm('Permanently delete your RESPAWN account and associated profile data? This cannot be undone.')) return;
    setBusy(true);
    const { error } = await supabase.functions.invoke('delete-account', { body: {} });
    setBusy(false);
    if (error) toast.error(error.message); else { await supabase.auth.signOut(); toast.success('Account deleted'); navigate('/'); }
  };
  if (!user) return <Navigate to="/login" replace state={{ from: '/settings' }} />;
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase) return;
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) { toast.error('Username must be 3–20 letters, numbers, or underscores.'); return; }
    if (avatarFile && (!avatarFile.type.startsWith('image/') || avatarFile.size > 5 * 1024 * 1024)) { toast.error('Choose an image under 5 MB.'); return; }
    setBusy(true); let avatar_url = profile?.avatar_url ?? null;
    if (avatarFile) {
      const path = `${user.id}/avatar-${crypto.randomUUID()}.${avatarFile.name.split('.').pop()?.toLowerCase() || 'jpg'}`;
      const { data, error } = await supabase.storage.from('avatars').upload(path, avatarFile, { contentType: avatarFile.type, upsert: false });
      if (error) { setBusy(false); toast.error(error.message); return; }
      avatar_url = supabase.storage.from('avatars').getPublicUrl(data.path).data.publicUrl;
    }
    const { error } = await supabase.from('profiles').update({ username: username.toLowerCase(), display_name: displayName.trim() || null, bio: bio.trim() || null, country: country.trim() || null, platforms: splitList(platforms), favorite_games: splitList(favorites), is_private: privacy, avatar_url }).eq('id', user.id);
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success('Profile updated'); setAvatarFile(null); await refreshProfile(); }
  };
  const exportData = async () => {
    if (!supabase) return;
    const [posts, reviews, follows, notifications] = await Promise.all([
      supabase.from('posts').select('*').eq('author_id', user.id), supabase.from('reviews').select('*').eq('user_id', user.id),
      supabase.from('follows').select('*').or(`follower_id.eq.${user.id},following_id.eq.${user.id}`), supabase.from('notifications').select('*').eq('user_id', user.id),
    ]);
    const blob = new Blob([JSON.stringify({ profile, posts: posts.data, reviews: reviews.data, follows: follows.data, notifications: notifications.data, exported_at: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `respawn-data-${profile?.username || user.id}.json`; anchor.click(); URL.revokeObjectURL(url);
  };
  return <><PageTitle eyebrow="ACCOUNT" title="Settings" description="Manage your player identity, privacy, and account data." /><section className="settings-layout"><aside className="settings-nav panel"><a href="#profile">Player profile</a><a href="#privacy">Privacy</a><a href="#data">Your data</a></aside><div className="settings-main"><form className="panel settings-card" onSubmit={save} id="profile"><SectionHeading title="Player profile" /><div className="avatar-edit"><Avatar name={displayName || username || 'Player'} src={avatarFile ? URL.createObjectURL(avatarFile) : profile?.avatar_url} size="lg" /><label className="btn btn-quiet btn-small">Change avatar<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)} /></label><small>JPG, PNG, or WebP. Max 5 MB.</small></div><div className="form-grid"><label>Username<input required minLength={3} maxLength={20} value={username} onChange={(e) => setUsername(e.target.value)} /><small>Unique, public, letters/numbers/underscores.</small></label><label>Display name<input maxLength={60} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label><label className="form-span">Bio<textarea maxLength={280} rows={4} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell the lobby what you play." /></label><label>Country<input maxLength={80} value={country} onChange={(e) => setCountry(e.target.value)} /></label><label>Gaming platforms<input maxLength={300} value={platforms} onChange={(e) => setPlatforms(e.target.value)} placeholder="PC, PlayStation, Xbox" /></label><label className="form-span">Favorite games<input maxLength={500} value={favorites} onChange={(e) => setFavorites(e.target.value)} placeholder="Separate games with commas" /></label></div><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></form><div className="panel settings-card" id="privacy"><SectionHeading title="Privacy" /><label className="toggle-row"><span><strong>Private profile</strong><small>Only you can see your profile activity and favorites. Username remains searchable only by people you approve through platform features.</small></span><input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} /><span className="toggle-visual" /></label><button className="btn btn-quiet btn-small" onClick={() => void save(new Event('submit') as unknown as FormEvent)}>Save privacy setting</button></div><div className="panel settings-card" id="data"><SectionHeading title="Your data" /><p className="muted-copy">Download a JSON export of your profile, posts, reviews, follows, and notifications.</p><button className="btn btn-quiet btn-small" onClick={() => void exportData()}>Export my data</button><div className="danger-zone"><strong>Delete account</strong><p>Account deletion is processed by a protected server-side function to remove Auth data, profile data, and associated content.</p><button className="btn btn-danger btn-small" onClick={() => void deleteAccount()}>Delete account</button></div><div className="danger-zone"><strong>Delete account</strong><p>Account deletion is processed by a protected server-side function to remove Auth data and associated records. Configure the Supabase delete-account Edge Function before enabling self-service deletion.</p><button className="btn btn-danger btn-small" onClick={() => toast.info('Account deletion requires the deployed Supabase delete-account function. See setup guide.')}>Request account deletion</button></div></div></div></section></>;
}

export function AuthPage({ mode }: { mode: 'login' | 'register' | 'reset' }) {
  const { user } = useAuth();
  const [params] = useSearchParams(); const location = useLocation(); const navigate = useNavigate();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [username, setUsername] = useState(''); const [busy, setBusy] = useState(false);
  const next = (location.state as any)?.from || params.get('next') || '/';
  if (user && mode !== 'reset') return <Navigate to={next} replace />;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase) { toast.error('Supabase is not configured. Add the VITE_SUPABASE_* values to .env.local.'); return; }
    if (mode === 'register' && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) { toast.error('Choose a username with 3–20 letters, numbers, or underscores.'); return; }
    setBusy(true);
    const result = mode === 'register'
      ? await supabase.auth.signUp({ email: email.trim(), password, options: { data: { username: username.toLowerCase() }, emailRedirectTo: `${window.location.origin}/login` } })
      : mode === 'login' ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/settings` });
    setBusy(false);
    if (result.error) toast.error(result.error.message);
    else if (mode === 'register') toast.success('Check your inbox to verify your email, then sign in.');
    else if (mode === 'reset') toast.success('If an account exists for that email, a reset link is on its way.');
    else { toast.success('Welcome back.'); navigate(next); }
  };
  const google = async () => {
    if (!supabase) { toast.error('Supabase is not configured.'); return; }
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}${next}` } });
    if (error) toast.error(error.message);
  };
  return <div className="auth-page"><div className="auth-art" style={{ backgroundImage: `linear-gradient(0deg,rgba(9,11,10,.98),rgba(9,11,10,.16)), url(${art.arena})` }}><Link to="/" className="auth-brand"><Brand /></Link><div className="auth-art-copy"><span className="eyebrow">PLAY. COMPETE. RESPAWN.</span><h1>Your people.<br />Your next level.</h1><p>Make your game mean more.</p></div></div><div className="auth-form-area"><div className="auth-form-wrap"><div className="mobile-auth-brand"><Brand /></div><p className="eyebrow">{mode === 'register' ? 'CREATE YOUR PLAYER ID' : mode === 'reset' ? 'ACCOUNT RECOVERY' : 'WELCOME BACK'}</p><h2>{mode === 'register' ? 'Join the lobby.' : mode === 'reset' ? 'Reset your password.' : 'Back in the game.'}</h2><p className="auth-subtitle">{mode === 'register' ? 'Your community is waiting.' : mode === 'reset' ? 'We’ll email you a secure reset link.' : 'Sign in to pick up where you left off.'}</p>
      {mode !== 'reset' && <><button className="google-button" onClick={() => void google()}><GoogleMark /> Continue with Google</button><div className="auth-divider"><span>or continue with email</span></div></>}
      <form onSubmit={submit} className="auth-form">{mode === 'register' && <label>Username<input required minLength={3} maxLength={20} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Your player tag" /></label>}<label>Email address<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>{mode !== 'reset' && <label>Password<input required type="password" minLength={8} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>}{mode === 'login' && <Link className="forgot-link" to="/login?mode=reset">Forgot password?</Link>}<button className="btn btn-primary auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'} <ArrowRight size={16} /></button></form>
      <p className="auth-switch">{mode === 'register' ? <>Already have an account? <Link to="/login">Sign in</Link></> : mode === 'reset' ? <Link to="/login">Back to sign in</Link> : <>New to RESPAWN? <Link to="/register">Create an account</Link></>}</p><p className="auth-legal">By continuing, you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.</p></div></div></div>;
}

function GoogleMark() { return <svg aria-hidden="true" viewBox="0 0 48 48" width="18" height="18"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3A12 12 0 1 1 32 15.1l5.7-5.7A20 20 0 1 0 44 24c0-1.2-.1-2.3-.4-3.5Z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8A12 12 0 0 1 32 15.1l5.7-5.7a20 20 0 0 0-31.4 5.3Z"/><path fill="#4CAF50" d="M24 44a20 20 0 0 0 13.5-5.2l-6.2-5.2A12 12 0 0 1 12.8 28l-6.5 5A20 20 0 0 0 24 44Z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4 5.6l6.2 5.2C41.2 35.2 44 29.9 44 24c0-1.2-.1-2.3-.4-3.5Z"/></svg>; }

export function LegalPage({ type }: { type: 'privacy' | 'terms' }) {
  const privacy = type === 'privacy';
  return <div className="legal-page"><PageTitle eyebrow="RESPAWN POLICIES" title={privacy ? 'Privacy policy' : 'Terms of service'} description={`Last updated October 10, 2026 · ${privacy ? 'How we collect and protect player data.' : 'Rules for a fair, safe community.'}`} /><div className="legal-content panel">{privacy ? <><h2>1. Information we collect</h2><p>RESPAWN processes the account details you submit, profile information, community posts and reviews, tournament participation, messages, and service logs necessary to provide the platform. Authentication credentials are managed by Supabase Auth and are never stored in application tables.</p><h2>2. How we use information</h2><p>We use account information to authenticate you, publish the profile information you choose to make public, deliver messages and notifications, operate tournaments, prevent abuse, and maintain platform security. XP changes are kept in an auditable ledger.</p><h2>3. Visibility and controls</h2><p>Public profiles and public posts may be visible to other visitors. Private messages are restricted to conversation members using database policies. You can adjust profile visibility in Settings, export available account data, and request account deletion.</p><h2>4. Storage and service providers</h2><p>RESPAWN uses Supabase for authentication, database, storage, and realtime delivery, and Vercel for hosting. Configure data region, retention, backups, OAuth, and production security settings in the provider dashboards before launch.</p><h2>5. Contact and changes</h2><p>We may update this policy as the service evolves. Add a monitored support contact and jurisdiction-specific privacy notices before opening registration publicly.</p></> : <><h2>1. Be a good sport</h2><p>Do not harass, threaten, impersonate, spam, exploit, or share unlawful, infringing, or non-consensual content. Do not attempt to bypass account security or moderation.</p><h2>2. User content</h2><p>You retain rights to your submissions and grant RESPAWN the limited permission needed to host and display them as part of the service. Only upload content you own or are licensed to share. We may remove reported or prohibited content under platform rules.</p><h2>3. Accounts and eligibility</h2><p>Keep account details accurate and secure. Platform administrators and approved tournament organizers receive roles through trusted administrative processes, not public signup.</p><h2>4. Tournaments and results</h2><p>Tournaments are community organized. Results are manually submitted and reviewed by opponents or organizers; RESPAWN does not claim automatic in-game verification without an actual game API integration. Disputes may be reviewed by organizers or platform administrators.</p><h2>5. Availability and changes</h2><p>The service is provided as available and may change. No payments, prizes, or automated game verification are offered by this build. Publish applicable local rules and contact information before operating competitions at scale.</p></>}</div></div>;
}

export function NotFoundPage() { return <div className="not-found"><span className="eyebrow">404 · OUT OF BOUNDS</span><h1>Looks like you got<br />respawned somewhere else.</h1><p>This page doesn’t exist or may have moved.</p><Link to="/" className="btn btn-primary">Back to home <ArrowRight size={16} /></Link></div>; }

async function reportContent(subjectType: string, subjectId: string) {
  if (!supabase) { toast.error('Connect Supabase before submitting reports.'); return; }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { toast.error('Sign in to submit a report.'); return; }
  const reason = window.prompt('What is the issue? (spam, harassment, inappropriate content, other)');
  if (!reason) return;
  const details = window.prompt('Add optional details (max 1000 characters)') || '';
  const { error } = await supabase.from('reports').insert({ reporter_id: user.id, subject_type: subjectType, subject_id: subjectId, reason: reason.slice(0, 120), details: details.slice(0, 1000) });
  if (error) toast.error(error.message); else toast.success('Report submitted to moderation.');
}

function splitList(value: string) { return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))].slice(0, 20); }
function timeAgo(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
