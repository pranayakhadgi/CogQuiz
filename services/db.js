// Server-only data access layer. Previously marked "use server", which turned
// every export into a public Server Action endpoint callable from any client;
// nothing uses them as actions (only API route handlers import this file).
import "server-only";
import { createClient } from "@/lib/supabase-server.js";
import { HttpError, unauthorized } from "@/lib/api-errors.js";
import { sm2, todayUTC } from "@/lib/sm2.js";
import { questionKey } from "@/lib/quiz-format.js";

// Schema used (inferred from the app; nothing else is assumed):
//   categories(id, name, user_id)
//   decks(id, title, category_id -> categories.id, user_id)
//   cards(id, deck_id -> decks.id, user_id, question, options jsonb {A..D},
//         answer 'A'..'D', explanation, repetitions, easiness_factor,
//         interval_days, due_date date)

const PAGE_SIZE = 1000; // Supabase/PostgREST default max rows per request

async function getContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw unauthorized();
  return { supabase, user };
}

/** Read every row of a query, paging past PostgREST's max-rows cap. */
async function fetchAll(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

// PostgREST embedded counts come back as [{ count: n }].
const embeddedCount = (v) => (Array.isArray(v) ? (v[0]?.count ?? 0) : 0);

const DECK_WITH_COUNTS =
  "id, title, category_id, card_count:cards(count), due_cards:cards(count)";

function shapeDeck(deck) {
  return {
    id: deck.id,
    title: deck.title,
    category_id: deck.category_id,
    card_count: embeddedCount(deck.card_count),
    due_count: embeddedCount(deck.due_cards),
  };
}

// ==========================================
// 1. DASHBOARD
// ==========================================

/**
 * Categories with their decks and card counts:
 * [{ ...category, deck_count, card_count, due_count,
 *    decks: [{ id, title, category_id, card_count, due_count }] }]
 */
export async function getDashboardData() {
  const { supabase, user } = await getContext();
  const today = todayUTC();

  const [categoriesRes, decksRes] = await Promise.all([
    supabase
      .from("categories")
      .select("*")
      .eq("user_id", user.id)
      .order("name", { ascending: true }),
    supabase
      .from("decks")
      .select(DECK_WITH_COUNTS)
      .eq("user_id", user.id)
      .lte("due_cards.due_date", today)
      .order("title", { ascending: true }),
  ]);
  if (categoriesRes.error) throw categoriesRes.error;
  if (decksRes.error) throw decksRes.error;

  const decksByCategory = {};
  for (const deck of decksRes.data || []) {
    (decksByCategory[deck.category_id] ||= []).push(shapeDeck(deck));
  }

  return (categoriesRes.data || []).map((category) => {
    const decks = decksByCategory[category.id] || [];
    return {
      ...category,
      deck_count: decks.length,
      card_count: decks.reduce((s, d) => s + d.card_count, 0),
      due_count: decks.reduce((s, d) => s + d.due_count, 0),
      decks,
    };
  });
}

/** All due cards (summary fields) for the dashboard. */
export async function getDueCards() {
  const { supabase, user } = await getContext();
  const today = todayUTC();

  const cards = await fetchAll(() =>
    supabase
      .from("cards")
      .select("id, question, due_date, deck_id, decks(title, category_id)")
      .eq("user_id", user.id)
      .lte("due_date", today)
      .order("due_date", { ascending: true })
      .order("id", { ascending: true }),
  );

  return cards.map(({ decks, ...card }) => ({
    ...card,
    deck: decks?.title || "Untitled Deck",
    category_id: decks?.category_id ?? null,
  }));
}

// ==========================================
// 2. FIND OR CREATE (Idempotent)
// ==========================================

export async function getOrCreateCategory(rawName, ctx) {
  const { supabase, user } = ctx || (await getContext());
  const name = String(rawName || "").replace(/\s+/g, " ").trim() || "General";

  // limit(1) instead of maybeSingle(): existing duplicate rows must not make
  // the lookup "fail" and create yet another duplicate.
  const find = () =>
    supabase
      .from("categories")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", name)
      .order("id", { ascending: true })
      .limit(1);

  const { data: existing, error: findError } = await find();
  if (findError) throw findError;
  if (existing?.length) return existing[0].id;

  const { data: created, error } = await supabase
    .from("categories")
    .insert([{ name, user_id: user.id }])
    .select("id")
    .single();

  if (error) {
    // Unique violation from a concurrent upload: use the winner's row.
    if (error.code === "23505") {
      const { data: again } = await find();
      if (again?.length) return again[0].id;
    }
    throw error;
  }
  return created.id;
}

/** Returns { id, created } for the deck with this title in the category. */
export async function getOrCreateDeck(categoryId, rawTitle, ctx) {
  const { supabase, user } = ctx || (await getContext());
  const title = String(rawTitle || "").trim() || "Untitled Deck";

  const find = () =>
    supabase
      .from("decks")
      .select("id")
      .eq("user_id", user.id)
      .eq("category_id", categoryId)
      .eq("title", title)
      .order("id", { ascending: true })
      .limit(1);

  const { data: existing, error: findError } = await find();
  if (findError) throw findError;
  if (existing?.length) return { id: existing[0].id, created: false };

  const { data: created, error } = await supabase
    .from("decks")
    .insert([{ category_id: categoryId, title, user_id: user.id }])
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: again } = await find();
      if (again?.length) return { id: again[0].id, created: false };
    }
    throw error;
  }
  return { id: created.id, created: true };
}

