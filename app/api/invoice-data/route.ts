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

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  const [tours, unbilledReviews, settings] = await Promise.all([
    prisma.tour.findMany({
      where: { date: { gte: monthStart, lt: monthEnd } },
      orderBy: { date: "asc" },
    }),
    // Noch nicht verrechnete Sterne-Prämien aus Vormonaten
    prisma.tour.findMany({
      where: {
        date: { lt: monthStart },
        fiveStarReviews: { gt: 0 },
        reviewBilled: false,
      },
      orderBy: { date: "asc" },
    }),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
  ]);

  const mvvSinglePrice = settings?.mvvSinglePrice ?? 0;
  const mvvGroupPrice = settings?.mvvGroupPrice ?? 0;

  const tourLabel = (id: string) => TOUR_TYPES.find((t) => t.id === id)?.label ?? id;
  const monthName = new Date(year, month - 1).toLocaleDateString("de-DE", {
    month: "long", year: "numeric",
  });

  // Aktuelle Monatstouren — reviewBonus wird NICHT ins Honorar eingerechnet
  const toursWithFees = tours.map((t) => {
    const fees = calculateFees({
      tourType: t.tourType,
      tourKind: t.tourKind as TourKind,
      paxCount: t.paxCount,
      hotelPickup: t.hotelPickup,
      fiveStarReviews: t.fiveStarReviews,
      cancellationWithin48h: t.cancellationWithin48h,
    });
    const honorarNet = t.feeOverride ?? (fees.baseFee + fees.hotelPickupFee + fees.cancellationFee);
    const mvvGross = t.mvvSingleTickets * mvvSinglePrice + t.mvvGroupTickets * mvvGroupPrice;
    return {
      id: t.id,
      date: t.date.toLocaleDateString("de-DE"),
      tourLabel: tourLabel(t.tourType),
      paxCount: t.paxCount,
      fiveStarReviews: t.fiveStarReviews,
      honorarNet,
      mvvSingleTickets: t.mvvSingleTickets,
      mvvGroupTickets: t.mvvGroupTickets,
      mvvGross,
      cashCount: t.cashCount ?? 0,
    };
  });

  // 5★ Prämien: aktuelle Monat + unbezahlte Vormonatsprämien
  const reviewItems = [
    ...tours.filter(t => t.fiveStarReviews > 0).map(t => ({
      id: t.id,
      date: t.date.toLocaleDateString("de-DE"),
      tourLabel: tourLabel(t.tourType),
      fiveStarReviews: t.fiveStarReviews,
      reviewBonus: t.fiveStarReviews * 10,
    })),
    ...unbilledReviews.map(t => ({
      id: t.id,
      date: t.date.toLocaleDateString("de-DE"),
      tourLabel: tourLabel(t.tourType),
      fiveStarReviews: t.fiveStarReviews,
      reviewBonus: t.fiveStarReviews * 10,
    })),
  ];
  const reviewTotal = reviewItems.reduce((s, r) => s + r.reviewBonus, 0);
  const reviewTourIds = reviewItems.map(r => r.id);

  // Honorar (netto, 19% MwSt.) — ohne Reviews
  const honorarNet = toursWithFees.reduce((s, t) => s + t.honorarNet, 0);
  const honorarVat19 = honorarNet * 0.19;
  const honorarGross = honorarNet + honorarVat19;

  // 5★ Prämien (netto, 19% MwSt.)
  const reviewVat19 = reviewTotal * 0.19;
  const reviewGross = reviewTotal + reviewVat19;

  // MVV Auslagen: Einkauf brutto mit 7%, Abrechnung netto + 19%
  const mvvPurchaseGross = toursWithFees.reduce((s, t) => s + t.mvvGross, 0);
  const mvvNet = mvvPurchaseGross / 1.07;
  const mvvVat19 = mvvNet * 0.19;
  const mvvBillingGross = mvvNet + mvvVat19;

  // Bargeld-Verrechnung
  const cashTotal = toursWithFees.reduce((s, t) => s + t.cashCount, 0);

  return NextResponse.json({
    month, year, monthName,
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
    honorar: { net: honorarNet, vat19: honorarVat19, gross: honorarGross },
    reviews: { items: reviewItems, total: reviewTotal, vat19: reviewVat19, gross: reviewGross },
    mvv: { purchaseGross: mvvPurchaseGross, net: mvvNet, vat19: mvvVat19, billingGross: mvvBillingGross },
    cashTotal,
    amountDue: honorarGross + reviewGross + mvvBillingGross - cashTotal,
    reviewTourIds,
    tours: toursWithFees,
  });
}
