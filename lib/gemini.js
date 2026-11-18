import "server-only";
import {
  GoogleGenerativeAI,
  GoogleGenerativeAIAbortError,
  GoogleGenerativeAIResponseError,
  SchemaType,
} from "@google/generative-ai";
import { normalizeQuiz, parseModelJson } from "@/lib/quiz-format.js";

// Error with an HTTP status and a message that is safe to show the user.
export class GeminiError extends Error {
  constructor(status, message, cause) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
    if (cause) this.cause = cause;
  }
}

// Leave headroom under the route's maxDuration (60s) so we can answer with a
// clear error instead of the platform killing the function.
const REQUEST_TIMEOUT_MS = 50_000;

// When the hackathon theme drops, only change the prompt text. Everything else stays the same.
const PROMPT = `You are an expert educator.

Your task is to analyze the provided PDF and determine the OPTIMAL number of quiz questions needed to fully cover the material.

CRITICAL REQUIREMENTS:
    The PDF may contain diagrams, charts, or scanned pages.
    You MUST:
    - Extract information from BOTH text and images
    - Interpret diagrams and figures when relevant
    - Do not ignore visual content

1. QUESTION COUNT RULES:
- Minimum: 10 questions
- Maximum: 50 questions
- Scale based on:
  - Length of the document
  - Number of distinct topics
  - Density of important details

2. COVER ALL MAJOR TOPICS:
   - Identify the main sections/topics in the PDF first.
   - Distribute questions across ALL sections (do not focus on just one area).
   - Ensure no section is left untested.

3. MAXIMIZE DETAIL:
   - Include both high-level concepts AND small but important details.
   - Include definitions, mechanisms, examples, edge cases, and exceptions.

4. AVOID REDUNDANCY:
   - No duplicate or reworded questions testing the same idea.

5. DIFFICULTY MIX:
   - 30% easy (basic recall)
   - 40% medium (understanding/application)
   - 30% hard (multi-step reasoning, tricky distinctions)

6. QUALITY OF DISTRACTORS:
   - Wrong answers must be plausible and related to the topic.
   - Avoid obviously incorrect options.

7. USE ONLY PDF CONTENT:
   - Do not invent facts not present in the PDF.

8. INTERNAL COVERAGE CHECK:
   - Before generating questions, internally map each question to a specific section of the PDF.

OUTPUT RULES:
- Return JSON only
- No explanation outside the JSON
- No code fences

FORMAT:
{
  "category": "subject name inferred from the PDF",
  "questions": [
    {
      "question": "question text here",
      "options": {
        "A": "option text",
        "B": "option text",
        "C": "option text",
        "D": "option text"
      },
      "correct": "A",
      "explanation": "why the correct answer is right"
    }
  ]
}`;

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    category: { type: SchemaType.STRING },
    questions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          question: { type: SchemaType.STRING },
          options: {
            type: SchemaType.OBJECT,
            properties: {
              A: { type: SchemaType.STRING },
              B: { type: SchemaType.STRING },
              C: { type: SchemaType.STRING },
              D: { type: SchemaType.STRING },
            },
            required: ["A", "B", "C", "D"],
          },
          correct: { type: SchemaType.STRING, enum: ["A", "B", "C", "D"], format: "enum" },
          explanation: { type: SchemaType.STRING },
        },
        required: ["question", "options", "correct", "explanation"],
      },
    },
  },
  required: ["category", "questions"],
};

function toGeminiError(error) {
  if (error instanceof GeminiError) return error;
  const msg = String(error?.message || "");
  const status = error?.status;

  if (error instanceof GoogleGenerativeAIAbortError || error?.name === "AbortError" || /aborted|timed? ?out/i.test(msg)) {
    return new GeminiError(504, "Generating the quiz took too long. Try a shorter PDF.", error);
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(msg)) {
    return new GeminiError(429, "The AI service is over its usage quota right now. Please try again in a few minutes.", error);
  }
  if (status === 401 || status === 403 || /API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) {
    return new GeminiError(500, "The AI service is misconfigured on the server (invalid GEMINI_API_KEY).", error);
  }
  if (status === 503 || status === 500 || /overloaded|UNAVAILABLE/i.test(msg)) {
    return new GeminiError(503, "The AI service is temporarily unavailable. Please try again shortly.", error);
  }
  if (status === 400 || status === 413) {
    return new GeminiError(422, "The AI service couldn't read this PDF (it may be corrupted, encrypted, or too large).", error);
  }
  if (error instanceof GoogleGenerativeAIResponseError || /SAFETY|blocked|RECITATION|PROHIBITED/i.test(msg)) {
    return new GeminiError(422, "The AI declined to generate a quiz for this PDF (content was blocked by safety filters).", error);
  }
  return new GeminiError(502, "The AI service failed to generate a quiz. Please try again.", error);
}

/**
 * Generate a quiz from a PDF buffer.
 * Returns { category: string, questions: [{ question, options: {A,B,C,D}, correct: 'A'..'D', explanation }] }
 * with at most 50 validated questions. Throws GeminiError (with .status) on failure.
 */
export async function generateQuizFromPDF(pdfBuffer) {
  // Accept either name (README documents GEMINI_API_KEY; older deploys used GOOGLE_AI_API_KEY).
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "").trim();
  if (!apiKey) {
    throw new GeminiError(500, "Server is missing GEMINI_API_KEY.");
  }

  let raw;
  let finishReason;
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel(
      {
        model: "gemini-2.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.4,
        },
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );

    const result = await model.generateContent([
      { inlineData: { mimeType: "application/pdf", data: pdfBuffer.toString("base64") } },
      PROMPT,
    ]);

    const response = result.response;
    const blockReason = response?.promptFeedback?.blockReason;
    if (blockReason) {
      throw new GeminiError(422, `The AI declined to process this PDF (blocked: ${blockReason}).`);
    }
    finishReason = response?.candidates?.[0]?.finishReason;
    raw = response.text(); // throws GoogleGenerativeAIResponseError on SAFETY/RECITATION
  } catch (error) {
    const mapped = toGeminiError(error);
    console.error("Gemini API Error:", error?.message || error);
    throw mapped;
  }

  let parsed;
  try {
    parsed = parseModelJson(raw);
  } catch (error) {
    console.error(`Gemini returned unparseable JSON (finishReason=${finishReason}):`, raw?.slice(0, 500));
    if (finishReason === "MAX_TOKENS") {
      throw new GeminiError(502, "The AI response was cut off. Try a shorter PDF.", error);
    }
    throw new GeminiError(502, "The AI returned an invalid quiz. Please try again.", error);
  }

  const quiz = normalizeQuiz(parsed);
  if (quiz.dropped > 0) {
    console.warn(`Gemini quiz: dropped ${quiz.dropped} malformed/duplicate/extra question(s)`);
  }
  if (quiz.questions.length === 0) {
    throw new GeminiError(502, "Couldn't generate any valid questions from this PDF.");
  }
  return quiz;
}
