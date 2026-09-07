/**
 * One in-memory Postgres, set up the same way for both harnesses.
 *
 * pg-mem implements very few native functions, and the two this app's SQL
 * needs are not among them. Filling the gap here rather than weakening the
 * real queries: `now()` and `to_char(date, 'YYYY-MM-DD')` both exist in
 * Postgres, and the second is load-bearing -- see NOTE_COLUMNS in
 * server/api.mjs for why the date is formatted in SQL rather than in node.
 */
import { newDb } from 'pg-mem';

/** The one pattern this app asks for; anything else is a mistake, not a stub. */
const ISO_DAY = 'YYYY-MM-DD';

export function memPool() {
  const mem = newDb();
  mem.public.registerFunction({
    name: 'now',
    returns: 'timestamptz',
    implementation: () => new Date(),
  });
  mem.public.registerFunction({
    name: 'to_char',
    args: ['date', 'text'],
    returns: 'text',
    implementation: (value, pattern) => {
      if (value === null || value === undefined) return null;
      if (pattern !== ISO_DAY) throw new Error(`to_char pattern not stubbed: ${pattern}`);
      if (typeof value === 'string') return value.slice(0, 10);
      // A DATE has no time of day, so whichever midnight pg-mem chose to
      // represent it with is the one to read the parts back out of.
      const utc = value.getUTCHours() === 0 && value.getUTCMinutes() === 0;
      const p = (n) => String(n).padStart(2, '0');
      return utc
        ? `${value.getUTCFullYear()}-${p(value.getUTCMonth() + 1)}-${p(value.getUTCDate())}`
        : `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`;
    },
  });
  const { Pool } = mem.adapters.createPg();
  return { mem, Pool };
}
