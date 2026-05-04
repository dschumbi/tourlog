import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateFees, dbRowToConfig, TOUR_TYPES, type TourKind } from "@/lib/tour-types";

export async function GET(req: NextRequest) {
  const yearParam = req.nextUrl.searchParams.get("year");
  const monthParam = req.nextUrl.searchParams.get("month");

  const now = new Date();
  const year = yearParam ? Number(yearParam) : now.getFullYear();
  const month = monthParam ? Number(monthParam) : now.getMonth() + 1;

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  const [tours, unbilledReviews, settings, dbTourTypes] = await Promise.all([
    prisma.tour.findMany({
      where: { date: { gte: monthStart, lt: monthEnd } },
      orderBy: { date: "asc" },
    }),
    prisma.tour.findMany({
      where: { date: { lt: monthStart }, fiveStarReviews: { gt: 0 }, reviewBilled: false },
      orderBy: { date: "asc" },
    }),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
    prisma.tourType.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const tourTypes = dbTourTypes.length > 0 ? dbTourTypes.map(dbRowToConfig) : TOUR_TYPES;
  const mvvSinglePrice = settings?.mvvSinglePrice ?? 0;
  const mvvGroupPrice = settings?.mvvGroupPrice ?? 0;
  const tourLabel = (id: string) => tourTypes.find((t) => t.id === id)?.label ?? id;

  const toursWithFees = tours.map((t) => {
    const fees = calculateFees({
      tourType: t.tourType,
      tourKind: t.tourKind as TourKind,
      paxCount: t.paxCount,
      hotelPickup: t.hotelPickup,
      fiveStarReviews: t.fiveStarReviews,
      cancellationWithin48h: t.cancellationWithin48h,
    }, tourTypes);
    const honorarNet = t.feeOverride ?? (fees.baseFee + fees.hotelPickupFee + fees.cancellationFee);
    const mvvGross = t.mvvSingleTickets * mvvSinglePrice + t.mvvGroupTickets * mvvGroupPrice;
    return {
      id: t.id,
      date: t.date.toLocaleDateString("de-DE"),
      tourLabel: tourLabel(t.tourType),
      paxCount: t.paxCount,
      honorarNet,
      mvvSingleTickets: t.mvvSingleTickets,
      mvvGroupTickets: t.mvvGroupTickets,
      mvvGross,
      cashCount: t.cashCount ?? 0,
      fiveStarReviews: t.fiveStarReviews,
    };
  });

  const reviewItems = [
    ...tours.filter(t => t.fiveStarReviews > 0).map(t => ({
      date: t.date.toLocaleDateString("de-DE"),
      tourLabel: tourLabel(t.tourType),
      fiveStarReviews: t.fiveStarReviews,
      reviewBonus: t.fiveStarReviews * 10,
      fromPrevMonth: false,
    })),
    ...unbilledReviews.map(t => ({
      date: t.date.toLocaleDateString("de-DE"),
      tourLabel: tourLabel(t.tourType),
      fiveStarReviews: t.fiveStarReviews,
      reviewBonus: t.fiveStarReviews * 10,
      fromPrevMonth: true,
    })),
  ];

  const honorarNet = toursWithFees.reduce((s, t) => s + t.honorarNet, 0);
  const honorarVat = honorarNet * 0.19;
  const honorarGross = honorarNet + honorarVat;

  const reviewTotal = reviewItems.reduce((s, r) => s + r.reviewBonus, 0);
  const reviewVat = reviewTotal * 0.19;
  const reviewGross = reviewTotal + reviewVat;

  const mvvPurchaseGross = toursWithFees.reduce((s, t) => s + t.mvvGross, 0);
  const mvvNet = mvvPurchaseGross / 1.07;
  const mvvVat = mvvNet * 0.19;
  const mvvBillingGross = mvvNet + mvvVat;

  const cashTotal = toursWithFees.reduce((s, t) => s + t.cashCount, 0);
  const amountDue = honorarGross + reviewGross + mvvBillingGross - cashTotal;

  return NextResponse.json({
    tours: toursWithFees,
    reviewItems,
    honorar: { net: honorarNet, vat: honorarVat, gross: honorarGross },
    reviews: { items: reviewItems, total: reviewTotal, vat: reviewVat, gross: reviewGross },
    mvv: { purchaseGross: mvvPurchaseGross, net: mvvNet, vat: mvvVat, billingGross: mvvBillingGross },
    cashTotal,
    amountDue,
  });
}
