// Wall-clock time in the plan's timezone (Europe/Rome by default), independent of the phone's own zone.
// Dates are 'YYYY-MM-DD' keys; times of day are minutes since midnight; instants are epoch milliseconds.

export const DEFAULT_TZ = 'Europe/Rome';

const fmtCache = new Map();
function fmt(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return fmtCache.get(tz);
}

/** Wall-clock parts of an instant in `tz`. */
export function partsAt(ms, tz = DEFAULT_TZ) {
  const p = {};
  for (const { type, value } of fmt(tz).formatToParts(new Date(ms))) p[type] = value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minute: Number(p.hour) * 60 + Number(p.minute),
    second: Number(p.second),
  };
}

export function dateKey(ms, tz = DEFAULT_TZ) { return partsAt(ms, tz).date; }

/** Offset of `tz` from UTC at instant `ms`, in minutes. */
function offsetAt(ms, tz) {
  const p = partsAt(ms, tz);
  const [y, mo, d] = p.date.split('-').map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, Math.floor(p.minute / 60), p.minute % 60, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/**
 * Instant of wall-clock `minute` on `date` in `tz`. Minutes may exceed 1440 (next day).
 * In the autumn DST overlap the earlier instant is used; in the spring gap the time is shifted forward.
 */
export function instantOf(date, minute, tz = DEFAULT_TZ) {
  const [y, mo, d] = date.split('-').map(Number);
  const naive = Date.UTC(y, mo - 1, d, 0, minute);
  const wantDate = addDays(date, Math.floor(minute / 1440)), wantMin = ((minute % 1440) + 1440) % 1440;
  // A zone has at most two offsets around a given wall time: the one before and the one after any change.
  const before = offsetAt(naive - 864e5, tz), after = offsetAt(naive + 864e5, tz);
  const hits = [naive - before * 60000, naive - after * 60000].filter((c) => {
    const p = partsAt(c, tz);
    return p.date === wantDate && p.minute === wantMin;
  });
  if (hits.length) return Math.min(...hits);
  return naive - before * 60000; // spring gap: the wall time does not exist, shift forward
}

export function addDays(date, n) {
  const [y, mo, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Monday=0 … Sunday=6. */
export function weekday(date) {
  const [y, mo, d] = date.split('-').map(Number);
  return (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7;
}

/** Monday of the week containing `date`. */
export function weekStart(date) { return addDays(date, -weekday(date)); }

/** ISO-8601 week key, e.g. '2026-W43'. */
export function isoWeek(date) {
  const thursday = addDays(date, 3 - weekday(date));
  const year = Number(thursday.slice(0, 4));
  const jan4 = `${year}-01-04`;
  const week = 1 + Math.round((Date.parse(weekStart(thursday)) - Date.parse(weekStart(jan4))) / (7 * 864e5));
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function parseHM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
  return h * 60 + mi;
}

export function hm(minute) {
  const m = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Human duration in Italian: 45', 1h 30', 2h. */
export function dur(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}'`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}'` : `${h}h`;
}

export const GIORNI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
export const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto',
  'settembre', 'ottobre', 'novembre', 'dicembre'];

export function longDate(date) {
  const [y, mo, d] = date.split('-').map(Number);
  return `${GIORNI[weekday(date)]} ${d} ${MESI[mo - 1]}${y !== new Date().getFullYear() ? ' ' + y : ''}`;
}
