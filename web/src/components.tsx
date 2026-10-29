import { useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, ArrowDownRight, Download, ArrowRight, TrendingUp, Star, X } from 'lucide-react';
import { toPng } from 'html-to-image';
import { useApp } from './context';
import { Art } from './Art';
import { Chart, areaOption } from './Chart';
import { absolute, compact, metricText, percent } from './lib';
import type { Game, Metric, Point } from '../../src/shared/types';
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`logo ${small ? 'logo-small' : ''}`}>
      <span className="logo-mark">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M6 23V16L13 9v7L26 3v10L13 26v-7l-7 7Z" fill="currentColor" />
        </svg>
      </span>
      <span>
        upswing<span className="logo-period">.</span>
      </span>
    </span>
  );
}
export function Link({
  to,
  children,
  className = '',
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  const { navigate } = useApp();
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          navigate(to);
        }
      }}
    >
      {children}
    </a>
  );
}
export function Change({ value, subtle = false }: { value: number | null; subtle?: boolean }) {
  return (
    <span
      className={`${subtle ? 'change-inline' : 'change'} ${value === null ? 'neutral' : value >= 0 ? 'positive' : 'negative'}`}
    >
      {value !== null && (value >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />)}
      {percent(value)}
    </span>
  );
}
export function Live({ sample = false }: { sample?: boolean }) {
  return (
    <span className={`live-pill ${sample ? 'sample-pill' : ''}`}>
      <i />
      {sample ? 'Sample' : 'Live'}
    </span>
  );
}
export function SectionHead({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function GameRow({ game, badge }: { game: Game; badge?: string }) {
  const { safe } = useApp();
  return (
    <Link className="rank-row" to={`/categories/${game.id}`}>
      <Art small kind={game.art} name={game.name} color={game.color} safe={safe} />
      <div className="rank-name">
        <strong>{game.name}</strong>
        <span>
          {badge ? <span className="tag">{badge}</span> : <Change value={game.metric.deltaPct} />}
          <small>{absolute(game.metric.deltaAbs)}</small>
        </span>
      </div>
      <b className="rank-value">{compact(game.metric.value)}</b>
    </Link>
  );
}
export function TrendCard({
  title,
  subtitle,
  points,
  metric,
  games,
  children,
  color = '#39dca0',
  tag,
}: {
  title: string;
  subtitle?: string;
  points: Point[];
  metric?: Metric;
  games?: Game[];
  children?: ReactNode;
  color?: string;
  tag?: string;
}) {
  const { range, data, notify } = useApp(),
    ref = useRef<HTMLElement>(null),
    [sharing, setSharing] = useState(false);
  async function share() {
    if (!ref.current) return;
    setSharing(true);
    try {
      const url = await toPng(ref.current, {
        cacheBust: true,
        pixelRatio: 1,
        canvasWidth: 1080,
        canvasHeight: 1350,
        backgroundColor: getComputedStyle(ref.current).backgroundColor,
        filter: (node) => !(node instanceof HTMLElement && node.dataset.noShare === 'true'),
      });
      const a = document.createElement('a');
      a.href = url;
      a.download = `upswing-${title.toLowerCase().replaceAll(' ', '-')}-${range}.png`;
      a.click();
      notify('Your 1080 × 1350 trend card is ready.');
    } catch {
      notify('Could not export the card. Try again after the charts finish loading.');
    } finally {
      setSharing(false);
    }
  }
  return (
    <article className="trend-card" ref={ref}>
      <div className="card-top">
        <span className="card-tag">{tag ?? `This ${range}`}</span>
        <button
          className="icon-button share-btn"
          data-no-share="true"
          title="Download trend card"
          aria-label={`Download ${title} trend card`}
          disabled={sharing}
          onClick={() => void share()}
        >
          <Download size={16} />
        </button>
      </div>
      <div className="card-title">
        <h2>{title}</h2>
        <Live sample={data.source === 'synthetic'} />
      </div>
      <p className="card-subtitle">
        {subtitle ?? (metric ? metricText(metric) : `Average viewers this ${range}`)}
      </p>
      {metric && (
        <div className="card-baseline">
          {absolute(metric.deltaAbs)} avg viewers <span>· Twitch {percent(data.platform.deltaPct)}</span>
        </div>
      )}
      <Chart
        option={areaOption(points, range, color)}
        label={`${title}, ${range} viewer trend`}
        height={156}
      />
      <div className="rank-list">
        {games?.map((g) => (
          <GameRow key={g.id} game={g} />
        ))}
        {children}
      </div>
      <div className="card-footer">
        <span>
          {data.source === 'synthetic' ? 'Synthetic sample data' : `${range} comparison · public data`}
        </span>
        <Logo small />
      </div>
    </article>
  );
}
export function CategoryTile({ game }: { game: Game }) {
  const { safe, watchlist, toggleWatch } = useApp();
  return (
    <article className="category-tile">
      <Link to={`/categories/${game.id}`} className="cover">
        <Art kind={game.art} name={game.name} color={game.color} safe={safe} />
        <span className="cover-name">{game.name}</span>
        <Change value={game.metric.deltaPct} />
      </Link>
      <div className="tile-info">
        <Link to={`/categories/${game.id}`}>
          <h3>{game.name}</h3>
        </Link>
        <button
          className={`icon-button ${watchlist.includes(game.id) ? 'saved' : ''}`}
          aria-label={`${watchlist.includes(game.id) ? 'Unwatch' : 'Watch'} ${game.name}`}
          onClick={() => toggleWatch(game.id)}
        >
          <Star size={15} fill={watchlist.includes(game.id) ? 'currentColor' : 'none'} />
        </button>
      </div>
      <p>
        {compact(game.metric.value)} avg viewers <span>· {absolute(game.metric.deltaAbs)}</span>
      </p>
      <span className="tag">{game.genre}</span>
    </article>
  );
}
export function Empty({
  title = 'A little more history goes a long way.',
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <TrendingUp size={32} />
      <h2>{title}</h2>
      <p>{children ?? 'Keep the collector running to unlock supported Week and Month comparisons.'}</p>
    </div>
  );
}
export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <dialog
      ref={(node) => {
        ref.current = node;
        if (node && !node.open) node.showModal();
      }}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" onClick={close} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function OpportunityPanel() {
  const { data, size, setSize } = useApp(),
    best = [...data.games]
      .filter((g) => g.opportunityReady)
      .sort((a, b) => b.opportunity - a.opportunity)
      .slice(0, 3);
  return (
    <section className="panel opportunity-panel">
      <div className="opportunity-icon">
        <TrendingUp size={22} />
      </div>
      <h2>Your next big opportunity.</h2>
      <p>
        You don’t need the biggest category.
        <br />
        You need the right one for you.
      </p>
      <div className="size-label">
        <label htmlFor="audience-size">Your average viewers</label>
        <strong>{compact(size)}</strong>
      </div>
      <input
        id="audience-size"
        type="range"
        min="5"
        max="500"
        step="5"
        value={Math.min(500, size)}
        onChange={(e) => setSize(Number(e.target.value))}
      />
      <div className="range-labels">
        <span>5 viewers</span>
        <span>500 viewers</span>
      </div>
      <div className="opportunity-mini">
        {best.map((g, i) => (
          <Link to={`/categories/${g.id}`} key={g.id}>
            <span className="mini-rank">{i + 1}</span>
            <span>
              {g.name}
              <small>Estimated rank #{g.rank}</small>
            </span>
            <strong>
              {g.opportunity}
              <small>/100</small>
            </strong>
          </Link>
        ))}
      </div>
      <Link to="/opportunity" className="button primary full-width">
        Find my next category <ArrowRight size={16} />
      </Link>
      <small className="fine-print">Directory positions are estimates.</small>
    </section>
  );
}
