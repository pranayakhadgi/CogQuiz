import { test } from "node:test";
import assert from "node:assert/strict";
import { sm2, parseQuality, addDaysUTC, todayUTC, MIN_EF } from "./sm2.js";

const NOW = new Date("2026-03-10T23:30:00Z");
const fresh = { repetitions: 0, interval_days: 0, easiness_factor: 2.5 };

test("first successful review -> 1 day, second -> 6 days, then I*EF", () => {
  const r1 = sm2(fresh, 4, NOW);
  assert.deepEqual(r1, { repetitions: 1, interval_days: 1, easiness_factor: 2.5, due_date: "2026-03-11" });
  const r2 = sm2(r1, 4, NOW);
  assert.equal(r2.repetitions, 2);
  assert.equal(r2.interval_days, 6);
  const r3 = sm2(r2, 4, NOW);
  assert.equal(r3.repetitions, 3);
  assert.equal(r3.interval_days, Math.round(6 * 2.5)); // 15, uses EF before update
  assert.equal(r3.due_date, "2026-03-25");
});

test("EF update matches SM-2 formula for every quality", () => {
  const expected = { 5: 2.6, 4: 2.5, 3: 2.36, 2: 2.18, 1: 1.96, 0: 1.7 };
  for (const [q, ef] of Object.entries(expected)) {
    assert.equal(sm2(fresh, Number(q), NOW).easiness_factor, ef, `q=${q}`);
  }
});

test("EF never drops below 1.3", () => {
  let s = fresh;
  for (let i = 0; i < 10; i++) s = sm2(s, 0, NOW);
  assert.equal(s.easiness_factor, MIN_EF);
});

test("failure resets repetitions and interval to 1 day", () => {
  const s = { repetitions: 5, interval_days: 40, easiness_factor: 2.2 };
  const r = sm2(s, 2, NOW);
  assert.equal(r.repetitions, 0);
  assert.equal(r.interval_days, 1);
  assert.equal(r.due_date, "2026-03-11");
});

test("does not mutate input", () => {
  const s = Object.freeze({ repetitions: 2, interval_days: 6, easiness_factor: 2.5 });
  sm2(s, 5, NOW);
  assert.deepEqual(s, { repetitions: 2, interval_days: 6, easiness_factor: 2.5 });
});

test("rounds interval (not ceil) and stores EF with 2 decimals", () => {
  const r = sm2({ repetitions: 2, interval_days: 6, easiness_factor: 1.3 }, 5, NOW);
  assert.equal(r.interval_days, 8); // 7.8 -> 8
  assert.equal(r.easiness_factor, 1.4);
  const r2 = sm2({ repetitions: 2, interval_days: 10, easiness_factor: 2.36 }, 3, NOW);
  assert.equal(r2.interval_days, 24); // 23.6 -> 24
  assert.ok(Number.isInteger(r2.interval_days));
  assert.equal(r2.easiness_factor, 2.22);
});

test("null / missing DB state is treated as a new card", () => {
  const r = sm2({ repetitions: null, interval_days: null, easiness_factor: null }, 5, NOW);
  assert.deepEqual(r, { repetitions: 1, interval_days: 1, easiness_factor: 2.6, due_date: "2026-03-11" });
  const r2 = sm2({}, 3, NOW);
  assert.equal(r2.easiness_factor, 2.36);
});

test("corrupt interval with repetitions >= 2 still yields >= 1 day", () => {
  const r = sm2({ repetitions: 3, interval_days: 0, easiness_factor: 2.5 }, 5, NOW);
  assert.ok(r.interval_days >= 1);
});

test("due date math is UTC regardless of local time zone", () => {
  // 23:30Z on Mar 10 is still Mar 10 in UTC; +1 day is Mar 11.
  assert.equal(todayUTC(NOW), "2026-03-10");
  assert.equal(addDaysUTC(NOW, 1), "2026-03-11");
  // Across a US DST boundary (Mar 8 2026) and month/year ends.
  assert.equal(addDaysUTC(new Date("2026-03-07T12:00:00Z"), 2), "2026-03-09");
  assert.equal(addDaysUTC(new Date("2026-12-31T00:00:00Z"), 1), "2027-01-01");
});

test("parseQuality accepts integers 0..5 only", () => {
  assert.equal(parseQuality(0), 0);
  assert.equal(parseQuality(5), 5);
  assert.equal(parseQuality("3"), 3);
  for (const bad of [null, undefined, "", " ", 6, -1, 2.5, NaN, "abc", true, {}]) {
    assert.equal(parseQuality(bad), null, `rejects ${String(bad)}`);
  }
});

test("sm2 throws on invalid quality", () => {
  assert.throws(() => sm2(fresh, null, NOW), RangeError);
  assert.throws(() => sm2(fresh, 7, NOW), RangeError);
});
