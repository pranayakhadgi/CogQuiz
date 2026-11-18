import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase-server';
import {
    GOOGLE_ACCESS_COOKIE,
    GOOGLE_REFRESH_COOKIE,
    setGoogleTokenCookies,
    clearGoogleTokenCookies,
} from '@/app/auth/google-tokens';

/**
 * Calculates the final scheduled interval based on the user's mistakes.
 * 
 * @param {number} mistakes - The number of mistakes the user made during the quiz.
 * @param {number} baseInterval - The default algorithm-calculated interval.
 * @returns {number} The final interval in days, strictly clamped between 1 and 6 days.
 * 
 * Logic:
 * - If the user makes more than 1 mistake, they are penalized by subtracting 1 day from the interval.
 * - The returned value will never be less than 1 or greater than 6.
 */
function calculateScheduledInterval(mistakes, baseInterval) {
    let interval = baseInterval;
    if (mistakes > 1) {
        interval -= 1;
    }
    if (interval < 1) interval = 1;
    if (interval > 6) interval = 6;
    return interval;
}

const TIME_ZONE = 'America/Chicago';
const EVENT_SUMMARY = 'CogQuiz Review Session';
// Older events were created under the previous project name; treat them as duplicates too.
const KNOWN_SUMMARIES = new Set([EVENT_SUMMARY, 'HackBase Review Session']);

/** Calendar date (y, m, d) of `date` as seen in `timeZone`. */
function datePartsInZone(date, timeZone) {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(date).map((p) => [p.type, p.value])
    );
    return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}

/** Offset of `timeZone` from UTC at instant `date`, in minutes (Chicago: -300 / -360). */
function zoneOffsetMinutes(date, timeZone) {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone, hourCycle: 'h23',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        }).formatToParts(date).map((p) => [p.type, p.value])
    );
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** UTC instant of local wall-clock midnight y-m-d in `timeZone` (DST-safe). */
function zonedMidnightToUtc(y, m, d, timeZone) {
    const guess = Date.UTC(y, m - 1, d);
    let t = guess - zoneOffsetMinutes(new Date(guess), timeZone) * 60000;
    const corrected = guess - zoneOffsetMinutes(new Date(t), timeZone) * 60000;
    if (corrected !== t) t = corrected;
    return new Date(t);
}

const pad = (n) => String(n).padStart(2, '0');

function isAuthError(error) {
    const status = error?.code ?? error?.response?.status ?? error?.status;
    const reason = error?.response?.data?.error;
    const message = String(error?.message || '');
    // 401 / invalid_grant: token expired or revoked. 403 only when it's a scope problem
    // (not e.g. a rate limit, which also uses 403).
    return status === 401
        || reason === 'invalid_grant'
        || (status === 403 && /insufficient|scope/i.test(message));
}

function reauthResponse(message) {
    return Response.json(
        { error: message, code: 'GOOGLE_REAUTH_REQUIRED' },
        { status: 403 }
    );
}

/**
 * POST endpoint to schedule a Google Calendar review event for the user.
 *
 * Expected Body payload: { deckId, totalQuestions, mistakes }
 *
 * 1. Verifies the Supabase user (getUser, which validates the JWT server-side).
 * 2. Finds a Google access token: the httpOnly cookie written by /auth/callback, the
 *    session's provider_token (only present right after sign-in), or a refresh using
 *    the stored Google refresh token. Supabase does not persist provider tokens, so if
 *    none is available we return 403 GOOGLE_REAUTH_REQUIRED and the client should ask
 *    the user to sign in with Google again.
 * 3. Computes the review date in America/Chicago and checks that whole local day for
 *    an existing review event before creating a 30-minute block at 9:00 AM.
 */
export async function POST(request) {
    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const mistakes = Number(body?.mistakes);
    if (!Number.isInteger(mistakes) || mistakes < 0) {
        return Response.json({ error: 'mistakes must be a non-negative integer' }, { status: 400 });
    }

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return Response.json({ error: 'Not logged in' }, { status: 401 });
        }

        const cookieStore = await cookies();
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = cookieStore.get(GOOGLE_ACCESS_COOKIE)?.value || session?.provider_token || null;
        const refreshToken = cookieStore.get(GOOGLE_REFRESH_COOKIE)?.value || session?.provider_refresh_token || null;

        const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
        const canRefresh = Boolean(refreshToken && clientId && clientSecret);

        if (!accessToken && !canRefresh) {
            return reauthResponse('Google Calendar access has expired. Please sign in with Google again.');
        }

        let baseInterval;
        if (mistakes === 0) {
            baseInterval = 6;
        } else if (mistakes === 1) {
            baseInterval = 4;
        } else if (mistakes <= 3) {
            baseInterval = 2;
        } else {
            baseInterval = 1;
        }
        const intervalDays = calculateScheduledInterval(mistakes, baseInterval);

        // Target day = "today in Chicago" + intervalDays (not the UTC day, which is
        // already tomorrow every evening in Chicago).
        const today = datePartsInZone(new Date(), TIME_ZONE);
        const target = new Date(Date.UTC(today.y, today.m - 1, today.d + intervalDays));
        const ty = target.getUTCFullYear(), tm = target.getUTCMonth() + 1, td = target.getUTCDate();
        const dateStr = `${ty}-${pad(tm)}-${pad(td)}`;
        const nextDay = new Date(Date.UTC(ty, tm - 1, td + 1));
        const timeMin = zonedMidnightToUtc(ty, tm, td, TIME_ZONE).toISOString();
        const timeMax = zonedMidnightToUtc(
            nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate(), TIME_ZONE
        ).toISOString();

        const oauth2Client = canRefresh
            ? new google.auth.OAuth2(clientId, clientSecret)
            : new google.auth.OAuth2();
        oauth2Client.setCredentials({
            ...(accessToken ? { access_token: accessToken } : {}),
            ...(canRefresh ? { refresh_token: refreshToken } : {}),
        });
        // Persist a refreshed access token so we don't refresh on every request.
        oauth2Client.on('tokens', (tokens) => {
            setGoogleTokenCookies(cookieStore, {
                provider_token: tokens.access_token,
                provider_refresh_token: tokens.refresh_token,
            });
        });

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        try {
            const eventsResponse = await calendar.events.list({
                calendarId: 'primary',
                timeMin,
                timeMax,
                q: 'Review Session',
                singleEvents: true,
            });

            const existing = (eventsResponse.data.items || []).filter((e) => KNOWN_SUMMARIES.has(e.summary));
            if (existing.length > 0) {
                return Response.json({ merged: true, scheduled: false, date: dateStr, intervalDays, mistakes });
            }

            await calendar.events.insert({
                calendarId: 'primary',
                requestBody: {
                    summary: EVENT_SUMMARY,
                    start: { dateTime: `${dateStr}T09:00:00`, timeZone: TIME_ZONE },
                    end: { dateTime: `${dateStr}T09:30:00`, timeZone: TIME_ZONE },
                },
            });
        } catch (error) {
            if (isAuthError(error)) {
                console.error('Google Calendar auth error:', error?.message);
                clearGoogleTokenCookies(cookieStore);
                return reauthResponse('Google Calendar access was revoked or expired. Please sign in with Google again.');
            }
            throw error;
        }

        return Response.json({ scheduled: true, merged: false, date: dateStr, intervalDays, mistakes });
    } catch (error) {
        console.error('Calendar schedule error:', error);
        return Response.json({ error: 'Failed to schedule review session' }, { status: 502 });
    }
}
