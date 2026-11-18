import { getCardsByDeckId } from "@/services/db";
import { errorResponse, requireId } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

// GET /api/decks/:id/cards -> every card in the deck (due or not)
export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const cards = await getCardsByDeckId(requireId(id, "deck id"));
    return Response.json({ success: true, cards });
  } catch (e) {
    return errorResponse(e);
  }
}
