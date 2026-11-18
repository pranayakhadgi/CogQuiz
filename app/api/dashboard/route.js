import { getDashboardData } from "@/services/db";
import { errorResponse } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getDashboardData();
    return Response.json({ success: true, data });
  } catch (e) {
    return errorResponse(e);
  }
}
