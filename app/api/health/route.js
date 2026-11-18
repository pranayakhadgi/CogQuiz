import { createClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'no-store' }

// Public liveness/readiness check. supabase-js does not throw on query errors
// (it returns { error }), so the result must be inspected explicitly.
// Only reports reachability; never echoes env values or raw error details.
export async function GET() {
  const timestamp = new Date().toISOString()

  let supabase
  try {
    supabase = await createClient()
  } catch {
    return Response.json(
      { status: 'error', supabase: 'not_configured', timestamp },
      { status: 503, headers: noStore }
    )
  }

  try {
    // HEAD + count against a real table: succeeds (0 rows under RLS for anon)
    // if the database is reachable and the schema exists.
    const { error } = await supabase
      .from('decks')
      .select('id', { head: true, count: 'exact' })
      .limit(1)

    if (error) {
      console.error('health check query failed:', error.message)
      return Response.json(
        { status: 'error', supabase: 'unreachable', timestamp },
        { status: 503, headers: noStore }
      )
    }

    return Response.json({ status: 'ok', supabase: 'connected', timestamp }, { headers: noStore })
  } catch (e) {
    console.error('health check failed:', e)
    return Response.json(
      { status: 'error', supabase: 'unreachable', timestamp },
      { status: 503, headers: noStore }
    )
  }
}
