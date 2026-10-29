import type { Dashboard } from '../shared/types.js';
import { explain } from '../why/index.js';
import { rulesAnswer } from '../codex/runtime.js';
export class Bot {
  private last = -Infinity;
  private users = new Map<string, number>();
  private lastAsk = -Infinity;
  constructor(private now = () => Date.now()) {}
  reply(
    message: string,
    user: string,
    moderator: boolean,
    data: Dashboard,
    broadcasterId?: string,
  ): string | null {
    const [command, ...rest] = message.trim().split(/\s+/);
    if (!['!trending', '!why', '!momentum', '!rising', '!report', '!ask', '!upswing'].includes(command))
      return null;
    const now = this.now();
    if (now - this.last < 30_000 || now - (this.users.get(user) ?? -Infinity) < 10_000)
      return 'Upswing is cooling down. Try again in 30 seconds.';
    this.last = now;
    this.users.set(user, now);
    if (this.users.size > 10000) this.users.clear();
    const top = [...data.games]
      .filter((g) => g.metric.deltaPct !== null)
      .sort((a, b) => (b.metric.relDeltaPct ?? 0) - (a.metric.relDeltaPct ?? 0));
    const prefix = data.source === 'synthetic' ? '[Sample] ' : '';
    let reply: string;
    switch (command) {
      case '!trending':
        reply =
          top
            .slice(0, 3)
            .map((g) => `${g.name} ${((g.metric.deltaPct ?? 0) * 100).toFixed(1)}%`)
            .join(' · ') || 'More history is needed.';
        break;
      case '!why': {
        const game = data.games.find((g) => g.name.toLowerCase().includes(rest.join(' ').toLowerCase()));
        reply = game ? explain(game, data).summary : 'Try !why Minecraft';
        break;
      }
      case '!rising':
        reply =
          data.streamers
            .filter((s) => s.metric.value >= 100 && s.metric.value < 1000)
            .slice(0, 3)
            .map((s) => `${s.name}: ${Math.round(s.metric.value)} avg`)
            .join(' · ') || 'No supported rising channels yet.';
        break;
      case '!momentum':
        {
          const own = data.streamers.find((s) => s.id === broadcasterId || s.login === broadcasterId);
          const current = own?.latestViewers ?? own?.series.at(-1)?.value;
          reply =
            own && current !== undefined
              ? `${Math.round(current)} viewers now vs ${Math.round(own.metric.value)} covered ${data.range} average.`
              : 'Connect your channel and collect covered audience history to see momentum.';
        }
        break;
      case '!report':
        reply = `The ${data.range} on Twitch: ${top[0]?.name ?? 'collecting history'} leads the supported relative rankings. Open /reports.`;
        break;
      case '!ask':
        if (!moderator) reply = '!ask is for the broadcaster and moderators.';
        else if (now - this.lastAsk < 60_000) reply = '!ask has a 60-second cooldown.';
        else {
          this.lastAsk = now;
          reply = rest.length
            ? `[Rules] ${rulesAnswer(rest.join(' '), data).answerMarkdown.split('\n\n')[0]}`
            : 'Try !ask Which horror categories are rising?';
        }
        break;
      default:
        reply = '!trending · !why <category> · !rising · !momentum · !report · !ask <question>';
    }
    return `${prefix}${reply}`.slice(0, command === '!ask' ? 400 : 500);
  }
}
