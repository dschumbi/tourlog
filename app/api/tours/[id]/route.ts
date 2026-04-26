import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tour = await prisma.tour.findUnique({ where: { id: Number(id) } });
  if (!tour) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(tour);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const tour = await prisma.tour.update({
    where: { id: Number(id) },
    data: {
      date: body.date ? new Date(body.date) : undefined,
      tourType: body.tourType,
      tourKind: body.tourKind,
      paxCount: body.paxCount ?? null,
      hotelPickup: body.hotelPickup ?? false,
      fiveStarReviews: body.fiveStarReviews ?? 0,
      cancellationWithin48h: body.cancellationWithin48h ?? false,
      notes: body.notes ?? null,
    },
  });
  return NextResponse.json(tour);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.tour.delete({ where: { id: Number(id) } });
  return new NextResponse(null, { status: 204 });
}
