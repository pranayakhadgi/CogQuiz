import { getOrCreateCategory } from '@/lib/db'

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const name = body?.name || 'General'

    const category = await getOrCreateCategory(name)
    return Response.json({ success: true, category })
  } catch (e) {
    if (e.message === 'Not authenticated') {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    return Response.json({ error: e.message }, { status: 500 })
  }
}
