import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Menu,
  MoreVertical,
  Moon,
  Search,
  Shield,
  Sun,
  Users,
  X,
} from 'lucide-react';
import type { Dashboard, Range } from '../../src/shared/types';
import { api, compact } from './lib';
import { AppContext, useApp } from './context';
import { Change, Link, Logo, Modal } from './components';
import { Pulse } from './Pulse';
import { Sidebar, BrowseNavigation } from './Navigation';
import { RealData } from './RealData';
import {
  About,
  Alerts,
  Ask,
  Categories,
  CategoryDetail,
  Channel,
  Keywords,
  Opportunity,
  Reports,
  Streamers,
  Styleguide,
} from './pages';
function stored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
}
export function App() {
  const [path, setPath] = useState(location.pathname),
    [data, setData] = useState<Dashboard | null>(null),
    [range, setRange] = useState<Range>('week'),
    [size, updateSize] = useState(50),
    [safe, setSafe] = useState(() => stored('upswing-safe', false)),
    [theme, setTheme] = useState<'dark' | 'light'>(() => stored('upswing-theme', 'dark'));
  const [watchlist, setWatchlist] = useState<string[]>(() => stored('upswing-watchlist', [])),
    [toast, setToast] = useState(''),
    [error, setError] = useState(''),
    [connecting, setConnecting] = useState(false),
    [authConfigured, setAuthConfigured] = useState(false),
    [initial, setInitial] = useState(''),
    [sidebar, setSidebar] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [filter, setFilter] = useState('For you'),
    [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null),
    sizeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    [requestSize, setRequestSize] = useState(50);
  const notify = useCallback((message: string) => setToast(message), []);
  const navigate = useCallback((to: string) => {
    history.pushState({}, '', to);
    setPath(to.split('?')[0]);
    setSidebar(false);
    setQuery('');
    window.scrollTo(0, 0);
  }, []);
  const ask = useCallback(
    (q: string) => {
      setInitial(q);
      navigate('/ask');
    },
    [navigate],
  );
  const connect = useCallback(() => setConnecting(true), []);
  const setSize = useCallback((n: number) => {
    updateSize(n);
    clearTimeout(sizeTimer.current);
    sizeTimer.current = setTimeout(() => setRequestSize(n), 180);
  }, []);
  const toggleWatch = useCallback(
    (id: string) => setWatchlist((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id])),
    [],
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('upswing-theme', JSON.stringify(theme));
  }, [theme]);
  useEffect(() => {
    localStorage.setItem('upswing-safe', JSON.stringify(safe));
  }, [safe]);
  useEffect(() => {
    localStorage.setItem('upswing-watchlist', JSON.stringify(watchlist));
  }, [watchlist]);
  useEffect(() => {
    const back = () => setPath(location.pathname);
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setQuery('');
        setSidebar(false);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await api<Dashboard>(`/api/pulse?range=${range}&size=${requestSize}`);
        if (active) {
          setData(result);
          setError('');
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [range, requestSize]);
  useEffect(() => {
    void api<{ authConfigured: boolean }>('/api/me')
      .then((r) => setAuthConfigured(r.authConfigured))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  if (!data)
    return (
      <div className="app-loading">
        <Logo />
        <div className="loading-line" />
        {error ? (
          <p>
            {error}{' '}
            <button className="text-link" onClick={() => location.reload()}>
              Retry
            </button>
          </p>
        ) : (
          <p>Finding the signals…</p>
        )}
      </div>
    );
  const state = { data, range, size, setSize, safe, watchlist, toggleWatch, navigate, ask, notify, connect };
  if (path.startsWith('/overlay/'))
    return (
      <AppContext value={state}>
        <Overlay login={decodeURIComponent(path.split('/')[2] ?? '')} />
      </AppContext>
    );
  const results = query.trim()
    ? [
        ...data.games
          .filter((g) => g.name.toLowerCase().includes(query.toLowerCase()))
          .map((g) => ({ name: g.name, type: 'Category', to: `/categories/${g.id}` })),
        ...data.streamers
          .filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
          .map((s) => ({ name: s.name, type: 'Streamer', to: `/streamers/${s.login}` })),
      ].slice(0, 7)
    : [];
  let page = <Pulse filter={filter} setFilter={setFilter} />;
  if (path === '/' || path === '/data') page = <RealData />;
  else if (path === '/categories') page = <Categories />;
  else if (path.startsWith('/categories/')) page = <CategoryDetail id={path.split('/')[2]} />;
  else if (path.startsWith('/streamers')) page = <Streamers login={path.split('/')[2]} />;
  else if (path === '/keywords') page = <Keywords />;
  else if (path === '/opportunity') page = <Opportunity />;
  else if (path === '/ask') page = <Ask initial={initial} consume={() => setInitial('')} />;
  else if (path === '/reports') page = <Reports />;
  else if (path === '/alerts') page = <Alerts />;
  else if (path === '/channel') page = <Channel />;
  else if (path === '/about/data') page = <About />;
  else if (path === '/styleguide') page = <Styleguide />;
  else if (path !== '/pulse')
    page = (
      <div className="empty-state">
        <h1>This page took a different route.</h1>
        <Link to="/pulse" className="button primary">
          Back to Pulse
        </Link>
      </div>
    );
  return (
    <AppContext value={state}>
      <div className={`app ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <header className="topbar">
          <div className="brand-area">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={sidebar}
              aria-controls="discovery-sidebar"
              onClick={() => setSidebar(!sidebar)}
            >
              <Menu size={21} />
            </button>
            <Link to="/" className="brand-link" label="Upswing home">
              <Logo />
            </Link>
            <Link to="/categories" className="topbar-browse">
              Browse
            </Link>
            <details className="topbar-more">
              <summary aria-label="More navigation">
                <MoreVertical size={20} />
              </summary>
              <div>
                <Link to="/about/data">About the data</Link>
                <Link to="/styleguide">Styleguide</Link>
              </div>
            </details>
          </div>
          <div className="topbar-center">
            <div className="global-search">
              <input
                ref={searchRef}
                placeholder="Search categories, streamers…"
                aria-label="Search categories and streamers"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && results[0]) navigate(results[0].to);
                }}
              />
              <button
                className="search-submit"
                aria-label="Search"
                onClick={() => (results[0] ? navigate(results[0].to) : searchRef.current?.focus())}
              >
                <Search size={20} />
              </button>
              {query && (
                <div className="search-results">
                  {results.length ? (
                    results.map((r) => (
                      <Link key={r.to} to={r.to}>
                        <span>{r.name}</span>
                        <small>{r.type}</small>
                      </Link>
                    ))
                  ) : (
                    <p>No matches for “{query}”</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button theme-button"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="button primary connect-button" onClick={connect}>
              Connect Twitch <ArrowUpRight size={14} />
            </button>
          </div>
        </header>
        <Sidebar
          path={path}
          mobileOpen={sidebar}
          collapsed={collapsed}
          onCollapse={() => setCollapsed(!collapsed)}
          safe={safe}
          setSafe={setSafe}
        />
        {sidebar && (
          <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebar(false)} />
        )}
        <div className="main-shell">
          <BrowseNavigation path={path} setRange={setRange} />
          <main id="main-content" className="main-content">
            {error && <div className="error-banner">{error}</div>}
            {page}
            <footer className="footer">
              <Logo small />
              <span>Upswing is an independent project, not affiliated with or endorsed by Twitch.</span>
              <Link to="/about/data">
                Data & methodology <ArrowUpRight size={12} />
              </Link>
            </footer>
          </main>
        </div>
        {toast && (
          <div className="toast" role="status">
            {toast}
            <button className="icon-button" onClick={() => setToast('')} aria-label="Dismiss notification">
              <X size={15} />
            </button>
          </div>
        )}
        {connecting && (
          <Modal title="Connect your corner of Twitch" close={() => setConnecting(false)}>
            <span className="connect-modal-icon">
              <Users size={32} />
            </span>
            <p>
              Bring your channel into the picture. Find categories for your audience, try a clearer title, and
              keep your community in the loop.
            </p>
            {authConfigured ? (
              <a className="button primary full-width" href="/auth/twitch/login">
                Continue with Twitch <ArrowUpRight size={16} />
              </a>
            ) : (
              <div className="setup-note">
                <strong>
                  {data.source === 'synthetic'
                    ? 'You’re in the keyless sample demo.'
                    : 'This instance needs Twitch configuration.'}
                </strong>
                <p>
                  Add your Twitch app credentials and generated encryption/session keys to your local{' '}
                  <code>.env</code>, then run <code>npm start</code> in live mode. The README has the exact
                  setup steps.
                </p>
                <button
                  className="button secondary full-width"
                  onClick={() => {
                    setConnecting(false);
                    navigate('/channel');
                  }}
                >
                  Explore the channel preview <ArrowRight size={15} />
                </button>
              </div>
            )}
            <p className="fine-print muted">
              <Shield size={13} /> Extra permissions are requested only when you enable channel editing,
              raids, or the bot.
            </p>
          </Modal>
        )}
      </div>
    </AppContext>
  );
}
function Overlay({ login }: { login: string }) {
  const { data, range } = useApp(),
    params = new URLSearchParams(location.search),
    widget = params.get('widget') ?? 'ticker',
    light = params.get('theme') === 'light',
    scale = Math.min(3, Math.max(0.5, Number(params.get('scale')) || 1));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    document.body.classList.add('overlay-body');
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    const stream = new EventSource(`/sse/overlay/${encodeURIComponent(login)}`);
    stream.onmessage = (e) => setTick((JSON.parse(e.data) as { replayHour: number }).replayHour ?? 0);
    return () => {
      stream.close();
      document.body.classList.remove('overlay-body');
    };
  }, [login, light]);
  const games = [...data.games].sort((a, b) => (b.metric.deltaPct ?? 0) - (a.metric.deltaPct ?? 0));
  const active = games.length ? games[tick % games.length] : null;
  const streamer =
    data.streamers.find((s) => s.login === login) ??
    (data.source === 'synthetic' ? data.streamers[0] : undefined);
  return (
    <div
      className={`obs-overlay ${widget}`}
      style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
    >
      <Logo small />
      {data.source === 'synthetic' && <span className="sample-overlay">Synthetic sample replay</span>}
      {widget === 'ticker' ? (
        <div className="ticker-track">
          {games.map((g) => (
            <span key={g.id}>
              {g.name} <Change value={g.metric.deltaPct} />
              <b>{compact(g.metric.value)}</b>
            </span>
          ))}
        </div>
      ) : widget === 'momentum' ? (
        <div>
          <span>{streamer?.name ?? login}</span>
          <h1>
            {streamer
              ? compact(
                  streamer.latestViewers ??
                    streamer.series.at(-((tick % 24) + 1))?.value ??
                    streamer.metric.value,
                )
              : '—'}{' '}
            <small>viewers</small>
          </h1>
          <p>
            vs {compact(streamer?.metric.value ?? 0)} {range} average
          </p>
          <Change value={streamer?.metric.deltaPct ?? null} />
        </div>
      ) : (
        <div>
          <span>{widget === 'alert' ? 'Category on the move' : `Rising this ${range}`}</span>
          <h1>{active?.name ?? 'Collecting history'}</h1>
          <Change value={active?.metric.deltaPct ?? null} />
          <p>{compact(active?.metric.value ?? 0)} average viewers</p>
        </div>
      )}
    </div>
  );
}
