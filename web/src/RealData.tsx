import { useEffect, useState } from 'react';
import { Database, RefreshCw, Radio, Clock3, ExternalLink, ArrowRight } from 'lucide-react';
import type { CollectionOverview, SourceItem, SourceKind } from '../../src/shared/types';
import { useApp } from './context';
import { Chart, barOption } from './Chart';
import { Art } from './Art';
import { Link, Empty, SectionHead } from './components';
import { api, compact } from './lib';
const time = (ts: number | null) => (ts ? new Date(ts).toLocaleString() : 'Not yet');
export function RealData() {
  const { range, safe } = useApp();
  const [overview, setOverview] = useState<CollectionOverview | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [kind, setKind] = useState<SourceKind>('category'),
    [selected, setSelected] = useState('');
  const [history, setHistory] = useState<{
    key: string;
    points: { ts: number; metrics: Record<string, number> }[];
    error?: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const load = () =>
      void api<CollectionOverview>('/api/collection')
        .then((value) => {
          if (active) {
            setOverview(value);
            setError('');
          }
        })
        .catch((e) => {
          if (active) setError((e as Error).message);
        });
    load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [revision]);
  const items = (overview?.items ?? [])
    .filter((i) => i.kind === kind)
    .sort((a, b) => (b.metrics?.avg_viewers ?? -1) - (a.metrics?.avg_viewers ?? -1));
  const item = items.find((i) => i.key === selected) ?? items.find((i) => i.metrics) ?? items[0];
  const entityKey = item?.key;
  const historyKey = `${kind}:${item?.key ?? ''}:${range}:${revision}:${item?.observedAt ?? ''}`;
  useEffect(() => {
    let active = true;
    if (entityKey)
      void api<{ points: { ts: number; metrics: Record<string, number> }[] }>(
        `/api/collection/history?kind=${kind}&key=${encodeURIComponent(entityKey)}&range=${range}`,
      )
        .then((value) => {
          if (active) setHistory({ key: historyKey, points: value.points });
        })
        .catch((e) => {
          if (active) setHistory({ key: historyKey, points: [], error: (e as Error).message });
        });
    return () => {
      active = false;
    };
  }, [kind, entityKey, range, historyKey]);
  const points = history?.key === historyKey ? history.points : [];
  const historyError = history?.key === historyKey ? history.error : null;
  const populated = items.filter((i) => i.metrics);
  return (
    <div className="real-data-page">
      <div className="page-intro subpage-intro">
        <div>
          <h1>Real Twitch data</h1>
          <p>Public category and streamer summaries, collected and saved from TwitchTracker.</p>
        </div>
        <button className="button secondary" onClick={() => setRevision(revision + 1)}>
          <RefreshCw size={15} />
          Refresh saved data
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!overview ? (
        <div role="status" className="trend-loading">
          Loading collection status and saved observations…
        </div>
      ) : (
        <>
          <div className="collection-status">
            <span className={`collection-dot ${overview.active ? 'running' : ''}`} />
            <strong>
              {overview.active
                ? 'Logger running'
                : overview.lastFinished
                  ? 'Saved data available'
                  : 'Waiting for first collection'}
            </strong>
            <span>Checks every {overview.intervalMin} minutes</span>
            <span>Next check: {time(overview.nextDue)}</span>
          </div>
          <div className="collection-stats">
            <div>
              <Database size={20} />
              <span>
                Saved observations<strong>{overview.totalSnapshots.toLocaleString()}</strong>
              </span>
            </div>
            <div>
              <Radio size={20} />
              <span>
                Tracking
                <strong>
                  {overview.items.filter((i) => i.kind === 'category').length} categories ·{' '}
                  {overview.items.filter((i) => i.kind === 'channel').length} channels
                </strong>
              </span>
            </div>
            <div>
              <Clock3 size={20} />
              <span>
                Collection began<strong>{time(overview.firstObserved)}</strong>
              </span>
            </div>
          </div>
          {overview.lastError && (
            <p className="source-notice">
              Latest collection warning: {overview.lastError} Previously saved data is retained.
            </p>
          )}
          <div className="source-period-note">
            <strong>Real provider summaries</strong>
            <p>
              These averages and ranks come from TwitchTracker's public summary API, documented as 30-day
              summaries. The period follows the provider; they are not current concurrent viewers or Upswing
              Week/Month growth. The history window shows when we saved each summary.
            </p>
            <a href="https://twitchtracker.com/api" target="_blank" rel="noreferrer">
              Source API <ExternalLink size={13} />
            </a>
          </div>
          <nav className="tabs source-kind-tabs" aria-label="Real data type">
            <button
              className={kind === 'category' ? 'active' : ''}
              aria-pressed={kind === 'category'}
              onClick={() => setKind('category')}
            >
              Categories
            </button>
            <button
              className={kind === 'channel' ? 'active' : ''}
              aria-pressed={kind === 'channel'}
              onClick={() => setKind('channel')}
            >
              Streamers
            </button>
          </nav>
          {!items.length ? (
            <Empty title="No sources configured.">
              Start the collector or configure the public summary watchlist in your local environment.
            </Empty>
          ) : (
            <>
              <div className="real-data-grid">
                <section className="panel source-leaders">
                  <SectionHead
                    title={kind === 'category' ? 'Tracked category summaries' : 'Tracked streamer summaries'}
                    description="Ranked by the provider's average viewers. Select a row to explore saved history."
                  />
                  {items.map((i) => (
                    <button
                      key={i.key}
                      className={`source-item ${item?.key === i.key ? 'active' : ''}`}
                      aria-pressed={item?.key === i.key}
                      onClick={() => setSelected(i.key)}
                    >
                      {kind === 'category' ? (
                        <Art
                          small
                          kind="crystal"
                          color="#bf94ff"
                          name={i.label}
                          safe={safe}
                          src={i.artwork}
                        />
                      ) : (
                        <span className="source-avatar">{i.label.slice(0, 2).toUpperCase()}</span>
                      )}
                      <span className="source-item-name">
                        <strong>{i.label}</strong>
                        <small>
                          {i.metrics
                            ? `${i.observations} saved ${i.observations === 1 ? 'observation' : 'observations'}`
                            : i.lastError
                              ? 'Collection needs retry'
                              : 'Waiting for first collection'}
                        </small>
                      </span>
                      <b>
                        {i.metrics ? compact(i.metrics.avg_viewers) : '—'}
                        <small>avg viewers</small>
                      </b>
                    </button>
                  ))}
                </section>
                {item && (
                  <section className="panel source-detail">
                    <div className="source-detail-heading">
                      <span className="tag">TwitchTracker · real summary</span>
                      <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                        Source <ExternalLink size={13} />
                      </a>
                    </div>
                    <h2>{item.label}</h2>
                    {item.metrics ? (
                      <>
                        <div className="source-big-number">
                          {compact(item.metrics.avg_viewers)}
                          <span>average viewers · provider summary</span>
                        </div>
                        <SourceMetrics item={item} />
                        <div className="source-history-title">
                          <strong>Saved summary history</strong>
                          <span>Past {range === 'week' ? '7' : '30'} days</span>
                        </div>
                        {historyError ? (
                          <p className="source-notice">{historyError}</p>
                        ) : points.length ? (
                          <Chart
                            height={230}
                            label={`${item.label}, observed summary averages by collection time`}
                            table={points.map((p) => ({ name: time(p.ts), value: p.metrics.avg_viewers }))}
                            option={{
                              animation: false,
                              grid: { top: 20, left: 45, right: 20, bottom: 40 },
                              tooltip: { trigger: 'axis', confine: true },
                              xAxis: { type: 'time', axisLabel: { color: '#797989' } },
                              yAxis: {
                                type: 'value',
                                axisLabel: { color: '#797989', formatter: (n: number) => compact(n) },
                                splitLine: { lineStyle: { color: '#79798922', type: 'dashed' } },
                              },
                              series: [
                                {
                                  type: 'line',
                                  showSymbol: true,
                                  symbolSize: points.length === 1 ? 12 : 6,
                                  connectNulls: false,
                                  lineStyle: { color: '#39dca0', width: 2 },
                                  itemStyle: { color: '#39dca0' },
                                  data: points.map((p) => [p.ts, p.metrics.avg_viewers]),
                                },
                              ],
                            }}
                          />
                        ) : (
                          <p className="muted fine-print">No saved points in this history window.</p>
                        )}
                        <p className="source-history-caption">
                          {points.length === 1
                            ? 'One real observation so far. The logger will add history as it runs.'
                            : 'Each point is a saved provider-summary average, not a live concurrent-viewer sample.'}
                        </p>
                        <p className="source-fetched">Fetched {time(item.observedAt)}</p>
                      </>
                    ) : (
                      <p className="source-notice">
                        {item.lastError ??
                          'The first scheduled collection has not completed for this source yet.'}
                      </p>
                    )}
                  </section>
                )}
              </div>
              {populated.length > 0 && (
                <section className="panel section-space">
                  <SectionHead
                    title="Average audience across tracked sources"
                    description="Provider summary averages; this watchlist is not a platform-wide ranking."
                  />
                  <Chart
                    label={`${kind} provider summary average viewers`}
                    height={Math.max(240, populated.length * 28)}
                    table={populated.map((i) => ({ name: i.label, value: i.metrics!.avg_viewers }))}
                    option={barOption(
                      populated.map((i) => ({ name: i.label, value: i.metrics!.avg_viewers })),
                    )}
                  />
                </section>
              )}
            </>
          )}
          <section className="panel direct-collection">
            <SectionHead
              title="Direct Twitch collection"
              description="Current stream viewers, titles, tags, broadcasts and categories through Twitch's official API."
            />
            <div className="direct-status">
              <span className="tag">
                {overview.directTwitch.active
                  ? 'Collector running'
                  : overview.directTwitch.configured
                    ? 'Configured; worker stopped'
                    : 'App credentials needed'}
              </span>
              <span>
                {overview.directTwitch.polls} successful polls ·{' '}
                {overview.directTwitch.samples.toLocaleString()} stream samples
              </span>
            </div>
            <p>
              {overview.directTwitch.configured
                ? 'Live observations start at the first successful poll. Supported comparisons need actual coverage in both windows.'
                : 'Create a Twitch developer app and set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in your local .env file, then restart the service. Public stream collection does not need each streamer to log in.'}
            </p>
            <p>
              Title/tag trends and audience-size scans need this direct collector. TwitchTracker summaries are
              stored separately and do not fill missing viewer history.
            </p>
            <Link to="/about/data" className="text-link">
              Data and collection methods <ArrowRight size={14} />
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
function SourceMetrics({ item }: { item: SourceItem }) {
  const values = item.metrics!;
  const metrics =
    item.kind === 'category'
      ? [
          ['Average channels', values.avg_channels],
          ['Hours watched', values.hours_watched],
          ['Provider rank', values.rank],
        ]
      : [
          ['Peak viewers', values.max_viewers],
          ['Hours streamed', values.minutes_streamed / 60],
          ['Followers', values.followers_total],
        ];
  return (
    <div className="source-metrics">
      {metrics.map(([label, value]) => (
        <div key={String(label)}>
          <span>{label}</span>
          <strong>{typeof value === 'number' ? compact(value) : '—'}</strong>
        </div>
      ))}
    </div>
  );
}
