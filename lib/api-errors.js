// Shared error type + JSON error responses for route handlers.

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    if (code) this.code = code;
  }
}

export const NOT_AUTHENTICATED = "Not authenticated";

export function unauthorized() {
  return new HttpError(401, NOT_AUTHENTICATED, "UNAUTHENTICATED");
}

/** Map a thrown error (HttpError, Postgres/PostgREST error, other) to a Response. */
export function errorResponse(e, fallbackMessage = "Internal server error") {
  if (e instanceof HttpError) {
    if (e.status === 401) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }
    if (e.status >= 500) console.error(e);
    return Response.json({ error: e.message }, { status: e.status });
  }
  // Postgres "invalid input syntax" (e.g. malformed uuid/int id) -> 400.
  if (e && e.code === "22P02") {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  console.error(e);
  return Response.json({ error: e?.message || fallbackMessage }, { status: 500 });
}

/** Parse a JSON request body; throws a 400 HttpError on bad JSON / non-object. */
export async function readJsonBody(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Request body must be a JSON object");
  }
  return body;
}

/** Validate an id coming from the client (uuid or integer, as string/number). */
export function requireId(value, name = "id") {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return String(value);
  if (typeof value === "string") {
    const v = value.trim();
    if (v && v.length <= 64 && /^[A-Za-z0-9-]+$/.test(v)) return v;
  }
  throw new HttpError(400, `${name} is required`);
}
