import { NextResponse } from "next/server";
import { generateQuizFromPDF } from "@/lib/gemini";
import { createClient } from "@/lib/supabase-server";
import {
  getOrCreateCategory,
  getOrCreateDeck,
  createFlashcard,
} from "@/services/db";

// Gemini can take a while on long PDFs; give the serverless function room.
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024; // Gemini inline-data limit

export async function POST(request) {
  try {
    // Check auth before spending a Gemini call.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Please upload a PDF file." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "PDF is too large (max 20 MB)." }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const quizData = await generateQuizFromPDF(buffer);

    if (!quizData || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
      return NextResponse.json(
        { error: "Couldn't generate questions from this PDF." },
        { status: 502 },
      );
    }

    const categoryId = await getOrCreateCategory(quizData.category || "General");
    const deckId = await getOrCreateDeck(categoryId, file.name);

    for (const item of quizData.questions) {
      await createFlashcard({
        deckId,
        question: item.question,
        optionsPayload: item.options,
        correct_awnser: item.correct,
        explanation: item.explanation,
      });
    }

    return NextResponse.json({ success: true, deck_id: deckId }, { status: 200 });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
