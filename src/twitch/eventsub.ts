import { z } from 'zod';
import type { Account } from '../server/auth.js';
import { userToken } from '../server/auth.js';
import type { DB } from '../db/db.js';
import type { Dashboard } from '../shared/types.js';
import { randomUUID } from 'node:crypto';
import { helix } from './helix.js';
import { Bot } from './bot.js';
const envelope = z.object({
  metadata: z.object({ message_id: z.string(), message_type: z.string() }),
  payload: z.record(z.string(), z.unknown()),
});
const chat = z.object({
  broadcaster_user_id: z.string(),
  chatter_user_id: z.string(),
  message: z.object({ text: z.string() }),
  badges: z.array(z.object({ set_id: z.string() })).default([]),
});
export class EventSub {
  private sockets = new Map<string, () => void>();
  constructor(
    private db: DB,
    private data: () => Dashboard,
  ) {}
  stop(id: string) {
    this.sockets.get(id)?.();
    this.sockets.delete(id);
  }
  start(account: Account) {
    this.stop(account.id);
    let stopped = false,
      socket: WebSocket | undefined,
      timer: ReturnType<typeof setTimeout> | undefined,
      retry = 1000;
    const seen = new Set<string>(),
      bot = new Bot();
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const connect = (url = 'wss://eventsub.wss.twitch.tv/ws', inherited = false) => {
      if (stopped) return;
      const parsed = new URL(url);
      if (parsed.protocol !== 'wss:' || parsed.hostname !== 'eventsub.wss.twitch.tv') return;
      const ws = new WebSocket(url);
      socket = ws;
      ws.onmessage = async (event) => {
        try {
          const msg = envelope.parse(JSON.parse(String(event.data)));
          clearTimeout(watchdog);
          watchdog = setTimeout(() => ws.close(), 90000);
          if (seen.has(msg.metadata.message_id)) return;
          seen.add(msg.metadata.message_id);
          if (seen.size > 2000) seen.delete(seen.values().next().value!);
          if (msg.metadata.message_type === 'session_welcome') {
            retry = 1000;
            const session = z.object({ id: z.string() }).parse(msg.payload.session);
            if (inherited) return;
            const token = await userToken(this.db, account);
            await helix.request(
              'eventsub/subscriptions',
              z.unknown(),
              {
                method: 'POST',
                body: JSON.stringify({
                  type: 'channel.chat.message',
                  version: '1',
                  condition: { broadcaster_user_id: account.id, user_id: account.id },
                  transport: { method: 'websocket', session_id: session.id },
                }),
              },
              token,
            );
          } else if (msg.metadata.message_type === 'session_reconnect') {
            const session = z.object({ reconnect_url: z.string().url() }).parse(msg.payload.session);
            ws.onclose = null;
            ws.close();
            connect(session.reconnect_url, true);
          } else if (msg.metadata.message_type === 'notification') {
            const e = chat.safeParse(msg.payload.event);
            if (!e.success || e.data.broadcaster_user_id !== account.id) return;
            if (
              !(
                this.db.prepare('SELECT bot_enabled FROM accounts WHERE id=?').get(account.id) as {
                  bot_enabled: number;
                }
              )?.bot_enabled
            )
              return;
            const reply = bot.reply(
              e.data.message.text,
              e.data.chatter_user_id,
              e.data.chatter_user_id === account.id ||
                e.data.badges.some((b) => ['moderator', 'broadcaster'].includes(b.set_id)),
              this.data(),
              account.id,
            );
            if (!reply || reply.includes('cooling down')) return;
            await helix.request(
              'chat/messages',
              z.unknown(),
              {
                method: 'POST',
                body: JSON.stringify({
                  broadcaster_id: account.id,
                  sender_id: account.id,
                  message: reply.slice(0, 500),
                }),
              },
              await userToken(this.db, account),
            );
          }
        } catch {
          console.error('EventSub event was rejected or could not be processed.');
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (!stopped) {
          timer = setTimeout(() => connect(), retry);
          retry = Math.min(60_000, retry * 2);
        }
      };
    };
    connect();
    this.sockets.set(account.id, () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(watchdog);
      socket?.close();
    });
  }
  recordChange(accountId: string, before: unknown, after: unknown) {
    this.db
      .prepare('INSERT INTO changes VALUES(?,?,?,?,?)')
      .run(randomUUID(), accountId, Date.now(), JSON.stringify(before), JSON.stringify(after));
  }
  close() {
    for (const stop of this.sockets.values()) stop();
    this.sockets.clear();
  }
}
