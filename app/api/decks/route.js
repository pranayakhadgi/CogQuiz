import { getDueDecksByCategory } from "@/services/db";
import { errorResponse, readJsonBody, requireId } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

async function handle(categoryIdRaw, includeAllRaw) {
  const categoryId = requireId(categoryIdRaw, "categoryId");
  const includeAll = includeAllRaw === true || includeAllRaw === "true" || includeAllRaw === "1";
  const decks = await getDueDecksByCategory(categoryId, { includeAll });
  return Response.json({ success: true, decks });
}

// POST /api/decks { categoryId, includeAll? } -> decks in the category
// (only decks with due cards unless includeAll is true)
export async function POST(request) {
  try {
    const body = await readJsonBody(request);
    return await handle(body.categoryId, body.includeAll);
  } catch (e) {
    return errorResponse(e);
  }
}

// GET /api/decks?categoryId=ID[&includeAll=true] -> same as POST (read-only, cache-friendly)
export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    return await handle(params.get("categoryId"), params.get("includeAll"));
  } catch (e) {
    return errorResponse(e);
  }
}
