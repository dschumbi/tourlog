import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tour = await prisma.tour.findUnique({
    where: { id: Number(id) },
    include: { tourGuests: { include: { country: true }, orderBy: { country: { name: "asc" } } } },
  });
  if (!tour) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(tour);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const tourGuests: { countryId: number; guestCount: number; tip: number }[] = body.tourGuests ?? [];

  const [tour] = await prisma.$transaction([
    prisma.tour.update({
      where: { id: Number(id) },
      data: {
        date: body.date ? new Date(body.date) : undefined,
        tourType: body.tourType,
        tourKind: body.tourKind,
        paxCount: body.paxCount ?? null,
        hotelPickup: body.hotelPickup ?? false,
        fiveStarReviews: body.fiveStarReviews ?? 0,
        cancellationWithin48h: body.cancellationWithin48h ?? false,
        cashCount: body.cashCount ?? null,
        mvvSingleTickets: body.mvvSingleTickets ?? 0,
        mvvGroupTickets: body.mvvGroupTickets ?? 0,
        mvvReceiptUrls: body.mvvReceiptUrls ?? [],
        feeOverride: body.feeOverride ?? null,
        notes: body.notes ?? null,
      },
    }),
    prisma.tourGuest.deleteMany({ where: { tourId: Number(id) } }),
    ...tourGuests.map((g) =>
      prisma.tourGuest.create({
        data: { tourId: Number(id), countryId: g.countryId, guestCount: g.guestCount, tip: g.tip },
      })
    ),
  ]);
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
