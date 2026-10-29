import { z } from 'zod';
import { helix } from './helix.js';
import { config } from '../server/config.js';
import type { DB } from '../db/db.js';
const responseSchema = z.array(
  z.object({
    id: z.number(),
    first_release_date: z.number().optional(),
    genres: z.array(z.object({ name: z.string() })).default([]),
    themes: z.array(z.object({ name: z.string() })).default([]),
  }),
);
export async function enrichIgdb(db: DB, games: { id: string; igdb_id?: string }[]) {
  const eligible = games.filter((g) => /^\d+$/.test(g.igdb_id ?? ''));
  for (let i = 0; i < eligible.length; i += 100) {
    const batch = eligible.slice(i, i + 100);
    const response = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': config.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${await helix.appToken()}`,
        'Content-Type': 'text/plain',
      },
      body: `fields first_release_date,genres.name,themes.name; where id=(${batch.map((g) => g.igdb_id).join(',')}); limit 100;`,
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`IGDB enrichment failed (${response.status})`);
    const rows = responseSchema.parse(await response.json());
    db.transaction(() =>
      rows.forEach((row) => {
        const g = batch.find((g) => Number(g.igdb_id) === row.id);
        if (g) {
          db.prepare('INSERT OR REPLACE INTO igdb_metadata VALUES(?,?,?,?)').run(
            g.id,
            row.first_release_date ? row.first_release_date * 1000 : null,
            JSON.stringify(row.genres.map((x) => x.name)),
            JSON.stringify(row.themes.map((x) => x.name)),
          );
          db.prepare('UPDATE games SET release_date=?,genre=? WHERE id=?').run(
            row.first_release_date ? row.first_release_date * 1000 : null,
            row.genres[0]?.name ?? 'Other',
            g.id,
          );
        }
      }),
    )();
    await new Promise((r) => setTimeout(r, 260));
  }
}
