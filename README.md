# CogQuiz

An intelligent learning platform that leverages spaced repetition and generative AI to optimize studying workflows. Built with Next.js, the application automates flashcard creation from PDF documents and schedules review sessions dynamically using the SM-2 algorithm.

## Core Features

- **Automated Spaced Repetition**: Implements the SM-2 algorithm to dynamically calculate optimal review intervals based on user performance, ensuring maximum retention.
- **AI-Powered Content Generation**: Extracts structured data from user-uploaded PDFs to automatically synthesize accurate study materials and flashcards using Google's Generative AI.
- **Calendar Integration**: Seamlessly syncs with Google Calendar API to schedule prioritized review sessions while resolving time-slot conflicts.
- **Real-time Synchronization**: Built on Supabase for robust, low-latency data persistence and state management across user sessions.

## Technical Architecture

- **Framework**: Next.js (App Router)
- **Database**: Supabase
- **Styling**: Tailwind CSS
- **Integrations**: Google Calendar API, Google Generative AI API
- **File Processing**: React Dropzone

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- Supabase Project
- Google Cloud Console project with Calendar API enabled
- Google Gemini API Key

### Installation

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables. Create a `.env.local` file in the root directory (never commit it; `.env*` is git-ignored):

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
GOOGLE_CALENDAR_CLIENT_ID=your_client_id
GOOGLE_CALENDAR_CLIENT_SECRET=your_client_secret
GEMINI_API_KEY=your_gemini_api_key
```

   (`GOOGLE_AI_API_KEY` is still accepted as a fallback name for the Gemini key.)

   - `NEXT_PUBLIC_*` values are inlined **at build time**. After adding or changing them in Vercel you must redeploy.
   - `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET` must be the **same Google OAuth client** configured in Supabase's Google provider. They are used server-side to refresh the Google access token, because Supabase does not persist `provider_token` across session refreshes.

3. Configure Supabase auth for every environment you deploy to. In **Supabase → Authentication → URL Configuration**:
   - **Site URL**: your production domain (e.g. `https://cog-quiz.vercel.app`)
   - **Redirect URLs**: add `http://localhost:3000/auth/callback` and `https://cog-quiz.vercel.app/auth/callback` (plus `https://*-<team>.vercel.app/auth/callback` for preview deploys)
   - In **Authentication → Providers → Google**, enable Google and paste the Google OAuth client ID/secret. In **Google Cloud Console → APIs & Services → Credentials**, that OAuth client must list `https://<project>.supabase.co/auth/v1/callback` as an authorized redirect URI and `https://cog-quiz.vercel.app` as an authorized JavaScript origin.
   - In **Google Cloud Console**, enable the Google Calendar API and add the `https://www.googleapis.com/auth/calendar.events` scope to the OAuth consent screen. While the consent screen is in "Testing", only listed test users can sign in; publish it for general use.

   Set the same env vars in **Vercel → Project → Settings → Environment Variables** for Production (and Preview if used).

   Health check: `GET /api/health` returns `200 {status:"ok"}` when Supabase is reachable, `503` otherwise.

4. Start the development server:

```bash
npm run dev
```

## System Design Considerations

- **Scheduling Logic**: The SM-2 implementation accounts for mistake frequency, adjusting intervals strictly based on quantitative performance metrics to avoid cognitive overload.
- **API Design**: Next.js Route handlers (`/api/calendar/schedule`, `/api/upload`) are constructed to securely manage external service integrations and handle asynchronous file processing without blocking the main thread.
