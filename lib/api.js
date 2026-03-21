import { createClient } from '@/lib/supabase-browser'
import { generateQuizFromPDF } from '@/lib/gemini'

// ================================
// AUTH
// ================================

export async function signInWithGoogle() {
  const supabase = createClient()
  return await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` }
  })
}

export async function signInWithEmail(email, password) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  return data
}

export async function signUpWithEmail(email, password) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw new Error(error.message)
  return data
}

export async function signOut() {
  const supabase = createClient()
  await supabase.auth.signOut()
  window.location.href = '/login'
}

export async function getSession() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

// ================================
// DASHBOARD
// ================================

export async function getDashboardData() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: categories, error } = await supabase
    .from('categories')
    .select(`id, name, decks ( id, title )`)

  if (error) throw new Error(error.message)
  return categories
}

export async function getDueCards() {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('cards')
    .select(`*, decks ( title, categories ( name ) )`)
    .lte('due_date', today)
    .order('due_date', { ascending: true })

  if (error) throw new Error(error.message)
  return data
}

// ================================
// UPLOAD
// ================================

// export async function uploadPDF(file) {
//   const formData = new FormData()
//   formData.append('file', file)

//   const response = await fetch('/api/upload', {
//     method: 'POST',
//     body: formData
//   })

//   const result = await response.json()
//   if (!response.ok) throw new Error(result.error || 'Upload failed')
//   return result
// }


// for upload 
// this can just call one function 

export async function processUploadedPdf(file) {
  // Check file type and throw an error if invalid
  if (!file || file.type !== 'application/pdf') {
    throw new Error('Please upload a PDF file only.');
  }
    
  try {
    // Ensure a default category exists
    //const categoryRes = await ensureDefaultCategory();
    //if (categoryRes.status === 401) {
    //  throw new Error('Unauthorized: Please log in again.');
    //}

    // Generate the quiz
    const uploadRes = await generateQuizFromPDF(file);
    if (uploadRes.status === 401) {
      throw new Error('Unauthorized: Please log in again.');
    }
    
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      throw new Error('Failed to generate quiz from PDF.');
    }

    // Fetch the resulting cards
    await fetchCards(uploadData.deck_id);
    
  } catch (err) {
    // If it's already one of our custom errors above, re-throw it.
    // Otherwise, throw a generic fallback error.
    throw new Error(err.message || 'Something went wrong. Please try again.');
  }
}


// ================================
// QUIZ
// ================================

export async function submitCardReview(cardId, rating) {
  const response = await fetch('/api/cards/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card_id: cardId, rating })
  })

  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Review failed')
  return result
}