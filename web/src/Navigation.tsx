import {
  Activity,
  Database,
  ArrowLeftToLine,
  ArrowUpRight,
  Compass,
  FileText,
  Gamepad2,
  Info,
  Bell,
  Shield,
  Sparkles,
  Tags,
  Users,
  Video,
  Star,
} from 'lucide-react';
import type { Range } from '../../src/shared/types';
import { useApp } from './context';
import { Change, Link, Logo } from './components';
import { compact } from './lib';

const pages = [
  { name: 'Real data', path: '/data', icon: Database },
  { name: 'Pulse', path: '/pulse', icon: Activity },
  { name: 'Categories', path: '/categories', icon: Gamepad2 },
  { name: 'Streamers', path: '/streamers', icon: Users },
  { name: 'Keywords & tags', path: '/keywords', icon: Tags },
  { name: 'Opportunity', path: '/opportunity', icon: Compass },
];
const workspace = [
  { name: 'Ask Upswing', path: '/ask', icon: Sparkles },
  { name: 'Reports', path: '/reports', icon: FileText },
  { name: 'Alerts', path: '/alerts', icon: Bell },
  { name: 'My Channel', path: '/channel', icon: Video },
];
const matches = (path: string, target: string) =>
  target === '/data' ? path === '/' || path === '/data' : path.startsWith(target);

export function BrowseNavigation({ path, setRange }: { path: string; setRange: (range: Range) => void }) {
  const { data, range } = useApp();
  const realPage = path === '/' || path === '/data';
  return (
    <div className="browse-navigation">
      <nav aria-label="Main navigation">
        {pages.map((p) => (
          <Link key={p.path} to={p.path} className={`browse-link ${matches(path, p.path) ? 'active' : ''}`}>
            <p.icon size={16} />
            <span>{p.path === '/pulse' && data.source === 'synthetic' ? 'Demo Pulse' : p.name}</span>
          </Link>
        ))}
      </nav>
      <div className="browse-controls">
        <span
          className={`dataset-label ${realPage ? 'is-external' : data.source === 'live' ? 'is-live' : ''}`}
        >
          <i />
          {realPage
            ? 'Real TwitchTracker summaries'
            : data.source === 'synthetic'
              ? 'Synthetic sample data'
              : 'Collected Twitch data'}
        </span>
        <div className="range-toggle" aria-label={realPage ? 'Saved history window' : 'Analysis range'}>
          {(['week', 'month'] as Range[]).map((r) => (
            <button
              key={r}
              aria-pressed={range === r}
              className={range === r ? 'active' : ''}
              onClick={() => setRange(r)}
            >
              {r === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Sidebar({
  path,
  mobileOpen,
  collapsed,
  onCollapse,
  safe,
  setSafe,
}: {
  path: string;
  mobileOpen: boolean;
  collapsed: boolean;
  onCollapse: () => void;
  safe: boolean;
  setSafe: (safe: boolean) => void;
}) {
  const { data, watchlist } = useApp();
  const realPage = path === '/' || path === '/data';
  return (
    <aside
      id="discovery-sidebar"
      className={`sidebar ${mobileOpen ? 'mobile-open' : ''} ${realPage ? 'real-data-sidebar' : ''}`}
      aria-label="Streamer discovery and workspace"
    >
      <div className="sidebar-heading" title="Average viewers and growth over the selected comparison">
        <span>{realPage ? 'Real data sources' : 'Rising streamers'}</span>
        <button
          className="icon-button"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={onCollapse}
        >
          <ArrowLeftToLine size={17} />
        </button>
      </div>
      {realPage && (
        <p className="sidebar-source-note">
          TwitchTracker summaries are saved locally. Direct Twitch observations begin once app credentials are
          configured.
        </p>
      )}
      <div className="sidebar-streamers">
        {data.streamers
          .filter((s) => (s.metric.deltaPct ?? 0) > 0)
          .slice(0, 7)
          .map((s) => (
            <Link
              key={s.id}
              to={`/streamers/${s.login}`}
              className="sidebar-streamer"
              label={`${s.name}, ${compact(s.metric.value)} average viewers`}
            >
              <span className="avatar" style={{ color: s.color, background: `${s.color}22` }}>
                {s.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="sidebar-streamer-text">
                <strong>{s.name}</strong>
                <small>{data.games.find((g) => g.id === s.gameId)?.name}</small>
              </span>
              <span className="sidebar-audience">
                <strong>
                  {data.source === 'live' && s.live && <i />}
                  {compact(s.metric.value)}
                </strong>
                <span className="sidebar-gain">
                  ↗ {s.metric.deltaPct === null ? '—' : `${Math.round(s.metric.deltaPct * 100)}%`}
                </span>
              </span>
            </Link>
          ))}
      </div>
      <Link className="sidebar-more" to="/streamers">
        Show more
      </Link>
      <div className="sidebar-divider" />
      <div className="sidebar-heading">
        <span>Your workspace</span>
      </div>
      <nav aria-label="Workspace">
        {workspace.map((p) => (
          <Link
            key={p.path}
            to={p.path}
            label={p.name}
            className={`nav-item ${matches(path, p.path) ? 'active' : ''} ${p.name === 'Ask Upswing' ? 'ask-nav' : ''}`}
          >
            <p.icon size={19} />
            <span>{p.name}</span>
            {p.name === 'Ask Upswing' && <span className="ai-label">AI</span>}
          </Link>
        ))}
      </nav>
      {!realPage && watchlist.length > 0 && (
        <>
          <div className="sidebar-divider" />
          <div className="sidebar-heading watchlist-title">
            <span>Following</span>
            <Star size={14} />
          </div>
          {data.games
            .filter((g) => watchlist.includes(g.id))
            .map((g) => (
              <Link className="watchlist-item" key={g.id} to={`/categories/${g.id}`} label={g.name}>
                <i style={{ background: g.color }} />
                <span>{g.name}</span>
                <Change value={g.metric.deltaPct} subtle />
              </Link>
            ))}
        </>
      )}
      <div className="sidebar-bottom">
        <div className="demo-safe">
          <Shield size={16} />
          <span>Demo-safe visuals</span>
          <button
            role="switch"
            aria-checked={safe}
            aria-label="Demo-safe visuals"
            className={`switch ${safe ? 'on' : ''}`}
            onClick={() => setSafe(!safe)}
          >
            <i />
          </button>
        </div>
        <Link className="sidebar-about" to="/about/data">
          <Info size={15} />
          About the data
          <ArrowUpRight size={12} />
        </Link>
        <Link className="sidebar-brand" to="/">
          <Logo small />
        </Link>
      </div>
    </aside>
  );
}
