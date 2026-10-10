import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { AppShell } from './components';
import { LivePage } from './LivePage';
import { useAuth } from './lib/auth';
import {
  AdminPage, AuthPage, CommunityPage, DiscoverPage, GamePage, HomePage, LegalPage,
  LeaderboardsPage, MessagesPage, NotificationsPage, NotFoundPage, PlayerPage,
  SearchPage, SettingsPage, TournamentPage, TournamentsPage,
} from './pages';
import type { ReactNode } from 'react';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="route-loading"><span className="spinner" /> Loading your player session…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return children;
}

function LoginRoute() {
  const [params] = useSearchParams();
  return <AuthPage mode={params.get('mode') === 'reset' ? 'reset' : 'login'} />;
}

export default function App() {
  return <Routes>
    <Route element={<AppShell />}>
      <Route index element={<HomePage />} />
      <Route path="discover" element={<DiscoverPage />} />
      <Route path="games/:id" element={<GamePage />} />
      <Route path="community" element={<RequireAuth><CommunityPage /></RequireAuth>} />
      <Route path="live" element={<RequireAuth><LivePage /></RequireAuth>} />
      <Route path="tournaments" element={<TournamentsPage />} />
      <Route path="tournaments/:id" element={<TournamentPage />} />
      <Route path="leaderboards" element={<LeaderboardsPage />} />
      <Route path="players/:username" element={<PlayerPage />} />
      <Route path="messages" element={<RequireAuth><MessagesPage /></RequireAuth>} />
      <Route path="notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
      <Route path="search" element={<SearchPage />} />
      <Route path="settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
      <Route path="login" element={<LoginRoute />} />
      <Route path="register" element={<AuthPage mode="register" />} />
      <Route path="admin" element={<AdminPage />} />
      <Route path="privacy" element={<LegalPage type="privacy" />} />
      <Route path="terms" element={<LegalPage type="terms" />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  </Routes>;
}
