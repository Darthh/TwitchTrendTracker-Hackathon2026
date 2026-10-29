import { ArrowRight, ArrowUpRight, Compass, Sparkles, Users, Radio, CalendarDays } from 'lucide-react';
import { useApp } from './context';
import { CategoryTile, Change, Empty, Link, OpportunityPanel, SectionHead, TrendCard } from './components';
import { Chart } from './Chart';
import { compact, percent } from './lib';
export function Pulse({ filter }: { filter: string }) {
  const { data, range, ask, watchlist } = useApp();
  const rising = [...data.games]
    .filter((g) => (g.metric.deltaPct ?? 0) > 0)
    .sort((a, b) => (b.metric.relDeltaPct ?? 0) - (a.metric.relDeltaPct ?? 0));
  const falling = [...data.games]
    .filter((g) => (g.metric.deltaPct ?? 0) < 0)
    .sort((a, b) => (a.metric.deltaPct ?? 0) - (b.metric.deltaPct ?? 0));
  const streamers = data.streamers.filter((s) => s.metric.value >= 100 && s.metric.value < 1000).slice(0, 4);
  const spotlight = rising[0],
    fallSpot = falling[0];
  const selected =
    filter === 'Following'
      ? data.games.filter((g) => watchlist.includes(g.id))
      : filter === 'Rising'
        ? rising
        : filter === 'Falling'
          ? falling
          : filter === 'New & taking off'
            ? data.games.filter((g) => (g.ageDays ?? 999) < 45)
            : data.games;
  return (
    <>
      <div className="page-intro">
        <div>
          <div className="intro-kicker">
            <span className="pulse-dot" />
            Your radar for what’s next
          </div>
          <h1>
            The pulse of Twitch<span>.</span>
          </h1>
          <p>See what’s taking off. Understand why. Find your next move.</p>
        </div>
        <button className="button secondary ask-top" onClick={() => ask('What is taking off this week?')}>
          <Sparkles size={16} /> Ask Upswing <ArrowUpRight size={15} />
        </button>
      </div>
      <div className="overview-strip">
        <div>
          <Users size={18} />
          <span>
            Average viewers
            <strong>
              {compact(data.platform.value, 2)}
              <Change value={data.platform.deltaPct} subtle />
            </strong>
          </span>
        </div>
        <div>
          <Radio size={18} />
          <span>
            Channels tracked
            <strong>
              {compact(
                data.games.reduce((s, g) => s + g.channels, 0),
                1,
              )}
            </strong>
          </span>
        </div>
        <div>
          <CalendarDays size={18} />
          <span>
            Days of history
            <strong>
              {data.daysTracked.toFixed(0)}
              <small>{data.source === 'synthetic' ? 'sample dataset' : 'since first poll'}</small>
            </strong>
          </span>
        </div>
        <Link className="overview-cta" to="/opportunity">
          <Compass size={19} />
          <span>
            A better category for your size<small>Find where you should stream</small>
          </span>
          <ArrowRight size={16} />
        </Link>
      </div>
      {data.games.length === 0 ? (
        <Empty />
      ) : (
        <>
          <div className="section-head trend-head">
            <div>
              <h2>{filter === 'For you' ? `Making moves this ${range}` : filter}</h2>
              <p>The signals worth paying attention to.</p>
            </div>
            <span className="comparison-note">
              {range === 'week' ? 'Last 7 days vs previous 7 days' : 'Last 30 days vs previous 30 days'}
            </span>
          </div>
          <div className="trend-grid">
            <TrendCard
              title="On the rise"
              tag="Gaining momentum"
              points={spotlight?.series ?? []}
              metric={spotlight?.metric}
              subtitle={
                spotlight
                  ? `${spotlight.name} leads at ${percent(spotlight.metric.deltaPct)}`
                  : 'Waiting for a supported comparison'
              }
              games={rising.slice(0, 4)}
            />
            <TrendCard
              title="Losing ground"
              tag="The other side of the trend"
              points={fallSpot?.series ?? []}
              metric={fallSpot?.metric}
              subtitle={
                fallSpot ? `${fallSpot.name} cools off this ${range}` : 'No supported declines this window'
              }
              color="#ff687b"
              games={falling.slice(0, 4)}
            />
            <TrendCard
              title="Small. On the up."
              tag="Tomorrow’s familiar faces"
              subtitle="Rising streamers · 100–999 average viewers"
              points={streamers[0]?.series ?? []}
              color="#b88aff"
            >
              {streamers.map((s, i) => (
                <Link key={s.id} to={`/streamers/${s.login}`} className="rank-row">
                  <span className="avatar" style={{ background: `${s.color}22`, color: s.color }}>
                    {s.name.slice(0, 2).toUpperCase()}
                    <span className="avatar-dot" />
                  </span>
                  <div className="rank-name">
                    <strong>{s.name}</strong>
                    <span>
                      <Change value={s.metric.deltaPct} />
                      <small>{data.games.find((g) => g.id === s.gameId)?.name}</small>
                    </span>
                  </div>
                  <b className="rank-value">
                    {compact(s.metric.value)}
                    <small>#{i + 1} rising</small>
                  </b>
                </Link>
              ))}
            </TrendCard>
          </div>
          <div className="map-opportunity">
            <section className="panel market-panel">
              <SectionHead title="The bigger picture" description="Every category. One market map.">
                <Link to="/categories" className="text-link">
                  Explore categories <ArrowUpRight size={14} />
                </Link>
              </SectionHead>
              <div className="map-legend">
                <span>Size = avg viewers</span>
                <div>
                  <span className="negative">↓ Falling</span>
                  <i />
                  <span className="positive">Rising ↑</span>
                </div>
                <span>Color = relative growth</span>
              </div>
              <MarketMap />
              <p className="chart-caption">
                Growth relative to sampled Twitch overall · click a category to explore
              </p>
            </section>
            <OpportunityPanel />
          </div>
          <SectionHead
            title={filter === 'New & taking off' ? 'New and taking off' : 'Explore your next category'}
            description="Big worlds. New communities. A place for your stream."
          >
            <Link to="/categories" className="text-link">
              Browse all <ArrowRight size={15} />
            </Link>
          </SectionHead>
          <div className="category-grid pulse-categories">
            {selected.slice(0, 6).map((g) => (
              <CategoryTile key={g.id} game={g} />
            ))}
          </div>
          <section className="analyst-banner">
            <div className="analyst-orbit">
              <Sparkles size={24} />
            </div>
            <div>
              <h2>The numbers tell a story. Ask for it.</h2>
              <p>Go from “what happened?” to “what’s my next move?” with Ask Upswing.</p>
            </div>
            <button className="button primary" onClick={() => ask('Why is VALORANT down?')}>
              Meet your analyst <ArrowRight size={16} />
            </button>
          </section>
        </>
      )}
    </>
  );
}
export function MarketMap() {
  const { data, navigate } = useApp();
  const rows = data.games.map((g) => ({
    name: g.name,
    value: Math.round(g.metric.value),
    id: g.id,
    change: percent(g.metric.relDeltaPct),
    itemStyle: {
      color:
        (g.metric.relDeltaPct ?? 0) >= 0
          ? `hsl(158, ${35 + Math.min(35, Math.abs(g.metric.relDeltaPct ?? 0) * 50)}%, ${19 + Math.min(9, Math.abs(g.metric.relDeltaPct ?? 0) * 10)}%)`
          : `hsl(346, 38%, ${22 + Math.min(9, Math.abs(g.metric.relDeltaPct ?? 0) * 10)}%)`,
    },
  }));
  return (
    <Chart
      height={335}
      label="Category market map: area represents average viewers, color represents growth relative to Twitch"
      table={rows.map((r) => ({ name: r.name, value: r.value }))}
      onClick={(name) => {
        const g = data.games.find((g) => g.name === name);
        if (g) navigate(`/categories/${g.id}`);
      }}
      option={{
        tooltip: {
          confine: true,
          formatter: (p: unknown) => {
            const r = (p as { data: (typeof rows)[0] }).data;
            const node = document.createElement('div');
            node.textContent = `${r.name}: ${compact(r.value)} viewers (${r.change})`;
            return node;
          },
        },
        series: [
          {
            type: 'treemap',
            roam: false,
            nodeClick: false,
            breadcrumb: { show: false },
            top: 4,
            bottom: 4,
            left: 0,
            right: 0,
            data: rows,
            label: {
              show: true,
              color: '#fff',
              fontFamily: 'Inter',
              fontSize: 13,
              fontWeight: 600,
              formatter: (p: unknown) => {
                const r = (p as { data: (typeof rows)[0] }).data;
                return `${r.name}\n\n${compact(r.value)}   ${r.change}`;
              },
            },
            itemStyle: { borderColor: '#18181b', borderWidth: 3, gapWidth: 3 },
            emphasis: { itemStyle: { borderColor: '#bf94ff' } },
            upperLabel: { show: false },
          },
        ],
      }}
    />
  );
}
