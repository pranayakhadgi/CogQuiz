import { generateQuizFromPDF } from '@/lib/gemini'

// TEMPORARY TEST ENDPOINT - Remove before shipping
// This endpoint skips auth to debug Gemini PDF processing and API key validation
export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const quiz = await generateQuizFromPDF(buffer)

    return Response.json({
      success: true,
      filename: file.name,
      quiz,
    })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