/**
 * Insert many cards in ONE request. `questions` are normalized items
 * ({ question, options, correct, explanation }). When `skipExisting` is set,
 * questions whose text already exists in the deck are skipped (re-uploading
 * the same PDF must not duplicate cards or reset their SM-2 progress).
 * Returns { inserted, skipped }.
 */
export async function createFlashcards(deckId, questions, { skipExisting = false } = {}, ctx) {
  const { supabase, user } = ctx || (await getContext());

  let toInsert = questions;
  if (skipExisting) {
    const existing = await fetchAll(() =>
      supabase
        .from("cards")
        .select("question")
        .eq("deck_id", deckId)
        .eq("user_id", user.id)
        .order("id", { ascending: true }),
    );
    const seen = new Set(existing.map((c) => questionKey(c.question)));
    toInsert = questions.filter((q) => !seen.has(questionKey(q.question)));
  }

  if (toInsert.length === 0) {
    return { inserted: 0, skipped: questions.length };
  }

  const today = todayUTC();
  const rows = toInsert.map((q) => ({
    deck_id: deckId,
    user_id: user.id,
    question: q.question,
    options: q.options,
    answer: q.correct,
    explanation: q.explanation,
    repetitions: 0,
    easiness_factor: 2.5,
    interval_days: 0,
    due_date: today, // new cards are due immediately
  }));

  const { error } = await supabase.from("cards").insert(rows);
  if (error) throw error;

  return { inserted: rows.length, skipped: questions.length - rows.length };
}

export async function getAllCategories() {
  const { supabase, user } = await getContext();

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

// ==========================================
// 3. SPACED REPETITION ENGINE
// ==========================================

/**
 * Decks in a category with counts: [{ id, title, category_id, card_count, due_count }].
 * By default only decks with at least one due card; `includeAll` returns every deck.
 */
export async function getDueDecksByCategory(categoryId, { includeAll = false } = {}) {
  const { supabase, user } = await getContext();
  const today = todayUTC();

  const { data, error } = await supabase
    .from("decks")
    .select(DECK_WITH_COUNTS)
    .eq("user_id", user.id)
    .eq("category_id", categoryId)
    .lte("due_cards.due_date", today)
    .order("title", { ascending: true });

  if (error) throw error;

  const decks = (data || []).map(shapeDeck);
  return includeAll ? decks : decks.filter((d) => d.due_count > 0);
}

export async function getDueCardsByDeck(deckId) {
  const { supabase, user } = await getContext();
  const today = todayUTC();

  return fetchAll(() =>
    supabase
      .from("cards")
      .select("*")
      .eq("deck_id", deckId)
      .eq("user_id", user.id)
      .lte("due_date", today)
      .order("due_date", { ascending: true })
      .order("id", { ascending: true }),
  );
}

/** Apply one SM-2 review. Returns { id, repetitions, easiness_factor, interval_days, due_date }. */
export async function updateCard(cardId, quality) {
  const { supabase, user } = await getContext();

  // Load SM-2 state from the DB (never trust state sent by the client).
  const { data: card, error: fetchError } = await supabase
    .from("cards")
    .select("id, repetitions, easiness_factor, interval_days")
    .eq("id", cardId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!card) throw new HttpError(404, "Card not found");

  const next = sm2(card, quality);

  const { error } = await supabase
    .from("cards")
    .update(next)
    .eq("id", card.id)
    .eq("user_id", user.id);
  if (error) throw error;

  return { id: card.id, ...next };
}

export async function getCardsByDeckId(deckId) {
  const { supabase, user } = await getContext();

  return fetchAll(() =>
    supabase
      .from("cards")
      .select("*")
      .eq("deck_id", deckId)
      .eq("user_id", user.id)
      .order("id", { ascending: true }),
  );
}

/** Auth context for callers that run several db functions in one request. */
export { getContext };
