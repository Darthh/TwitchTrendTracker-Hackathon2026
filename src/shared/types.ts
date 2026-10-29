export type Range = 'week' | 'month';
export interface Point {
  ts: number;
  value: number;
  coverage: number;
}
export interface Metric {
  value: number;
  previous: number;
  deltaAbs: number;
  deltaPct: number | null;
  relDeltaPct: number | null;
  comparison: 'full' | 'partial';
  coverage: number;
  n: number;
  confidence: 'high' | 'medium' | 'low';
  insufficientData: boolean;
  label: string;
}
export interface Game {
  id: string;
  name: string;
  genre: string;
  color: string;
  art: string;
  boxArtUrl?: string | null;
  ageDays: number | null;
  metric: Metric;
  supplyMetric: Metric;
  series: Point[];
  channels: number;
  tailVPC: number;
  top5Share: number;
  hoursWatched: number;
  hoursStreamed: number;
  clipBuzz: number[];
  viewers: number[];
  opportunity: number;
  opportunityReady: boolean;
  rank: number;
  breakdown: { label: string; value: number; weight: number }[];
}
export interface Streamer {
  id: string;
  login: string;
  name: string;
  gameId: string;
  language: string;
  color: string;
  metric: Metric;
  series: Point[];
  peak: number;
  sessions: number;
  consistency: number;
  breakout: number;
  ageDays: number;
  live: boolean;
  latestViewers?: number;
}
export interface Keyword {
  word: string;
  channels: number;
  previousChannels: number;
  lift: number;
  iqr: [number, number];
  series: number[];
}
export type TermKind = 'keyword' | 'tag';
export interface TermTrend {
  term: string;
  channels: number;
  previousChannels: number;
  deltaPct: number | null;
  points: Point[];
  categories: { gameId: string; channels: number }[];
}
export interface TermOverview {
  kind: TermKind;
  range: Range;
  source: 'synthetic' | 'live';
  terms: TermTrend[];
  coverage: number;
  truncated: boolean;
  basis: string;
}
export interface Dashboard {
  range: Range;
  source: 'synthetic' | 'live';
  now: number;
  start: number;
  daysTracked: number;
  platform: Metric;
  platformSeries: Point[];
  games: Game[];
  streamers: Streamer[];
  keywords: Keyword[];
  polls: number;
  latestPoll: number | null;
  coverage: number;
  replay: boolean;
}
export interface WhyReport {
  gameId: string;
  range: Range;
  direction: 'up' | 'down' | 'flat';
  headline: string;
  summary: string;
  drivers: { type: string; evidence: { label: string; value: number | string }[] }[];
  decomposition: { supply: number; demand: number; total: number } | null;
  contributors: { name: string; previous: number; current: number; change: number; kind: string }[];
  flows: { source: string; target: string; value: number }[];
  confidence: string;
  generatedBy: 'rules' | 'codex';
  verified: boolean;
}
export interface Finding {
  claim: string;
  sql: string;
  numbers: Record<string, number>;
  confidence: string;
}
export interface Analysis {
  headline: string;
  answerMarkdown: string;
  findings: Finding[];
  charts: { type: 'bar' | 'line' | 'area'; title: string; data: { name: string; value: number }[] }[];
  caveats: string[];
  followUps: string[];
}
export interface AnalystRun {
  id: string;
  prompt: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  source: 'rules' | 'codex' | 'cached-codex';
  events: string[];
  output: Analysis | null;
  verifiedCount: number;
  failedCount: number;
  createdAt: number;
}
