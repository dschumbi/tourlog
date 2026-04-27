import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key !== process.env.INVOICE_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tourIds } = await req.json();
  if (!Array.isArray(tourIds) || tourIds.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const result = await prisma.tour.updateMany({
    where: { id: { in: tourIds } },
    data: { reviewBilled: true },
  });

  return NextResponse.json({ updated: result.count });
}
