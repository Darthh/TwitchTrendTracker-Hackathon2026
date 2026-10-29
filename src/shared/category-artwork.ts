// Twitch category artwork URLs observed with REA; provenance: docs/design/rea/category-artwork.json.
const artwork: Record<string, string> = {
  'Just Chatting': 'https://static-cdn.jtvnw.net/ttv-boxart/509658-285x380.jpg',
  'League of Legends': 'https://static-cdn.jtvnw.net/ttv-boxart/21779-285x380.jpg',
  Fortnite: 'https://static-cdn.jtvnw.net/ttv-boxart/33214-285x380.jpg',
  Minecraft: 'https://static-cdn.jtvnw.net/ttv-boxart/27471_IGDB-285x380.jpg',
  'World of Warcraft': 'https://static-cdn.jtvnw.net/ttv-boxart/18122-285x380.jpg',
  VALORANT: 'https://static-cdn.jtvnw.net/ttv-boxart/516575-285x380.jpg',
  'Dead by Daylight': 'https://static-cdn.jtvnw.net/ttv-boxart/491487-285x380.jpg',
  Art: 'https://static-cdn.jtvnw.net/ttv-boxart/509660-285x380.jpg',
  'Escape from Tarkov': 'https://static-cdn.jtvnw.net/ttv-boxart/491931_IGDB-285x380.jpg',
  'Hollow Knight: Silksong': 'https://static-cdn.jtvnw.net/ttv-boxart/511391_IGDB-285x380.jpg',
  Phasmophobia: 'https://static-cdn.jtvnw.net/ttv-boxart/518184_IGDB-285x380.jpg',
  'Talk Shows & Podcasts': 'https://static-cdn.jtvnw.net/ttv-boxart/417752-285x380.jpg',
};

export function categoryArtwork(name: string, template?: string | null): string | null {
  const candidate = template?.replaceAll('{width}', '285').replaceAll('{height}', '380');
  if (candidate) {
    try {
      const url = new URL(candidate);
      if (
        url.origin === 'https://static-cdn.jtvnw.net' &&
        !url.username &&
        !url.password &&
        /^\/ttv-boxart\/[a-zA-Z0-9_-]+-\d+x\d+\.jpg$/.test(url.pathname) &&
        !url.search &&
        !url.hash
      )
        return url.href;
    } catch {
      /* Invalid metadata uses the verified catalog or the original illustration. */
    }
  }
  return artwork[name] ?? null;
}
