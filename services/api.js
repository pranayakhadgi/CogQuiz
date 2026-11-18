import { createClient } from "@/lib/supabase-browser";

// ================================
// AUTH
// ================================

export async function signInWithGoogle() {
  try {
    const supabase = createClient();
    return await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Must exactly match an entry in Supabase -> Auth -> URL Configuration -> Redirect URLs.
        redirectTo: `${window.location.origin}/auth/callback`,
        // Space-separated; Supabase adds the default openid/email/profile scopes.
        scopes: "https://www.googleapis.com/auth/calendar.events",
        queryParams: {
          // Needed so Google returns a refresh token (stored server-side by
          // /auth/callback) and the calendar keeps working after the access token expires.
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function signInWithEmail(email, password) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function signUpWithEmail(email, password) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw new Error(error.message);
  // If "Confirm email" is enabled in Supabase, no session is returned until the
  // user clicks the link in their inbox.
  return { ...data, needsConfirmation: !data.session };
}

export async function signOut() {
  try {
    // Server route revokes the session and clears the httpOnly Google token cookies.
    await fetch("/auth/signout", { method: "POST", credentials: "same-origin" });
  } catch (e) {
    console.error("Server sign-out failed:", e);
  }
  try {
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch (e) {
    console.error("Client sign-out failed:", e);
  }
  window.location.href = "/login";
}

export async function getSession() {
  try {
    const supabase = createClient();
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) {
      console.error("getSession error:", error.message);
      return null;
    }
    return session;
  } catch (e) {
    console.error("getSession error:", e.message);
    return null;
  }
}

// Vercel rejects serverless request bodies over ~4.5 MB with a non-JSON 413,
// so catch that before uploading.
export const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024;

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function isPdfFile(file) {
  if (!file) return false;
  const type = (file.type || "").toLowerCase();
  return (
    type === "application/pdf" ||
    type === "application/x-pdf" ||
    /\.pdf$/i.test(file.name || "")
  );
}

export async function processUploadedPdf(file) {
  if (!isPdfFile(file)) {
    throw new Error("Please upload a PDF file only.");
  }
  if (file.size === 0) {
    throw new Error("That PDF is empty.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw httpError("That PDF is too large. Please upload a file under 4.5 MB.", 413);
  }

  // Some browsers/OSes report an empty or non-standard MIME type for dropped
  // files; the server requires application/pdf, so normalize it.
  const pdf =
    file.type === "application/pdf"
      ? file
      : new File([file], file.name || "lecture.pdf", { type: "application/pdf" });

  const formData = new FormData();
  formData.append("file", pdf);

  let response;
  try {
    // Do NOT set 'Content-Type' when sending FormData; the browser adds the boundary.
    response = await fetch("/api/upload", { method: "POST", body: formData });
  } catch {
    throw new Error("Network error. Check your connection and try again.");
  }

  // A platform timeout / crash returns HTML, not JSON — don't let that mask the real error.
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    let message = data.error;
    if (!message) {
      if (response.status === 413) message = "That PDF is too large to upload.";
      else if (response.status === 504)
        message = "Generating the quiz timed out. Try a shorter PDF.";
      else message = `Server error (${response.status}). Please try again.`;
    }
    throw httpError(message, response.status);
  }

  if (!data.deck_id) {
    throw new Error("The quiz was created but no deck was returned.");
  }
  return data.deck_id;
}

// ================================
// QUIZ
// ================================

export async function submitCardReview(cardId, rating) {
  const response = await fetch("/api/cards", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardId, userScore: rating }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw httpError(result.error || `Review failed (${response.status})`, response.status);
  }
  return result;
}

export async function scheduleReviewSession({
  deckId,
  totalQuestions,
  mistakes,
}) {
  const response = await fetch("/api/calendar/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deckId, totalQuestions, mistakes }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = httpError(result.error || `Scheduling failed (${response.status})`, response.status);
    err.code = result.code;
    throw err;
  }
  return result;
}
