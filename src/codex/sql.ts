export const APPROVED_TABLES = [
  'games',
  'game_hourly',
  'game_daily',
  'game_scan',
  'clip_weekly',
  'keyword_weekly',
  'context_events',
  'channels',
  'channel_hourly',
  'channel_daily',
];
export function guardSql(sql: string): string {
  if (sql.length > 4000 || !/^\s*SELECT\b/i.test(sql)) throw new Error('Use a single SELECT query.');
  if (
    /[;`]|--|\/\*|\*\/|\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|PRAGMA|REPLACE|VACUUM|UNION|WITH|RECURSIVE|JOIN|INTERSECT|EXCEPT|OVER|LOAD_EXTENSION|READFILE|WRITEFILE)\b/i.test(
      sql,
    )
  )
    throw new Error('Only bounded read-only queries against approved tables are allowed.');
  const tables = [...sql.matchAll(/\bFROM\s+([a-z_][a-z0-9_]*)/gi)];
  if (tables.length !== 1 || !APPROVED_TABLES.includes(tables[0][1].toLowerCase()))
    throw new Error('Query must reference one approved public table.');
  if ((sql.match(/\bSELECT\b/gi) ?? []).length !== 1 || /\bFROM\s*\(/i.test(sql))
    throw new Error('Subqueries are not enabled.');
  const calls = [...sql.matchAll(/([a-z_][a-z0-9_]*)\s*\(/gi)].map((m) => m[1].toLowerCase());
  if (
    calls.some(
      (f) => !['sum', 'avg', 'count', 'min', 'max', 'round', 'coalesce', 'abs', 'nullif', 'in'].includes(f),
    )
  )
    throw new Error('Query uses an unsupported function.');
  const from = sql.slice(tables[0].index! + tables[0][0].length);
  const sourceClause = from.split(/\bWHERE\b|\bGROUP\s+BY\b|\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b/i)[0];
  if (sourceClause.trim() && !/^\s+(?:AS\s+)?[a-z_][a-z0-9_]*\s*$/i.test(sourceClause))
    throw new Error('Multiple tables are not enabled.');
  return /\bLIMIT\s+\d+\s*$/i.test(sql)
    ? sql.replace(/\bLIMIT\s+(\d+)\s*$/i, (_, n: string) => `LIMIT ${Math.min(500, Number(n))}`)
    : `${sql} LIMIT 500`;
}
