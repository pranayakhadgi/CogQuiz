import { getAllCategories } from "@/services/db";
import { errorResponse } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const categories = await getAllCategories();
    // `category` is kept for the existing frontend; `categories` is the clearer name.
    return Response.json({ success: true, categories, category: categories });
  } catch (e) {
    return errorResponse(e);
  }
}
