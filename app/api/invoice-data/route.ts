import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateFees, TOUR_TYPES, type TourKind } from "@/lib/tour-types";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key !== process.env.INVOICE_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const yearParam = req.nextUrl.searchParams.get("year");
  const monthParam = req.nextUrl.searchParams.get("month");

  const now = new Date();
  const year = yearParam ? Number(yearParam) : now.getFullYear();
  const month = monthParam ? Number(monthParam) : now.getMonth() + 1;

  const [tours, settings] = await Promise.all([
    prisma.tour.findMany({
      where: {
        date: {
          gte: new Date(year, month - 1, 1),
          lt: new Date(year, month, 1),
        },
      },
      orderBy: { date: "asc" },
    }),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
  ]);

  const tourLabel = (id: string) => TOUR_TYPES.find((t) => t.id === id)?.label ?? id;
  const monthName = new Date(year, month - 1).toLocaleDateString("de-DE", {
    month: "long", year: "numeric",
  });

  const toursWithFees = tours.map((t) => {
    const fees = calculateFees({
      tourType: t.tourType,
      tourKind: t.tourKind as TourKind,
      paxCount: t.paxCount,
      hotelPickup: t.hotelPickup,
      fiveStarReviews: t.fiveStarReviews,
      cancellationWithin48h: t.cancellationWithin48h,
    });
    return {
      date: t.date.toLocaleDateString("de-DE"),
      tourLabel: tourLabel(t.tourType),
      tourKind: t.tourKind,
      paxCount: t.paxCount,
      hotelPickup: t.hotelPickup,
      fiveStarReviews: t.fiveStarReviews,
      ...fees,
    };
  });

  const totalHonorar = toursWithFees.reduce((s, t) => s + t.baseFee + t.hotelPickupFee, 0);
  const totalReviews = toursWithFees.reduce((s, t) => s + t.reviewBonus, 0);
  const totalCancellation = toursWithFees.reduce((s, t) => s + t.cancellationFee, 0);
  const total = toursWithFees.reduce((s, t) => s + t.total, 0);

  return NextResponse.json({
    month, year, monthName, total,
    totalHonorar, totalReviews, totalCancellation,
    veranstalter: {
      name: settings?.clientName ?? "",
      address: settings?.clientAddress ?? "",
      city: settings?.clientCity ?? "",
      email: settings?.clientEmail ?? "",
    },
    rechnung: {
      prefix: settings?.invoicePrefix ?? "RE",
      paymentDays: settings?.paymentDays ?? 14,
    },
    tours: toursWithFees,
  });
}
