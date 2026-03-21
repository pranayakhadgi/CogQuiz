import { GoogleGenerativeAI } from '@google/generative-ai'

export async function generateQuizFromPDF(pdfBuffer) {
  // Initialize Gemini inside function to avoid module-level errors
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  
  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: pdfBuffer.toString('base64')
      }
    },
    //When the hackathon theme drops, only change the prompt text inside this function. Everything else stays the same.
    `Generate 10 quiz questions from this PDF.
     Return JSON only, no explanation.
     Format: {"questions":[{"question":"","options":["","","",""],"answer":0,"explanation":""}]}`
  ])
  
  const raw = result.response.text()
  return JSON.parse(raw.replace(/```json|```/g, '').trim())
}