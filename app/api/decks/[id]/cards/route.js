// same thing with this thing, remove the whole api folder

import { getDueCards } from "@/lib/db";

export async function GET(_request, { params }) {
  try {
    console.log("im here")
    const { id } = await params;
    console.log("I got the deck id " + id)
    const cards = await getDueCards(id);

    console.log("cards", cards)
    return Response.json({ success: true, cards });
  } catch (e) {
    if (e.message === "Not authenticated") {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }

    return Response.json({ error: e.message }, { status: 500 });
  }
}
