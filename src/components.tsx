import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Bell, ChevronRight, Compass, Gamepad2, Home, Joystick, Menu, MessageCircle, Search,
  Shield, Swords, Trophy, Users, X, Zap, Settings, LogOut, CircleUserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from './lib/auth';
import { isSupabaseConfigured, supabase } from './lib/supabase';

const navItems = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/community', label: 'Community', icon: Users },
  { to: '/tournaments', label: 'Tournaments', icon: Swords },
  { to: '/leaderboards', label: 'Leaderboards', icon: Trophy },
];
const personalItems = [
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link to="/" className={`brand ${compact ? 'brand-compact' : ''}`} aria-label="RESPAWN home">
    <span className="brand-mark" aria-hidden="true"><Joystick size={20} strokeWidth={2.5} /></span>
    {!compact && <span className="brand-word">RESPAWN<span className="brand-period">.</span></span>}
  </Link>;
}

export function AppShell() {
  const { user, profile } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) toast.error(error.message); else { toast.success('Signed out'); navigate('/'); }
  };
  const search = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = query.trim();
    if (term) navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  return <div className="app-frame">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`} aria-label="Main navigation">
      <div className="sidebar-brand"><Brand /><button className="icon-button mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={19} /></button></div>
      <div className="sidebar-scroll">
        <p className="nav-caption">PLAY</p>
        <nav className="side-links">
          {navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={() => setMenuOpen(false)} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>
            <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === 'Tournaments' && <span className="side-live-dot" />}
          </NavLink>)}
        </nav>
        <p className="nav-caption nav-caption-spaced">YOUR SPACE</p>
        <nav className="side-links">
          {personalItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setMenuOpen(false)} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>
            <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
          </NavLink>)}
        </nav>
        <div className="sidebar-promo">
          <span className="promo-icon"><Zap size={16} fill="currentColor" /></span>
          <strong>Your next win starts here.</strong>
          <span>Find your squad. Enter the arena.</span>
          {!user && <Link to="/register" className="promo-link" onClick={() => setMenuOpen(false)}>Join RESPAWN <ChevronRight size={15} /></Link>}
        </div>
      </div>
      <div className="sidebar-bottom">
        {user ? <>
          <Link to={`/players/${profile?.username ?? ''}`} className="user-row">
            <Avatar name={profile?.display_name || profile?.username || user.email || 'Player'} src={profile?.avatar_url} />
            <span className="user-details"><strong>{profile?.display_name || profile?.username || 'Player'}</strong><small>Level {profile?.level ?? 1} · {profile?.xp ?? 0} XP</small></span>
            <button className="icon-button logout-button" aria-label="Sign out" onClick={(event) => { event.preventDefault(); void signOut(); }}><LogOut size={16} /></button>
          </Link>
          <Link to="/admin" className="admin-shortcut"><Shield size={14} /> Admin dashboard</Link>
        </> : <div className="sidebar-auth"><Link to="/login" className="btn btn-quiet btn-small">Log in</Link><Link to="/register" className="btn btn-primary btn-small">Sign up</Link></div>}
      </div>
    </aside>
    {menuOpen && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
    <div className="main-frame">
      <header className="topbar">
        <button className="icon-button menu-trigger" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
        <div className="mobile-brand"><Brand /></div>
        <form className="global-search" onSubmit={search} role="search">
          <Search size={17} aria-hidden="true" /><input aria-label="Search games, players, and tournaments" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search games, players, tournaments..." /><kbd>⌘ K</kbd>
        </form>
        <div className="topbar-actions">
          {user ? <>
            <Link to="/notifications" className="top-icon" aria-label="Notifications"><Bell size={19} /><span className="notification-pip" /></Link>
            <Link to="/messages" className="top-icon" aria-label="Messages"><MessageCircle size={19} /></Link>
            <Link to={`/players/${profile?.username ?? ''}`} className="top-avatar" aria-label="Your player profile"><Avatar name={profile?.username || user.email || 'Player'} src={profile?.avatar_url} /></Link>
          </> : <>
            <Link to="/login" className="top-login">Log in</Link>
            <Link to="/register" className="btn btn-primary btn-small">Get started</Link>
          </>}
        </div>
      </header>
      {!isSupabaseConfigured && <div className="config-banner"><span><Zap size={15} /> Connect Supabase to enable live accounts, community, tournaments, and database content.</span><Link to="/settings">Setup guide <ChevronRight size={14} /></Link></div>}
      <main className="page-content"><Outlet /></main>
      <footer className="site-footer"><span>© {new Date().getFullYear()} RESPAWN</span><span className="footer-tagline">PLAY. COMPETE. RESPAWN.</span><span><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></span></footer>
    </div>
  </div>;
}

export function Avatar({ name, src, size = 'md' }: { name: string; src?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`avatar avatar-${size}`} aria-hidden="true">
    {src ? <img src={src} alt="" /> : <span>{name.trim().slice(0, 1).toUpperCase() || <CircleUserRound size={18} />}</span>}
  </span>;
}

export function PageTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-title-row"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action}</div>;
}

export function SectionHeading({ title, link, to }: { title: string; link?: string; to?: string }) {
  return <div className="section-heading"><h2>{title}</h2>{link && to && <Link to={to} className="text-link">{link}<ChevronRight size={15} /></Link>}</div>;
}

export function EmptyState({ title, detail, icon: Icon = Gamepad2, action }: { title: string; detail: string; icon?: typeof Gamepad2; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={23} /></span><h3>{title}</h3><p>{detail}</p>{action}</div>;
}

export function LoadingCards({ count = 3 }: { count?: number }) {
  return <div className="skeleton-grid">{Array.from({ length: count }, (_, i) => <div className="skeleton-card" key={i}><div /><span /><span /></div>)}</div>;
}
