// Client-side study statistics (streak, accuracy, cards studied).
// The API has no stats endpoint, so quiz results are recorded per user in
// localStorage. Every function is a safe no-op on the server or when storage
// is unavailable (private mode, quota exceeded, corrupted JSON).

const PREFIX = "cogquiz:stats:";

function storageKey(userId) {
  return `${PREFIX}${userId || "anonymous"}`;
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function emptyStats() {
  return { total: 0, correct: 0, days: {} };
}

function read(userId) {
  if (typeof window === "undefined") return emptyStats();
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return emptyStats();
    const parsed = JSON.parse(raw);
    return {
      total: Number.isFinite(parsed?.total) ? parsed.total : 0,
      correct: Number.isFinite(parsed?.correct) ? parsed.correct : 0,
      days:
        parsed?.days && typeof parsed.days === "object" ? parsed.days : {},
    };
  } catch {
    return emptyStats();
  }
}

/** Record one answered card. */
export function recordAnswer(userId, isCorrect) {
  if (typeof window === "undefined") return;
  const stats = read(userId);
  const today = localDateKey();
  stats.total += 1;
  if (isCorrect) stats.correct += 1;
  stats.days[today] = (stats.days[today] || 0) + 1;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(stats));
  } catch {
    // Storage full or blocked: stats are best-effort.
  }
}

/** Returns { streak, accuracy (0-100 integer), totalStudied }. */
export function getStudyStats(userId) {
  const stats = read(userId);

  // A streak is consecutive days with at least one answered card, ending
  // today, or yesterday if the user hasn't studied yet today.
  let streak = 0;
  const cursor = new Date();
  if (!stats.days[localDateKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  while (stats.days[localDateKey(cursor)]) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const accuracy =
    stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

  return { streak, accuracy, totalStudied: stats.total };
}
