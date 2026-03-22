import {getDueCards} from '@/lib/db'

export async function POST(request) {
  try {

    const body = await request.json();
    const { deckId } = body;

    const cards = await getDueCards(deckId)
    
    console.log("yea I gut the cards" + cards)
    return Response.json({ success: true, cards })
  } catch (e) {
    if (e.message === 'Not authenticated') {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    return Response.json({ error: e.message }, { status: 500 })
  }
}
