import { useEffect, useState } from 'react';
import { ArrowRight, Hash, Quote, TrendingUp } from 'lucide-react';
import type { LineSeriesOption } from 'echarts/charts';
import type { Game, TermKind, TermOverview, TermTrend } from '../../src/shared/types';
import { useApp } from './context';
import { Chart, areaOption } from './Chart';
import { Art } from './Art';
import { Change, Empty, Link, SectionHead, TrendCard } from './components';
import { api, compact, percent } from './lib';

export function CategoryTrends({ games }: { games: Game[] }) {
  const { range } = useApp();
  const rising = games
    .filter((g) => !g.metric.insufficientData && (g.metric.deltaPct ?? 0) > 0)
    .sort((a, b) => (b.metric.deltaPct ?? 0) - (a.metric.deltaPct ?? 0));
  const falling = games
    .filter((g) => !g.metric.insufficientData && (g.metric.deltaPct ?? 0) < 0)
    .sort((a, b) => (a.metric.deltaPct ?? 0) - (b.metric.deltaPct ?? 0));
  if (!games.length) return null;
  return (
    <section className="category-trends" aria-label="Category trend charts">
      <SectionHead
        title={`Trending this ${range}`}
        description="The biggest movements in your current category selection."
      >
        <a href="#category-directory" className="text-link">
          Browse covers <ArrowRight size={14} />
        </a>
      </SectionHead>
      <div className="discovery-trend-grid">
        {[
          { title: 'Taking off', games: rising, color: '#39dca0', tag: 'Rising categories' },
          { title: 'Cooling down', games: falling, color: '#ff687b', tag: 'Falling categories' },
        ].map((group) => (
          <TrendCard
            key={group.title}
            title={group.title}
            tag={group.tag}
            color={group.color}
            subtitle={
              group.games[0]
                ? `${group.games[0].name} · ${percent(group.games[0].metric.deltaPct)} vs previous ${range}`
                : 'No supported movement in this selection'
            }
            metric={group.games[0]?.metric}
            points={group.games[0]?.series ?? []}
            games={group.games.slice(0, 3)}
          />
        ))}
      </div>
    </section>
  );
}

