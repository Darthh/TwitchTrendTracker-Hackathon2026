import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Compass,
  Crosshair,
  Ghost,
  Paintbrush,
  Search,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  Copy,
  Download,
  ExternalLink,
  Grid2X2,
  List,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { AnalystRun, Game, WhyReport } from '../../src/shared/types';
import { useApp } from './context';
import { Art } from './Art';
import { Chart, areaOption, barOption } from './Chart';
import {
  CategoryTile,
  Change,
  Empty,
  Link,
  Live,
  Logo,
  Modal,
  OpportunityPanel,
  SectionHead,
} from './components';
import { absolute, api, compact, metricText, percent } from './lib';
import { MarketMap } from './Pulse';
export function Categories() {
  const { data } = useApp(),
    [grid, setGrid] = useState(true),
    [genre, setGenre] = useState('All categories'),
    [query, setQuery] = useState(''),
    [sort, setSort] = useState('viewers');
  const games = data.games
    .filter(
      (g) =>
        (genre === 'All categories' || g.genre === genre) &&
        g.name.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'growth'
        ? (b.metric.deltaPct ?? -Infinity) - (a.metric.deltaPct ?? -Infinity)
        : sort === 'opportunity'
          ? b.opportunity - a.opportunity
          : b.metric.value - a.metric.value,
    );
  return (
    <div className="browse-page">
      <PageHeading
        title="Browse"
        description="Follow the audience. Discover what’s moving in every category."
      />
      <div className="category-shortcuts" aria-label="Category genres">
        {[
          { label: 'All categories', icon: Compass },
          { label: 'Horror', icon: Ghost },
          { label: 'Shooter', icon: Crosshair },
          { label: 'Community', icon: Users },
          { label: 'Creative', icon: Paintbrush },
        ].map((item) => (
          <button
            key={item.label}
            className={genre === item.label ? 'active' : ''}
            aria-pressed={genre === item.label}
            onClick={() => setGenre(item.label)}
          >
            <span>{item.label}</span>
            <item.icon size={40} />
          </button>
        ))}
      </div>
      <div className="browse-tabs-row">
        <nav className="tabs" aria-label="Browse content">
          <Link to="/categories" className="active">
            Categories
          </Link>
          <Link to="/streamers">Streamers</Link>
        </nav>
        <div className="view-switch">
          <button className={grid ? 'active' : ''} onClick={() => setGrid(true)} aria-label="Grid view">
            <Grid2X2 size={17} />
          </button>
          <button className={!grid ? 'active' : ''} onClick={() => setGrid(false)} aria-label="Table view">
            <List size={17} />
          </button>
        </div>
      </div>
      <div className="toolbar category-toolbar">
        <div className="category-search">
          <Search size={18} />
          <input
            className="input"
            placeholder="Search categories"
            aria-label="Search categories"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label className="select-label">
          Sort by{' '}
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="viewers">Average viewers</option>
            <option value="growth">Biggest growth</option>
            <option value="opportunity">Opportunity</option>
          </select>
        </label>
      </div>
      {!games.length ? (
        <Empty title="No categories found.">Try a different search or category filter.</Empty>
      ) : grid ? (
        <div className="category-grid">
          {games.map((g) => (
            <CategoryTile key={g.id} game={g} />
          ))}
        </div>
      ) : (
        <CategoryTable games={games} />
      )}
      <section className="panel section-space">
        <SectionHead
          title="The opportunity map"
          description="Audience demand against competition. Bubble size reflects opportunity."
        />
        <Chart
          label="Opportunity map: channel count versus average viewers"
          height={360}
          table={games.map((g) => ({ name: g.name, value: g.opportunity }))}
          option={{
            grid: { left: 70, bottom: 55, right: 35, top: 30 },
            tooltip: { trigger: 'item', confine: true },
            xAxis: {
              type: 'log',
              name: 'Avg live channels',
              nameLocation: 'middle',
              nameGap: 30,
              axisLabel: { color: '#797989' },
              splitLine: { lineStyle: { color: '#79798922' } },
            },
            yAxis: {
              type: 'log',
              name: 'Avg viewers',
              axisLabel: { color: '#797989', formatter: (v: number) => compact(v) },
              splitLine: { lineStyle: { color: '#79798922' } },
            },
            series: [
              {
                type: 'scatter',
                data: games.map((g) => ({
                  name: g.name,
                  value: [Math.max(1, g.channels), Math.max(1, g.metric.value), g.opportunity],
                  itemStyle: { color: g.color },
                  symbolSize: 12 + g.opportunity * 0.5,
                })),
                label: { show: true, formatter: '{b}', position: 'top', color: '#adadb8', fontSize: 10 },
              },
            ],
          }}
        />
      </section>
    </div>
  );
}
function CategoryTable({ games }: { games: Game[] }) {
  return (
    <div className="panel table-scroll">
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Avg viewers</th>
            <th>Change</th>
            <th>Avg channels</th>
            <th>Opportunity</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          {games.map((g) => (
            <tr key={g.id}>
              <td>
                <Link className="table-name" to={`/categories/${g.id}`}>
                  <span style={{ background: g.color }} />
                  {g.name}
                </Link>
              </td>
              <td>{compact(g.metric.value)}</td>
              <td>
                <Change value={g.metric.deltaPct} />
                <small className="block muted">{absolute(g.metric.deltaAbs)}</small>
              </td>
              <td>{compact(g.channels)}</td>
              <td>
                <b className="accent">{g.opportunity}/100</b>
              </td>
              <td className="spark-cell">
                <Chart
                  height={40}
                  label={`${g.name} sparkline`}
                  option={areaOption(
                    g.series,
                    'week',
                    (g.metric.deltaPct ?? 0) >= 0 ? '#39dca0' : '#ff687b',
                    true,
                  )}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function CategoryDetail({ id }: { id: string }) {
  const { data, range, size, safe, toggleWatch, watchlist, ask } = useApp(),
    game = data.games.find((g) => g.id === id);
  const [why, setWhy] = useState<WhyReport | null>(null),
    [tab, setTab] = useState('Overview');
  useEffect(() => {
    let active = true;
    void api<WhyReport>(`/api/games/${encodeURIComponent(id)}/why?range=${range}`)
      .then((r) => {
        if (active) setWhy(r);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id, range]);
  if (!game) return <Empty title="Category not found." />;
  const m = game.metric,
    contrib = why?.contributors.slice(0, 5) ?? [],
    other = m.deltaAbs - contrib.reduce((s, c) => s + c.change, 0);
  const waterfallRows = [
    { name: 'Previous', value: m.previous },
    ...contrib.map((c) => ({ name: c.name, value: c.change })),
    { name: 'Other channels', value: other },
    { name: 'Current', value: m.value },
  ];
  let cumulative = m.previous;
  const bases: number[] = [],
    changes: { value: number; itemStyle: { color: string } }[] = [];
  waterfallRows.forEach((r, i) => {
    if (i === 0 || i === waterfallRows.length - 1) {
      bases.push(0);
      changes.push({ value: r.value, itemStyle: { color: '#a970ff' } });
    } else {
      bases.push(r.value >= 0 ? cumulative : cumulative + r.value);
      changes.push({ value: Math.abs(r.value), itemStyle: { color: r.value >= 0 ? '#39dca0' : '#ff687b' } });
      cumulative += r.value;
    }
  });
  return (
    <>
      <Link className="back-link" to="/categories">
        <ArrowLeft size={15} /> All categories
      </Link>
      <div className="detail-heading">
        <Art kind={game.art} name={game.name} color={game.color} safe={safe} small />
        <div>
          <div className="inline gap">
            <span className="tag">{game.genre}</span>
            <Live sample={data.source === 'synthetic'} />
          </div>
          <h1>{game.name}</h1>
          <p>
            {metricText(m)} · Twitch {percent(data.platform.deltaPct)}
          </p>
        </div>
        <div className="detail-actions">
          <button className="button secondary" onClick={() => toggleWatch(game.id)}>
            <Star size={15} fill={watchlist.includes(game.id) ? 'currentColor' : 'none'} />
            {watchlist.includes(game.id) ? 'Watching' : 'Watch'}
          </button>
          <button
            className="button primary"
            onClick={() => ask(`Why did ${game.name} go ${m.deltaAbs >= 0 ? 'up' : 'down'} this ${range}?`)}
          >
            <Sparkles size={16} /> Deep dive
          </button>
        </div>
      </div>
      <div className="tabs">
        {['Overview', 'Why it moved', 'Opportunity'].map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab !== 'Opportunity' && (
        <>
          <div className="stat-grid">
            <Stat label="Average viewers" value={compact(m.value)} change={m.deltaPct} />
            <Stat label="Viewer change" value={absolute(m.deltaAbs)} note={m.label} />
            <Stat label="Hours watched" value={compact(game.hoursWatched)} note={`During this ${range}`} />
            <Stat
              label="Avg live channels"
              value={compact(game.channels)}
              note={`${percent(game.supplyMetric.deltaPct)} ${game.supplyMetric.label}`}
            />
          </div>
          <section className="panel">
            <SectionHead
              title="The audience over time"
              description={`${range === 'week' ? 'Hourly' : 'Six-hour'} average viewers · your local timezone`}
            />
            <Chart
              height={290}
              label={`${game.name} audience over time`}
              option={areaOption(game.series, range, m.deltaAbs >= 0 ? '#39dca0' : '#ff687b')}
              table={game.series.map((p) => ({ name: new Date(p.ts).toLocaleString(), value: p.value }))}
            />
          </section>
          <div className="two-columns section-space">
            <section className="panel">
              <SectionHead title="What’s behind the move?" />
              <div className="why-summary">
                <ShieldCheck size={22} />
                <div>
                  <h3>{why?.headline ?? 'Reading the comparison…'}</h3>
                  <p>{why?.summary}</p>
                </div>
              </div>
              <div className="driver-list">
                {why?.drivers.map((d, i) => (
                  <div key={i}>
                    <span className="driver-icon">
                      <TrendingUp size={17} />
                    </span>
                    <div>
                      <strong>{d.type.replaceAll('_', ' ')}</strong>
                      {d.evidence.map((e, j) => (
                        <p key={j}>
                          {e.label}: {typeof e.value === 'number' ? compact(e.value) : e.value}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {why?.decomposition && (
                <div className="decomposition">
                  <h4>Supply + demand = total change</h4>
                  <p>
                    Log change in hours streamed: <b>{why.decomposition.supply.toFixed(3)}</b>
                  </p>
                  <p>
                    Log change in viewers per streamed hour: <b>{why.decomposition.demand.toFixed(3)}</b>
                  </p>
                  <p>
                    Total log change: <b>{why.decomposition.total.toFixed(3)}</b>
                  </p>
                </div>
              )}
              <button className="text-link" onClick={() => ask(`Explain ${game.name}'s ${range} change`)}>
                Investigate with Ask Upswing <ArrowUpRight size={15} />
              </button>
            </section>
            <section className="panel">
              <SectionHead
                title="From then to now"
                description="An exact average-viewer bridge. Unattributed change stays explicit."
              />
              <Chart
                label="Waterfall from previous average viewers to current average viewers"
                height={290}
                table={waterfallRows}
                option={{
                  grid: { left: 55, right: 20, bottom: 70, top: 20 },
                  tooltip: { trigger: 'axis', confine: true },
                  xAxis: {
                    type: 'category',
                    data: waterfallRows.map((r) => r.name),
                    axisLabel: { rotate: 30, color: '#adadb8', fontSize: 10 },
                  },
                  yAxis: {
                    type: 'value',
                    axisLabel: { color: '#797989', formatter: (v: number) => compact(v) },
                    splitLine: { lineStyle: { color: '#79798922' } },
                  },
                  series: [
                    {
                      type: 'bar',
                      stack: 'total',
                      itemStyle: { color: 'transparent' },
                      emphasis: { disabled: true },
                      data: bases,
                      tooltip: { show: false },
                    },
                    { type: 'bar', stack: 'total', data: changes, barMaxWidth: 35 },
                  ],
                }}
              />
            </section>
          </div>
          <div className="two-columns section-space">
            <section className="panel">
              <SectionHead
                title="Clip buzz"
                description="Eight-week history of top-100 clip views. This is not viewer history."
              />
              <Chart
                label="Eight-week clip views"
                height={220}
                option={barOption(game.clipBuzz.map((v, i) => ({ name: `${8 - i} weeks ago`, value: v })))}
              />
            </section>
            <section className="panel">
              <SectionHead
                title="Channels behind the change"
                description="Average-viewer contributions from tracked streamers."
              />
              {contrib.length ? (
                <Chart
                  label="Channel contributions"
                  height={220}
                  option={barOption(
                    contrib.map((c) => ({ name: c.name, value: c.change })),
                    '#39dca0',
                  )}
                />
              ) : (
                <Empty title="More channel history needed." />
              )}
            </section>
          </div>
        </>
      )}
      {tab === 'Opportunity' && (
        <div className="two-columns">
          <section className="panel">
            <h2>For a {compact(size)}-viewer streamer</h2>
            <div className="opportunity-score">
              {game.opportunity}
              <span>/100</span>
            </div>
            <p>
              Estimated directory rank <b>#{game.rank}</b> · page {Math.ceil(game.rank / 20)}
            </p>
            <Breakdown game={game} />
            <p className="muted fine-print">
              Ranks are approximations from observed channel sizes. Twitch’s directory can be personalized.
            </p>
          </section>
          <OpportunityPanel />
        </div>
      )}
      <section className="panel section-space">
        <SectionHead
          title="When your audience is around"
          description={`Viewer demand per average channel · based on ${Math.round(data.daysTracked)} days · your local timezone`}
        />
        <BestTime game={game} />
      </section>
    </>
  );
}
function BestTime({ game }: { game: Game }) {
  const { range } = useApp(),
    [cells, setCells] = useState<{ day: number; hour: number; value: number }[]>([]);
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    void api<typeof cells>(`/api/besttime?game=${game.id}&range=${range}&tz=${encodeURIComponent(tz)}`)
      .then(setCells)
      .catch(() => setCells([]));
  }, [game.id, range]);
  return (
    <Chart
      label="Day of week and hour demand heatmap"
      height={230}
      table={cells.map((c) => ({
        name: `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][c.day]} ${c.hour}:00`,
        value: c.value,
      }))}
      option={{
        grid: { left: 45, right: 25, top: 10, bottom: 50 },
        tooltip: { confine: true },
        xAxis: {
          type: 'category',
          data: Array.from({ length: 24 }, (_, i) => `${i}:00`),
          axisLabel: { color: '#797989', interval: 2 },
          axisLine: { show: false },
          axisTick: { show: false },
        },
        yAxis: {
          type: 'category',
          data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          axisLabel: { color: '#adadb8' },
          axisLine: { show: false },
          axisTick: { show: false },
        },
        visualMap: {
          min: 0,
          max: Math.max(1, ...cells.map((c) => c.value)),
          show: false,
          inRange: { color: ['#211532', '#512787', '#9147ff', '#d3b3ff'] },
        },
        series: [
          {
            type: 'heatmap',
            data: cells.map((c) => [c.hour, c.day, c.value]),
            itemStyle: { borderWidth: 3, borderColor: '#18181b', borderRadius: 4 },
          },
        ],
      }}
    />
  );
}
export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-intro subpage-intro">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
function Stat({
  label,
  value,
  change,
  note,
}: {
  label: string;
  value: string;
  change?: number | null;
  note?: string;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {change !== undefined ? <Change value={change} subtle /> : <small>{note}</small>}
    </div>
  );
}
function Breakdown({ game }: { game: Game }) {
  return (
    <div className="breakdown">
      {game.breakdown.map((b) => (
        <div key={b.label}>
          <span>
            {b.label}
            <small>{Math.round(b.weight * 100)}% weight</small>
          </span>
          <div>
            <i style={{ width: `${b.value * 100}%` }} />
          </div>
          <b>{Math.round(b.value * 100)}</b>
        </div>
      ))}
    </div>
  );
}
export function Opportunity() {
  const { data, size, setSize } = useApp(),
    [genre, setGenre] = useState('All');
  const sorted = [...data.games]
    .filter((g) => g.opportunityReady)
    .filter((g) => genre === 'All' || g.genre === genre)
    .sort((a, b) => b.opportunity - a.opportunity);
  return (
    <>
      <PageHeading
        title="Your size is your superpower."
        description="Find categories where your stream can stand out, at the audience you have today."
      />
      <section className="audience-control panel">
        <div>
          <h3>Let’s make this about you.</h3>
          <p>How many viewers usually join your stream?</p>
        </div>
        <label>
          <Users size={18} />
          <input
            type="number"
            min="1"
            max="100000"
            aria-label="Typical viewers"
            value={size}
            onChange={(e) => setSize(Math.max(1, Math.min(100000, Number(e.target.value))))}
          />
          <span>viewers</span>
        </label>
        <select aria-label="Filter by genre" value={genre} onChange={(e) => setGenre(e.target.value)}>
          {['All', ...new Set(data.games.map((g) => g.genre))].map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </section>
      <div className="opportunity-cards">
        {sorted.map((g, i) => (
          <section className="panel opportunity-result" key={g.id}>
            <div className="inline gap">
              <span className="result-rank">#{i + 1}</span>
              <span className="tag">{g.genre}</span>
              <span className="score-pill">{g.opportunity}/100</span>
            </div>
            <Link to={`/categories/${g.id}`}>
              <h2>{g.name}</h2>
            </Link>
            <div className="inline gap">
              <Change value={g.metric.deltaPct} />
              <span className="muted">{compact(g.metric.value)} avg viewers</span>
            </div>
            <div className="estimated-position">
              <span>
                Your estimated rank<strong>#{g.rank}</strong>
              </span>
              <span>
                Directory page<strong>{Math.ceil(g.rank / 20)}</strong>
              </span>
            </div>
            <Breakdown game={g} />
            <Link className="text-link" to={`/categories/${g.id}`}>
              Explore category <ArrowUpRight size={15} />
            </Link>
          </section>
        ))}
      </div>
      <p className="fine-print muted">
        Percentile scores are relative to categories in this dataset. Directory ranks are approximate. Missing
        deep scans cannot establish real opportunity.
      </p>
    </>
  );
}
export function Streamers({ login }: { login?: string }) {
  const { data, range, ask } = useApp(),
    [tab, setTab] = useState('Rising'),
    [query, setQuery] = useState('');
  const streamer = data.streamers.find((s) => s.login === login);
  if (login && !streamer) return <Empty title="Streamer not found." />;
  if (streamer)
    return (
      <>
        <Link className="back-link" to="/streamers">
          <ArrowLeft size={15} /> Rising streamers
        </Link>
        <PageHeading
          title={streamer.name}
          description={`${compact(streamer.metric.value)} average viewers · ${metricText(streamer.metric)}`}
        >
          <button
            className="button primary"
            onClick={() => ask(`Analyze ${streamer.name}'s growth this ${range}`)}
          >
            <Sparkles size={15} /> Deep dive
          </button>
        </PageHeading>
        <div className="stat-grid">
          <Stat
            label="Average audience"
            value={compact(streamer.metric.value)}
            change={streamer.metric.deltaPct}
          />
          <Stat label="Peak audience" value={compact(streamer.peak)} />
          <Stat label="Sessions" value={String(streamer.sessions)} />
          <Stat label="Observed hours above baseline" value={`${Math.round(streamer.consistency * 100)}%`} />
        </div>
        <section className="panel">
          <SectionHead
            title="A little bigger, every stream"
            description={
              data.source === 'synthetic'
                ? 'Synthetic hourly audience fixture, not a real broadcaster.'
                : 'Covered stream hours only; gaps indicate missing observations.'
            }
          />
          <Chart
            label={`${streamer.name} audience over time`}
            height={330}
            option={areaOption(streamer.series, range)}
          />
        </section>
        <section className="panel section-space">
          <SectionHead
            title="Category fit"
            description="Average audience compared with this channel’s own baseline."
          />
          <Link to={`/categories/${streamer.gameId}`} className="text-link">
            {data.games.find((g) => g.id === streamer.gameId)?.name} <ArrowRight size={15} />
          </Link>
        </section>
      </>
    );
  const rows = data.streamers
    .filter(
      (s) =>
        s.name.toLowerCase().includes(query.toLowerCase()) &&
        (tab === 'Rising'
          ? s.metric.value >= 100 && s.metric.value < 1000
          : tab === 'New faces'
            ? s.ageDays < 180
            : true),
    )
    .sort((a, b) =>
      tab === 'Breakouts' ? b.breakout - a.breakout : (b.metric.deltaPct ?? 0) - (a.metric.deltaPct ?? 0),
    );
  return (
    <>
      <PageHeading
        title="Catch them on the way up."
        description="Meet the rising streamers building something worth watching."
      />
      <div className="toolbar">
        <div className="tabs">
          {['Rising', 'Breakouts', 'Growth', 'New faces'].map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        <input
          className="input"
          placeholder="Find a streamer"
          aria-label="Find a streamer"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="panel table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Streamer</th>
              <th>Category</th>
              <th>Avg audience</th>
              <th>Growth</th>
              <th>Breakout score</th>
              <th>This {range}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={s.id}>
                <td className="muted">{i + 1}</td>
                <td>
                  <Link className="table-streamer" to={`/streamers/${s.login}`}>
                    <span className="avatar" style={{ background: `${s.color}22`, color: s.color }}>
                      {s.name.slice(0, 2).toUpperCase()}
                    </span>
                    <strong>{s.name}</strong>
                  </Link>
                </td>
                <td>
                  <Link to={`/categories/${s.gameId}`}>
                    {data.games.find((g) => g.id === s.gameId)?.name}
                  </Link>
                </td>
                <td>{compact(s.metric.value)}</td>
                <td>
                  <Change value={s.metric.deltaPct} />
                  <small className="block muted">{absolute(s.metric.deltaAbs)}</small>
                </td>
                <td>{s.breakout.toFixed(2)}</td>
                <td className="spark-cell">
                  <Chart
                    height={45}
                    label={`${s.name} trend`}
                    option={areaOption(s.series, range, '#b88aff', true)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty />}
      </div>
    </>
  );
}
export function Keywords() {
  const { data, notify } = useApp(),
    [title, setTitle] = useState('First playthrough. Small victories, good company.'),
    [result, setResult] = useState<{ score: number; drafts: string[]; notes: string[] } | null>(null),
    [busy, setBusy] = useState(false);
  async function score() {
    setBusy(true);
    try {
      setResult(await api('/api/title-lab', { title, game: data.games[0]?.name ?? 'Tonight' }));
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="The words that bring people in."
        description="Discover title and tag patterns associated with stronger streams."
      />
      <div className="two-columns">
        <section className="panel">
          <SectionHead
            title="Winning title keywords"
            description="Within-channel lift · 15+ distinct channels · correlation, not causation"
          />
          <Chart
            label="Title keyword performance lift"
            height={350}
            table={data.keywords.map((k) => ({ name: k.word, value: k.lift }))}
            option={barOption(data.keywords.map((k) => ({ name: k.word, value: k.lift })))}
          />
        </section>
        <section className="panel title-lab">
          <div className="inline gap accent">
            <Sparkles size={22} />
            <h2>Title Lab</h2>
          </div>
          <p>Keep your voice. Make your next title clearer.</p>
          <label htmlFor="title-draft">Your next stream title</label>
          <textarea
            id="title-draft"
            maxLength={140}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="textarea-footer">
            <small>{title.length}/140</small>
            <button className="button primary" onClick={() => void score()} disabled={busy || !title.trim()}>
              <Sparkles size={15} />
              {busy ? 'Working…' : 'Explore title ideas'}
            </button>
          </div>
          {result && (
            <div className="title-results">
              <h3>
                Clarity score <span className="accent">{result.score}/100</span>
              </h3>
              {result.drafts.map((d, i) => (
                <button
                  key={i}
                  onClick={() => {
                    void navigator.clipboard.writeText(d).then(() => notify('Title copied.'));
                  }}
                >
                  <span>{d}</span>
                  <Copy size={15} />
                </button>
              ))}
              {result.notes.map((n) => (
                <p className="fine-print" key={n}>
                  {n}
                </p>
              ))}
              <Link to="/channel" className="text-link">
                Apply from My Channel <ArrowRight size={15} />
              </Link>
            </div>
          )}
        </section>
      </div>
      <section className="panel section-space table-scroll">
        <table>
          <thead>
            <tr>
              <th>Keyword or phrase</th>
              <th>Distinct channels</th>
              <th>Previous window</th>
              <th>Median lift</th>
              <th>Interquartile range</th>
            </tr>
          </thead>
          <tbody>
            {data.keywords.map((k) => (
              <tr key={k.word}>
                <td>
                  <span className="tag">{k.word}</span>
                </td>
                <td>{k.channels}</td>
                <td>{k.previousChannels || 'Needs more history'}</td>
                <td>{k.lift ? `${k.lift.toFixed(2)}×` : 'Not enough controls'}</td>
                <td>{k.lift ? k.iqr.map((v) => `${v.toFixed(2)}×`).join(' – ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
export function Ask({ initial, consume }: { initial: string; consume: () => void }) {
  const { data, range, notify } = useApp(),
    [prompt, setPrompt] = useState(''),
    [run, setRun] = useState<AnalystRun | null>(null),
    [busy, setBusy] = useState(false);
  async function submit(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true);
    setPrompt('');
    try {
      const r = await api<AnalystRun>('/api/codex/ask', { prompt: question, range });
      setRun(r);
      if (r.status === 'complete') setBusy(false);
    } catch (e) {
      notify((e as Error).message);
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!initial) return;
    const timer = setTimeout(() => {
      void submit(initial);
      consume();
    }, 0);
    return () => clearTimeout(timer);
  }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!run || run.status === 'complete' || run.status === 'failed') return;
    const stream = new EventSource(`/sse/codex/${run.id}`);
    stream.onmessage = (e) => {
      const next = JSON.parse(e.data) as AnalystRun;
      setRun(next);
      if (next.status === 'complete' || next.status === 'failed') {
        setBusy(false);
        stream.close();
      }
    };
    stream.onerror = () => {
      stream.close();
      setBusy(false);
      notify('The analysis stream disconnected. Submit again to retrieve the cached result.');
    };
    return () => stream.close();
  }, [run?.id, run?.status, notify]); // eslint-disable-line react-hooks/exhaustive-deps
  const suggestions = [
    'What is taking off this week?',
    'Where should a 50-viewer streamer play?',
    'Why is VALORANT down?',
    'Which horror categories are rising?',
  ];
  return (
    <div className="ask-page">
      <div className="ask-heading">
        <span className="ask-symbol">
          <Sparkles size={32} />
        </span>
        <span className="tag">Your in-house data analyst</span>
        <h1>
          A better question.
          <br />A smarter next stream.
        </h1>
        <p>
          Get from the numbers to your next move.
          <br />
          Ask about trends, categories, and where you fit in.
        </p>
      </div>
      <form
        className="ask-input"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(prompt);
        }}
      >
        <textarea
          aria-label="Ask Upswing a question"
          placeholder="What’s taking off, and what does it mean for me?"
          maxLength={1500}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit(prompt);
            }
          }}
        />
        <div>
          <span>
            <ShieldCheck size={14} /> Public data. Checked numbers.
          </span>
          <button className="button primary" disabled={busy || !prompt.trim()} type="submit">
            {busy ? 'Investigating…' : 'Ask Upswing'}
            <ArrowUpRight size={16} />
          </button>
        </div>
      </form>
      <div className="question-chips">
        {suggestions.map((q) => (
          <button key={q} onClick={() => void submit(q)} disabled={busy}>
            <Sparkles size={13} />
            {q}
          </button>
        ))}
      </div>
      {run && (
        <section className="analysis-result panel" aria-live="polite">
          <div className="user-question">
            <MessageSquare size={17} />
            {run.prompt}
          </div>
          <div className="analysis-steps">
            {run.events.map((event, i) => (
              <div key={i}>
                <Check size={13} />
                {event}
              </div>
            ))}
          </div>
          {run.output && (
            <>
              <div className="inline gap">
                <Logo small />
                <span className="tag">{run.source === 'rules' ? 'Rules analyst' : 'Codex analyst'}</span>
                {run.verifiedCount > 0 && (
                  <span className="verified">
                    <CheckCheck size={14} />
                    {run.verifiedCount} verified findings
                  </span>
                )}
              </div>
              <h2>{run.output.headline}</h2>
              <div className="answer-prose">
                {run.output.answerMarkdown.split('\n\n').map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
              {run.output.findings.map((f, i) => (
                <div key={i} className="finding">
                  <ShieldCheck size={18} />
                  <div>
                    <p>{f.claim}</p>
                    <details>
                      <summary>View evidence</summary>
                      <pre>{f.sql}</pre>
                      <pre>{JSON.stringify(f.numbers, null, 2)}</pre>
                    </details>
                  </div>
                </div>
              ))}
              {run.output.charts.map((c, i) => (
                <div key={i}>
                  <h3>{c.title}</h3>
                  <Chart label={c.title} height={240} option={barOption(c.data)} table={c.data} />
                </div>
              ))}
              <div className="caveats">
                {run.output.caveats.map((c, i) => (
                  <p key={i}>{c}</p>
                ))}
              </div>
              <div className="question-chips">
                {run.output.followUps.map((q) => (
                  <button key={q} onClick={() => void submit(q)} disabled={busy}>
                    {q}
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}
      <p className="ask-disclosure">
        {data.source === 'synthetic'
          ? 'You’re exploring synthetic sample data. Answers use the deterministic rules fallback.'
          : 'Live Codex requires a configured isolated runtime. A rules fallback is always available.'}
      </p>
    </div>
  );
}
export function Reports() {
  const { data, range, ask, notify } = useApp(),
    [reports, setReports] = useState<
      { id: string; date: number; source: string; output: { headline: string; answerMarkdown: string } }[]
    >([]);
  useEffect(() => {
    void api<typeof reports>(`/api/reports?range=${range}`)
      .then(setReports)
      .catch((e) => notify(e.message));
  }, [range, notify]);
  function download() {
    const report = reports[0];
    if (!report) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(
      new Blob(
        [
          `# The ${range} on Twitch\n\n${report.output.answerMarkdown}\n\nSource: ${data.source}; generated by rules.\n`,
        ],
        { type: 'text/markdown' },
      ),
    );
    a.download = `upswing-${range}-report.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <>
      <PageHeading
        title={`The ${range} on Twitch.`}
        description="The movements that mattered, and what they could mean for your next stream."
      >
        <button className="button secondary" onClick={download} disabled={!reports.length}>
          <Download size={16} /> Download report
        </button>
      </PageHeading>
      {reports.map((r) => (
        <section className="report-cover panel" key={r.id}>
          <div>
            <span className="tag">{range === 'week' ? 'Weekly' : 'Monthly'} field notes</span>
            <h2>
              A little perspective.
              <br />A lot of possibility.
            </h2>
            <p>
              {new Date(r.date).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}{' '}
              · Rules-generated · {data.source === 'synthetic' ? 'Sample edition' : 'Collected public data'}
            </p>
            <button className="button primary" onClick={() => ask(`Give me this ${range}'s trend report`)}>
              <Sparkles size={15} /> Discuss this report
            </button>
          </div>
          <div className="report-illustration">
            <TrendingUp size={145} strokeWidth={1} />
          </div>
        </section>
      ))}
      <div className="two-columns section-space">
        <section className="panel">
          <SectionHead title="The moves to know" />
          {reports[0]?.output.answerMarkdown.split('\n\n').map((p, i) => (
            <p key={i} className="report-paragraph">
              <span>{i + 1}</span>
              {p}
            </p>
          ))}
        </section>
        <section className="panel">
          <SectionHead title="A snapshot of the landscape" />
          <MarketMap />
        </section>
      </div>
    </>
  );
}
export function Alerts() {
  const { range, notify } = useApp(),
    [prompt, setPrompt] = useState('Alert me when Minecraft is above 50000 average viewers'),
    [compiled, setCompiled] = useState<{
      id: string;
      explanation: string;
      sql: string;
      hits: unknown[];
    } | null>(null),
    [alerts, setAlerts] = useState<{ id: string; name: string; approved: number }[]>([]),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  const load = () => {
    void api<typeof alerts>('/api/alerts')
      .then(setAlerts)
      .catch(() => {});
  };
  useEffect(load, []);
  async function compile() {
    setBusy(true);
    try {
      setCompiled(await api('/api/alerts/compile', { prompt, range }));
      load();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function approve() {
    if (!compiled) return;
    try {
      await api(`/api/alerts/${compiled.id}/approve`, { confirmed: true });
      notify('Alert approved. It will be evaluated hourly while the server is running.');
      setConfirm(false);
      setCompiled(null);
      load();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <>
      <PageHeading
        title="Catch the signal. Skip the noise."
        description="Set an alert in your own words. Review the rule before it goes live."
      />
      <section className="panel alert-composer">
        <h2>What should we keep an eye on?</h2>
        <p className="muted">
          The rules fallback supports category audience thresholds. Backtests show matching recorded hours.
        </p>
        <div className="inline gap">
          <input
            className="input"
            aria-label="Describe an alert"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={500}
          />
          <button className="button primary" disabled={busy} onClick={() => void compile()}>
            <Sparkles size={16} />
            {busy ? 'Backtesting…' : 'Build & backtest'}
          </button>
        </div>
        {compiled && (
          <div className="backtest">
            <span className="verified">
              <ShieldCheck size={16} /> Read-only query checked
            </span>
            <h3>{compiled.explanation}</h3>
            <details>
              <summary>View the exact rule</summary>
              <pre>{compiled.sql}</pre>
            </details>
            <button className="button primary" onClick={() => setConfirm(true)}>
              Review and approve <ArrowRight size={15} />
            </button>
          </div>
        )}
      </section>
      <SectionHead
        title="Your alerts"
        description="Approved rules run hourly. Chat notifications are not enabled."
      />
      {alerts.length ? (
        <div className="alert-list">
          {alerts.map((a) => (
            <section className="panel" key={a.id}>
              <span className={`status-dot ${a.approved ? 'on' : ''}`} />
              <div>
                <h3>{a.name}</h3>
                <p>{a.approved ? 'Active · checks hourly' : 'Draft · not active'}</p>
              </div>
              <span className="tag">{a.approved ? 'Approved' : 'Needs review'}</span>
            </section>
          ))}
        </div>
      ) : (
        <Empty title="Your next signal starts here.">
          Build and approve an alert to add it to your inbox.
        </Empty>
      )}
      {confirm && compiled && (
        <Modal title="Approve this alert?" close={() => setConfirm(false)}>
          <p>{compiled.explanation}</p>
          <pre>{compiled.sql}</pre>
          <p>Only public analytics are queried. This does not send messages to Twitch.</p>
          <button className="button primary" onClick={() => void approve()}>
            Approve hourly alert
          </button>
        </Modal>
      )}
    </>
  );
}
export function Channel() {
  const { data, range, size, connect, notify } = useApp(),
    [account, setAccount] = useState<{
      id: string;
      name: string;
      login: string;
      scopes: string[];
      botEnabled: boolean;
    } | null>(null),
    [title, setTitle] = useState('A little adventure, a lot of good company'),
    [before, setBefore] = useState<{ title: string; game_id: string; game_name: string } | null>(null),
    [game, setGame] = useState(data.games[0]?.id ?? ''),
    [confirm, setConfirm] = useState<'channel' | 'bot' | 'raid' | null>(null),
    [target, setTarget] = useState(''),
    [messages, setMessages] = useState<{ author: string; text: string }[]>([
      {
        author: 'Upswing',
        text: 'Welcome to the mock chat. Try !trending or !why Minecraft. Messages stay here.',
      },
    ]),
    [message, setMessage] = useState('!trending'),
    [plan, setPlan] = useState<{
      categories: { id: string; name: string; score: number; reason: string }[];
    } | null>(null);
  useEffect(() => {
    void api<{ account: typeof account }>('/api/me').then((r) => setAccount(r.account));
  }, []);
  async function send() {
    if (!message.trim()) return;
    const text = message;
    setMessage('');
    setMessages((m) => [...m, { author: 'You', text }]);
    try {
      const r = await api<{ reply: string }>('/api/mock-chat', { message: text, range });
      if (r.reply) setMessages((m) => [...m, { author: 'Upswing', text: r.reply }]);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function apply() {
    try {
      await api(
        confirm === 'channel' ? '/api/me/channel' : confirm === 'raid' ? '/api/me/raid' : '/api/me/bot',
        confirm === 'channel'
          ? { title, game_id: game, confirmed: true }
          : confirm === 'raid'
            ? { targetId: target, confirmed: true }
            : { enabled: !account?.botEnabled, confirmed: true },
      );
      notify('Twitch action completed.');
      setConfirm(null);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  const raids = data.streamers
    .filter((s) => s.live && s.metric.value >= size * 0.2 && s.metric.value <= size)
    .slice(0, 5);
  return (
    <>
      <PageHeading
        title={account ? `Your next chapter, ${account.name}.` : 'Make your next stream a step up.'}
        description="Your category, your community, your next move."
      />
      {!account && (
        <div className="connect-banner">
          <span className="connect-icon">
            <Users size={24} />
          </span>
          <div>
            <h3>Your channel belongs here.</h3>
            <p>Connect Twitch to apply titles, enable your bot, and raid from your own channel.</p>
          </div>
          <button className="button primary" onClick={connect}>
            Connect Twitch <ArrowUpRight size={15} />
          </button>
        </div>
      )}
      <div className="two-columns section-space">
        <section className="panel">
          <SectionHead
            title="Set the stage"
            description="Preview a category and title before applying them to Twitch."
          />
          <label htmlFor="channel-title">Stream title</label>
          <input
            id="channel-title"
            className="input"
            maxLength={140}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label htmlFor="channel-category">Category</label>
          <select id="channel-category" value={game} onChange={(e) => setGame(e.target.value)}>
            {data.games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <div className="inline gap section-space">
            <Link to="/keywords" className="button secondary">
              <Sparkles size={15} /> Open Title Lab
            </Link>
            <button
              className="button primary"
              onClick={() => {
                if (!account) connect();
                else
                  void api<typeof before>('/api/me/channel')
                    .then((r) => {
                      setBefore(r);
                      setConfirm('channel');
                    })
                    .catch((e) => notify(e.message));
              }}
            >
              Review channel changes <ArrowRight size={15} />
            </button>
          </div>
          {account && !account.scopes.includes('channel:manage:broadcast') && (
            <a className="text-link block section-space" href="/auth/twitch/login?feature=broadcast">
              Authorize channel editing <ExternalLink size={14} />
            </a>
          )}
        </section>
        <OpportunityPanel />
      </div>
      <div className="two-columns section-space">
        <section className="panel mock-chat">
          <SectionHead
            title="Meet your chat’s new sidekick"
            description="Mock chat · no messages are sent to Twitch"
          >
            <span className="tag">Local preview</span>
          </SectionHead>
          <div className="chat-messages" aria-live="polite">
            {messages.map((m, i) => (
              <p key={i}>
                <strong className={m.author === 'You' ? '' : 'accent'}>{m.author}</strong> {m.text}
              </p>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              className="input"
              aria-label="Mock Twitch chat message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
            />
            <button className="button primary" aria-label="Send mock chat message">
              <Send size={16} />
            </button>
          </form>
          <div className="chat-command-chips">
            {['!trending', '!why Minecraft', '!rising', '!report'].map((c) => (
              <button className="tag" key={c} onClick={() => setMessage(c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="inline gap section-space">
            <button className="button secondary" onClick={() => (account ? setConfirm('bot') : connect())}>
              {account?.botEnabled ? 'Disable' : 'Enable'} live chat bot
            </button>
            {account && (
              <a className="text-link" href="/auth/twitch/login?feature=bot">
                Authorize chat
              </a>
            )}
          </div>
        </section>
        <section className="panel">
          <SectionHead
            title="Bring the pulse to your stream"
            description="Add an Upswing browser source to OBS. Transparent background, live updates."
          />
          <div className="overlay-preview">
            <span className="pulse-dot" />
            <Logo small />
            <span>Minecraft</span>
            <Change value={data.games.find((g) => g.name === 'Minecraft')?.metric.deltaPct ?? null} />
          </div>
          {['ticker', 'momentum', 'card', 'alert'].map((widget) => (
            <div className="overlay-row" key={widget}>
              <div>
                <strong>{widget[0].toUpperCase() + widget.slice(1)}</strong>
                <span>Browser source · {data.source === 'synthetic' ? 'sample' : 'live'}</span>
              </div>
              <button
                className="icon-button"
                aria-label={`Copy ${widget} overlay URL`}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(
                      `${location.origin}/overlay/${account?.login ?? 'sample'}?widget=${widget}&theme=dark&scale=1`,
                    )
                    .then(() => notify('Overlay URL copied. Add it as an OBS Browser Source.'));
                }}
              >
                <Copy size={16} />
              </button>
              <a
                className="icon-button"
                aria-label={`Preview ${widget} overlay`}
                target="_blank"
                rel="noreferrer"
                href={`/overlay/${account?.login ?? 'sample'}?widget=${widget}`}
              >
                <ExternalLink size={15} />
              </a>
            </div>
          ))}
        </section>
      </div>
      <div className="two-columns section-space">
        <section className="panel">
          <SectionHead
            title="Your next-week shortlist"
            description="A rules-based starting point. Review the category and timing before committing."
          />
          <button
            className="button primary"
            onClick={() => {
              void api<typeof plan>('/api/me/plan', { range, size })
                .then(setPlan)
                .catch((e) => notify(e.message));
            }}
          >
            <Sparkles size={15} /> Build my growth shortlist
          </button>
          {plan?.categories.map((p) => (
            <div className="plan-row" key={p.id}>
              <Link to={`/categories/${p.id}`}>
                <h3>
                  {p.name} <span className="accent">{p.score}/100</span>
                </h3>
              </Link>
              <p>{p.reason}</p>
            </div>
          ))}
        </section>
        <section className="panel">
          <SectionHead
            title="Keep the good energy going"
            description="Raid candidates between 0.2× and 1× your audience size. Preview only in demo."
          />
          {raids.length ? (
            raids.map((s) => (
              <div className="overlay-row" key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  <span>{compact(s.metric.value)} average viewers</span>
                </div>
                <button
                  className="button secondary"
                  onClick={() => {
                    if (!account) connect();
                    else {
                      setTarget(s.id);
                      setConfirm('raid');
                    }
                  }}
                >
                  Review raid
                </button>
              </div>
            ))
          ) : (
            <p className="muted">
              No supported live candidates at {size} viewers yet. Try another size on Opportunity.
            </p>
          )}
          {account && (
            <a href="/auth/twitch/login?feature=raid" className="text-link">
              Authorize raids <ExternalLink size={14} />
            </a>
          )}
        </section>
      </div>
      {confirm && (
        <Modal
          title={
            confirm === 'channel'
              ? 'Apply these channel changes?'
              : confirm === 'raid'
                ? 'Start this raid?'
                : 'Change live chat bot settings?'
          }
          close={() => setConfirm(null)}
        >
          <p>
            This affects only the authenticated channel <strong>{account?.name}</strong>.
          </p>
          {confirm === 'channel' ? (
            <dl className="diff">
              <dt>Current title</dt>
              <dd>{before?.title ?? 'Not available'}</dd>
              <dt>New title</dt>
              <dd>{title}</dd>
              <dt>New category</dt>
              <dd>{data.games.find((g) => g.id === game)?.name}</dd>
              <dt>Current category</dt>
              <dd>{before?.game_name ?? 'Not available'}</dd>
              <dt>Tags</dt>
              <dd>Unchanged</dd>
            </dl>
          ) : (
            <p>
              {confirm === 'raid'
                ? `Raid target ID: ${target}. Your audience will be sent to this channel.`
                : account?.botEnabled
                  ? 'The bot will stop sending replies.'
                  : 'The bot will read commands and send replies in your own chat.'}
            </p>
          )}
          <button className="button primary" onClick={() => void apply()}>
            Confirm {confirm === 'channel' ? 'channel changes' : confirm === 'raid' ? 'raid' : 'bot change'}
          </button>
        </Modal>
      )}
    </>
  );
}
export function About() {
  const { data, notify } = useApp(),
    [health, setHealth] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    void api<Record<string, unknown>>('/admin/health')
      .then(setHealth)
      .catch((e) => notify(e.message));
  }, [notify]);
  return (
    <>
      <PageHeading
        title="Good insights start with honest data."
        description="What we observe, how we calculate it, and where the limits are."
      />
      <div className="two-columns">
        <section className="panel prose">
          <h2>What you’re looking at</h2>
          <p>
            {data.source === 'synthetic'
              ? 'This is a synthetic sample dataset generated deterministically for demonstration. Category names are recognizable, but audience numbers, channel names, release dates and keyword relationships are fictional fixtures.'
              : 'This instance collects currently live streams through the official Twitch Helix API. Coverage begins when the collector starts; smaller streams below the configured floor can be omitted.'}
          </p>
          <h3>Week and Month, always</h3>
          <p>
            Week compares the last 7 days to the previous 7. Month compares the last 30 to the previous 30.
            Covered hourly means prevent frequently polled hours from getting extra weight. Full comparisons
            need at least 90% coverage.
          </p>
          <h3>When history is thin</h3>
          <p>
            Week uses the latest complete day and the earliest comparable complete day. Month uses the last
            and first complete tracked weeks. Without enough separate blocks, the app says it needs more
            history.
          </p>
          <h3>Clip buzz is a different signal</h3>
          <p>
            The top 100 clips per category per week provide an eight-week sampled clip view history. They do
            not represent past concurrent viewers.
          </p>
          <h3>Opportunity at your size</h3>
          <p>
            Scores combine estimated directory rank (35%), relative growth (25%), audience for smaller
            channels (25%), and lower top-five concentration (15%). Directory positions are estimates, and
            results are relative to observed categories.
          </p>
        </section>
        <section className="panel prose">
          <h2>Evidence before explanation</h2>
          <p>
            Supply and demand use an exact logarithmic decomposition. A channel contribution chart shows
            measured changes and leaves the remainder unattributed. Rules name a driver only when supported by
            the available data. Personal reasons are never inferred.
          </p>
          <h3>Ask Upswing</h3>
          <p>
            The keyless experience uses deterministic rules. An explicitly configured Linux isolated
            deployment can run the Codex SDK with a read-only public snapshot, network-disabled tools, a
            scrubbed environment, a deadline, and independent SQL number checks. Unchecked model narrative and
            charts are discarded.
          </p>
          <h3>Your channel, your choice</h3>
          <p>
            OAuth tokens are encrypted with AES-256-GCM. Twitch write features request their own scopes, act
            only on the authenticated broadcaster’s channel, and require a confirmation. Mock chat stays local
            to this app.
          </p>
          <h3>Opt out</h3>
          <p>
            Connected broadcasters can exclude their own channel from named analytics and future collection.
            Aggregate historical category totals are retained without identifying the broadcaster.
          </p>
          <button
            className="button secondary"
            onClick={() => {
              if (!window.confirm('Exclude your connected channel from analytics and future collection?'))
                return;
              void api('/api/me/opt-out', { confirmed: true })
                .then(() => notify('Your channel has been excluded.'))
                .catch((e) => notify(e.message));
            }}
          >
            Exclude my connected channel
          </button>
          <p>
            <a
              className="text-link"
              href="https://dev.twitch.tv/docs/api/reference/"
              target="_blank"
              rel="noreferrer"
            >
              Official Twitch API reference <ExternalLink size={13} />
            </a>
          </p>
        </section>
      </div>
      <section className="panel section-space">
        <SectionHead
          title="Collection health"
          description="Current instance. No API keys or tokens are included."
        />
        <pre>{JSON.stringify(health, null, 2)}</pre>
      </section>
    </>
  );
}
export function Styleguide() {
  return (
    <>
      <PageHeading
        title="Made for the stream."
        description="Upswing’s independent component kit, grounded in Twitch’s public design tokens."
      />
      <section className="panel">
        <Logo />
        <div className="style-swatches">
          {['--bg', '--panel', '--elevated', '--accent', '--text', '--muted', '--green', '--red'].map((v) => (
            <div key={v}>
              <span style={{ background: `var(${v})` }} />
              <code>{v}</code>
            </div>
          ))}
        </div>
        <p className="display-type">Find your next move.</p>
        <h2>A community worth finding.</h2>
        <p className="muted">A readable, dense interface. Inter. Tabular numbers. Your data, in context.</p>
        <div className="inline gap component-examples">
          <button className="button primary">Primary action</button>
          <button className="button secondary">Secondary action</button>
          <Change value={0.387} />
          <Change value={-0.184} />
          <Live sample />
          <span className="tag">Horror</span>
        </div>
      </section>
    </>
  );
}
