import { NextResponse } from "next/server";
import { generateQuizFromPDF, GeminiError } from "@/lib/gemini";
import { errorResponse, HttpError } from "@/lib/api-errors";
import {
  getContext,
  getOrCreateCategory,
  getOrCreateDeck,
  createFlashcards,
} from "@/services/db";

// Gemini can take a while on long PDFs; give the serverless function room.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Vercel rejects request bodies over 4.5 MB before the function runs; match that.
const MAX_BYTES = 4.5 * 1024 * 1024;
const MAX_TITLE_LEN = 200;

function deckTitleFromFileName(name) {
  const base = String(name || "")
    .split(/[\\/]/)
    .pop()
    .replace(/\s+/g, " ")
    .trim();
  return (base || "Untitled Deck").slice(0, MAX_TITLE_LEN);
}

function looksLikePdf(buffer) {
  // "%PDF-" magic bytes (allow a little leading junk, as some generators emit).
  return buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"));
}

// POST /api/upload (multipart: file=<pdf>)
// -> { success, deck_id, category_id, category, deck_title, reused_deck, inserted, skipped, total }
export async function POST(request) {
  try {
    // Check auth before spending a Gemini call.
    const ctx = await getContext();

    let formData;
    try {
      formData = await request.formData();
    } catch {
      throw new HttpError(400, "Expected a multipart/form-data upload with a 'file' field.");
    }
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      throw new HttpError(400, "No file provided");
    }
    const nameIsPdf = /\.pdf$/i.test(file.name || "");
    // Some browsers/OSes send an empty or generic MIME type for PDFs.
    if (file.type !== "application/pdf" && !(nameIsPdf && (!file.type || file.type === "application/octet-stream"))) {
      throw new HttpError(400, "Please upload a PDF file.");
    }
    if (file.size === 0) {
      throw new HttpError(400, "The uploaded file is empty.");
    }
    if (file.size > MAX_BYTES) {
      throw new HttpError(413, "PDF is too large (max 4.5 MB).");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!looksLikePdf(buffer)) {
      throw new HttpError(400, "This file doesn't look like a valid PDF.");
    }

    // Validated: { category, questions: [{question, options{A-D}, correct, explanation}] } (<= 50)
    const quiz = await generateQuizFromPDF(buffer);

    const categoryId = await getOrCreateCategory(quiz.category, ctx);
    const deckTitle = deckTitleFromFileName(file.name);
    const deck = await getOrCreateDeck(categoryId, deckTitle, ctx);

    // One batched insert. Re-uploading the same file reuses its deck and only
    // adds questions that aren't already in it (existing progress is kept).
    const { inserted, skipped } = await createFlashcards(
      deck.id,
      quiz.questions,
      { skipExisting: !deck.created },
      ctx,
    );

    return NextResponse.json(
      {
        success: true,
        deck_id: deck.id,
        category_id: categoryId,
        category: quiz.category,
        deck_title: deckTitle,
        reused_deck: !deck.created,
        inserted,
        skipped,
        total: quiz.questions.length,
      },
      { status: deck.created ? 201 : 200 },
    );
  } catch (err) {
    if (err instanceof GeminiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return errorResponse(err, "Upload failed");
  }
}
