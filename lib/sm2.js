// Pure SM-2 spaced-repetition scheduler (no I/O, no imports) so it can be
// unit-tested with `node --test` and shared by server code.
//
// Reference: SuperMemo SM-2 (https://super-memory.com/english/ol/sm2.htm)
//   q >= 3: I(1) = 1, I(2) = 6, I(n) = round(I(n-1) * EF); repetitions += 1
//   q <  3: repetitions = 0, I = 1
//   EF' = max(1.3, EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
// The interval uses the EF from *before* this review; EF is then updated.

export const DEFAULT_EF = 2.5;
export const MIN_EF = 1.3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD for the given instant, in UTC. All due_date math is UTC. */
export function toUTCDateString(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

/** Today's date (UTC) as YYYY-MM-DD. */
export function todayUTC(now = new Date()) {
  return toUTCDateString(now);
}

/** Add whole days to a date in UTC, returning YYYY-MM-DD. DST-safe. */
export function addDaysUTC(now, days) {
  const d = new Date(now);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return toUTCDateString(new Date(midnight + days * DAY_MS));
}

/**
 * Validate / coerce a user quality rating. Returns an integer 0..5, or null
 * when the input is not a usable rating (null, "", NaN, out of range).
 */
export function parseQuality(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") {
    return null;
  }
  if (typeof value === "string" && !value.trim()) return null;
  const n = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (!Number.isInteger(n) || n < 0 || n > 5) return null;
  return n;
}

function sanitizeState(state = {}) {
  const reps = Number(state.repetitions);
  const interval = Number(state.interval_days);
  // Number(null) === 0, so treat null/undefined explicitly as "unset".
  const ef = state.easiness_factor == null ? NaN : Number(state.easiness_factor);
  return {
    repetitions: Number.isInteger(reps) && reps > 0 ? reps : 0,
    interval_days: Number.isFinite(interval) && interval > 0 ? interval : 0,
    easiness_factor: Number.isFinite(ef) ? Math.max(MIN_EF, ef) : DEFAULT_EF,
  };
}

/**
 * Compute the next SM-2 state. Does NOT mutate `state`.
 *
 * @param {{repetitions?: number, interval_days?: number, easiness_factor?: number}} state
 * @param {number} quality integer 0..5
 * @param {Date} [now]
 * @returns {{repetitions: number, interval_days: number, easiness_factor: number, due_date: string}}
 */
export function sm2(state, quality, now = new Date()) {
  const q = parseQuality(quality);
  if (q === null) {
    throw new RangeError("quality must be an integer from 0 to 5");
  }
  const prev = sanitizeState(state);

  let repetitions;
  let interval;
  if (q >= 3) {
    if (prev.repetitions === 0) interval = 1;
    else if (prev.repetitions === 1) interval = 6;
    else interval = Math.round(Math.max(1, prev.interval_days) * prev.easiness_factor);
    repetitions = prev.repetitions + 1;
  } else {
    repetitions = 0;
    interval = 1;
  }
  interval = Math.max(1, interval);

  const ef = prev.easiness_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  // Round to 2 decimals so floating-point drift doesn't accumulate in the DB.
  const easiness_factor = Math.max(MIN_EF, Math.round(ef * 100) / 100);

  return {
    repetitions,
    interval_days: interval,
    easiness_factor,
    due_date: addDaysUTC(now, interval),
  };
}
