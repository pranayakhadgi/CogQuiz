// Pure helpers to parse and validate the quiz JSON returned by Gemini.
// No imports so they can be unit-tested with `node --test`.

export const MAX_QUESTIONS = 50;
export const LETTERS = ["A", "B", "C", "D"];
const MAX_CATEGORY_LEN = 80;

/**
 * Parse model output into JSON. Tolerates code fences and leading/trailing
 * prose by falling back to the outermost {...} or [...] span.
 * Throws SyntaxError if nothing parseable is found.
 */
export function parseModelJson(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new SyntaxError("Empty model response");
  }
  const text = raw.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    // fall through
  }
  for (const [open, close] of [["{", "}"], ["[", "]"]]) {
    const start = text.indexOf(open);
    const end = text.lastIndexOf(close);
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        // try next shape
      }
    }
  }
  throw new SyntaxError("Model response was not valid JSON");
}

function cleanText(value) {
  if (typeof value === "number") value = String(value);
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function normalizeOptions(options) {
  let values;
  if (Array.isArray(options)) {
    values = options;
  } else if (options && typeof options === "object") {
    const upper = {};
    for (const [k, v] of Object.entries(options)) {
      upper[String(k).trim().toUpperCase().replace(/[^A-D]/g, "")] = v;
    }
    values = LETTERS.map((l) => upper[l]);
  } else {
    return null;
  }
  if (values.length !== 4) return null;
  const out = {};
  for (let i = 0; i < 4; i++) {
    const text = cleanText(values[i]);
    if (!text) return null;
    out[LETTERS[i]] = text;
  }
  // Reject duplicate options (ambiguous answer).
  if (new Set(Object.values(out).map((v) => v.toLowerCase())).size !== 4) return null;
  return out;
}

function normalizeCorrect(correct, options) {
  if (typeof correct === "number" && Number.isInteger(correct)) {
    return LETTERS[correct] ?? null;
  }
  const raw = cleanText(correct);
  if (!raw) return null;
  // Model returned the option text instead of the letter.
  const hit = LETTERS.find((l) => options[l].toLowerCase() === raw.toLowerCase());
  if (hit) return hit;
  // "A", "a", "A)", "(B)", "Option C", "Answer: D"
  const m = raw.match(/^(?:option|answer)?\s*:?\s*\(?([A-Da-d])\)?(?:[.):\s]|$)/i);
  return m ? m[1].toUpperCase() : null;
}

/** Normalize one question; returns null when it is malformed. */
export function normalizeQuestion(item) {
  if (!item || typeof item !== "object") return null;
  const question = cleanText(item.question);
  if (!question) return null;
  const options = normalizeOptions(item.options);
  if (!options) return null;
  const correct = normalizeCorrect(item.correct ?? item.answer, options);
  if (!correct) return null;
  return {
    question,
    options,
    correct,
    explanation: cleanText(item.explanation),
  };
}

/**
 * Validate the whole quiz payload: { category, questions: [...] } (or a bare
 * array of questions). Drops malformed and duplicate questions, caps at
 * MAX_QUESTIONS. Returns { category, questions, dropped }.
 */
export function normalizeQuiz(data) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.questions) ? data.questions : [];
  let category = Array.isArray(data) ? "" : cleanText(data?.category);
  if (!category) category = "General";
  if (category.length > MAX_CATEGORY_LEN) category = category.slice(0, MAX_CATEGORY_LEN).trim();

  const seen = new Set();
  const questions = [];
  for (const item of list) {
    const q = normalizeQuestion(item);
    if (!q) continue;
    const key = q.question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push(q);
    if (questions.length >= MAX_QUESTIONS) break;
  }
  return { category, questions, dropped: list.length - questions.length };
}

/** Key used to detect a question that already exists in a deck. */
export function questionKey(text) {
  return cleanText(text).toLowerCase();
}