export function TermExplorer() {
  const { data, range, safe } = useApp();
  const [kind, setKind] = useState<TermKind>('keyword'),
    [result, setResult] = useState<{ key: string; value?: TermOverview; error?: string } | null>(null),
    [selected, setSelected] = useState(''),
    [attempt, setAttempt] = useState(0);
  const requestKey = `${kind}:${range}:${attempt}`;
  const overview = result?.key === requestKey ? result.value : null;
  const error = result?.key === requestKey ? result.error : '';
  useEffect(() => {
    let active = true;
    void api<TermOverview>(`/api/terms?kind=${kind}&range=${range}`)
      .then((value) => {
        if (active) setResult({ key: requestKey, value });
      })
      .catch((e) => {
        if (active) setResult({ key: requestKey, error: (e as Error).message });
      });
    return () => {
      active = false;
    };
  }, [kind, range, requestKey]);
  const terms = [...(overview?.terms ?? [])].sort(
    (a, b) => (b.deltaPct ?? -Infinity) - (a.deltaPct ?? -Infinity) || b.channels - a.channels,
  );
  const signal = terms.find((t) => t.term === selected) ?? terms[0];
  const noun = kind === 'keyword' ? 'title keywords' : 'tags';
  const related =
    signal?.categories.flatMap((c) => {
      const game = data.games.find((g) => g.id === c.gameId);
      return game ? [{ game, channels: c.channels }] : [];
    }) ?? [];
  return (
    <section className="term-explorer" aria-label="Keyword and tag trends">
      <div className="term-toolbar">
        <nav className="tabs" aria-label="Signal type">
          <button
            className={kind === 'keyword' ? 'active' : ''}
            aria-pressed={kind === 'keyword'}
            onClick={() => setKind('keyword')}
          >
            <Quote size={17} />
            Title keywords
          </button>
          <button
            className={kind === 'tag' ? 'active' : ''}
            aria-pressed={kind === 'tag'}
            onClick={() => setKind('tag')}
          >
            <Hash size={17} />
            Tags
          </button>
        </nav>
        <span className="comparison-note">
          {range === 'week' ? 'Last 7 days vs previous 7 days' : 'Last 30 days vs previous 30 days'}
        </span>
      </div>
      {error ? (
        <div className="empty-state">
          <p>{error}</p>
          <button className="button secondary" onClick={() => setAttempt(attempt + 1)}>
            Retry trends
          </button>
        </div>
      ) : !overview ? (
        <div className="trend-loading" role="status">
          Loading {noun} and daily history…
        </div>
      ) : !signal ? (
        <Empty title={`No supported ${noun} yet.`}>
          Keep collecting title and tag observations. A term needs at least 15 distinct observed channels
          before it appears.
        </Empty>
      ) : (
        <>
          <div className="term-trend-layout">
            <article className="trend-card term-spotlight" aria-label="Selected term trend">
              <div className="card-top">
                <span className="card-tag">
                  {kind === 'keyword' ? 'A phrase on stream' : 'A tag to watch'}
                </span>
                <span className="tag">
                  {overview.source === 'synthetic' ? 'Synthetic sample' : 'Observed data'}
                </span>
              </div>
              <h2>
                {kind === 'tag' ? '#' : ''}
                {signal.term}
              </h2>
              <p className="term-context">
                {kind === 'keyword' ? 'In stream titles' : 'In stream tags'} ·{' '}
                {overview.source === 'synthetic' ? 'sample activity' : 'observed metadata updates'}
              </p>
              <div className="term-value">
                <strong>{compact(signal.channels)}</strong>
                <span>
                  distinct channels this {range}
                  <Change value={signal.deltaPct} subtle />
                </span>
              </div>
              {signal.deltaPct === null && (
                <p className="fine-print muted">
                  Comparison needs a covered previous window and 15 prior channels.
                </p>
              )}
              <TermChart signal={signal} />
              <p className="chart-caption">
                Daily distinct channels · UTC days · {kind === 'keyword' ? 'title' : 'tag'} observations
              </p>
              <div className="term-related-title">
                {overview.source === 'synthetic' ? 'Categories in this sample' : 'Categories using this term'}
              </div>
              <div className="rank-list term-related">
                {related.map(({ game, channels }) => (
                  <Link key={game.id} to={`/categories/${game.id}`} className="rank-row">
                    <Art
                      small
                      kind={game.art}
                      color={game.color}
                      name={game.name}
                      safe={safe}
                      src={game.boxArtUrl}
                    />
                    <div className="rank-name">
                      <strong>{game.name}</strong>
                      <small>Channels with this {kind === 'keyword' ? 'phrase' : 'tag'}</small>
                    </div>
                    <b className="rank-value">
                      {compact(channels)}
                      <small>channels</small>
                    </b>
                  </Link>
                ))}
              </div>
              <div className="card-footer">
                <span>
                  {overview.source === 'synthetic' ? 'Synthetic sample data' : 'Collected public metadata'}
                </span>
                <Link to="/about/data">About the data</Link>
              </div>
            </article>
            <section className="term-ranking panel" aria-label="Trending terms">
              <SectionHead
                title={`Trending ${noun}`}
                description="Choose a signal to explore its history and categories."
              />
              <div className="term-ranking-list">
                {terms.map((term, i) => (
                  <button
                    key={term.term}
                    className={`term-choice ${signal.term === term.term ? 'active' : ''}`}
                    aria-pressed={signal.term === term.term}
                    onClick={() => setSelected(term.term)}
                  >
                    <span className="term-position">{i + 1}</span>
                    <span className="term-choice-name">
                      <strong>
                        {kind === 'tag' ? '#' : ''}
                        {term.term}
                      </strong>
                      <small>{compact(term.channels)} distinct channels</small>
                    </span>
                    <Change value={term.deltaPct} subtle />
                  </button>
                ))}
              </div>
              <p className="term-method">{overview.basis}</p>
              {overview.truncated && (
                <p className="fine-print muted">
                  Observation limit reached; counts are lower bounds and comparisons are withheld.
                </p>
              )}
              <div className="term-legend">
                <TrendingUp size={16} />
                <span>Growth compares distinct channels across the two selected windows.</span>
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
function TermChart({ signal }: { signal: TermTrend }) {
  const { range } = useApp();
  const option = areaOption(signal.points, range, '#39dca0', false, true);
  const line = (option.series as LineSeriesOption[])[0];
  const last = signal.points.findLastIndex((p) => p.coverage > 0);
  option.series = [
    {
      ...line,
      data: signal.points.map((p) => (p.coverage > 0 ? p.value : null)),
      connectNulls: false,
      markPoint:
        last < 0
          ? undefined
          : {
              symbol: 'circle',
              symbolSize: 8,
              itemStyle: { color: '#39dca0', borderColor: '#39dca033', borderWidth: 6 },
              data: [{ coord: [last, signal.points[last].value] }],
            },
    },
  ];
  return (
    <Chart
      option={option}
      label={`${signal.term}, daily distinct channels this ${range}`}
      height={230}
      table={signal.points
        .filter((p) => p.coverage > 0)
        .map((p) => ({
          name: new Date(p.ts).toLocaleDateString('en-US', { timeZone: 'UTC' }),
          value: p.value,
        }))}
    />
  );
}
