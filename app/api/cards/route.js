import { getDueCards, getDueCardsByDeck, updateCard } from "@/services/db";
import { HttpError, errorResponse, readJsonBody, requireId } from "@/lib/api-errors";
import { parseQuality } from "@/lib/sm2";

export const dynamic = "force-dynamic";

// GET /api/cards            -> all due cards (dashboard summary)
// GET /api/cards?deckId=ID  -> full due cards of one deck (quiz)
export async function GET(request) {
  try {
    const deckIdParam = new URL(request.url).searchParams.get("deckId");
    const cards =
      deckIdParam !== null
        ? await getDueCardsByDeck(requireId(deckIdParam, "deckId"))
        : await getDueCards();
    return Response.json({ success: true, cards });
  } catch (e) {
    return errorResponse(e);
  }
}

// PATCH /api/cards { cardId, userScore: 0..5 } -> apply one SM-2 review
export async function PATCH(request) {
  try {
    const body = await readJsonBody(request);
    const cardId = requireId(body.cardId ?? body.card?.id, "cardId");
    const quality = parseQuality(body.userScore);
    if (quality === null) {
      throw new HttpError(400, "userScore must be an integer from 0 to 5");
    }
    const card = await updateCard(cardId, quality);
    return Response.json({ success: true, card });
  } catch (e) {
    return errorResponse(e);
  }
}
