import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const year = searchParams.get("year");
  const month = searchParams.get("month");

  const where =
    year && month
      ? {
          date: {
            gte: new Date(Number(year), Number(month) - 1, 1),
            lt: new Date(Number(year), Number(month), 1),
          },
        }
      : {};

  const tours = await prisma.tour.findMany({
    where,
    orderBy: { date: "desc" },
  });
  return NextResponse.json(tours);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const tour = await prisma.tour.create({
    data: {
      date: new Date(body.date),
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
  });
  return NextResponse.json(tour, { status: 201 });
}
