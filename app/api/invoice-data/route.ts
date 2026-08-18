import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateFees, dbRowToConfig, TOUR_TYPES, type TourKind } from "@/lib/tour-types";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key !== process.env.INVOICE_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const yearParam = req.nextUrl.searchParams.get("year");
  const monthParam = req.nextUrl.searchParams.get("month");
  const correctsInvoiceIdParam = req.nextUrl.searchParams.get("correctsInvoiceId");

  const now = new Date();
  const year = yearParam ? Number(yearParam) : now.getFullYear();
  const month = monthParam ? Number(monthParam) : now.getMonth() + 1;

  let correctsInvoice = null;
  if (correctsInvoiceIdParam) {
    correctsInvoice = await prisma.invoice.findUnique({
      where: { id: Number(correctsInvoiceIdParam) },
      include: { corrections: true },
    });
    if (!correctsInvoice) {
      return NextResponse.json({ error: "Original invoice not found" }, { status: 404 });
    }
    if (correctsInvoice.year !== year || correctsInvoice.month !== month) {
      return NextResponse.json({ error: "year/month must match the original invoice" }, { status: 400 });
    }
  }

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  const [tours, unbilledReviews, expenses, settings, dbTourTypes] = await Promise.all([
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
    prisma.expense.findMany({
      where: { date: { gte: monthStart, lt: monthEnd } },
      orderBy: { date: "asc" },
    }),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
    prisma.tourType.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const tourTypes = dbTourTypes.length > 0 ? dbTourTypes.map(dbRowToConfig) : TOUR_TYPES;
  const mvvSinglePrice = settings?.mvvSinglePrice ?? 0;
  const mvvGroupPrice = settings?.mvvGroupPrice ?? 0;

  const tourLabel = (id: string) => tourTypes.find((t) => t.id === id)?.label ?? id;
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
    }, tourTypes);
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

  // Sonstige Auslagen: Einkauf brutto mit 7% oder 19%, Abrechnung netto + 19%
  const auslagenItems = expenses.map((e) => ({
    id: e.id,
    date: e.date.toLocaleDateString("de-DE"),
    description: e.description,
    grossAmount: e.grossAmount,
    vatRate: e.vatRate,
    net: e.grossAmount / (1 + e.vatRate / 100),
  }));
  const auslagenNet = auslagenItems.reduce((s, e) => s + e.net, 0);
  const auslagenVat19 = auslagenNet * 0.19;
  const auslagenBillingGross = auslagenNet + auslagenVat19;

  // Bargeld-Verrechnung
  const cashTotal = toursWithFees.reduce((s, t) => s + t.cashCount, 0);
  const amountDue = honorarGross + reviewGross + mvvBillingGross + auslagenBillingGross - cashTotal;

  const paymentDays = settings?.paymentDays ?? 14;
  const today = new Date();
  const dueD = new Date(today);
  dueD.setDate(dueD.getDate() + paymentDays);
  const invoiceDate = today.toLocaleDateString("de-DE");
  const dueDate = dueD.toLocaleDateString("de-DE");
  const amountDueFormatted = amountDue.toFixed(2).replace(".", ",") + " €";
  const prefix = settings?.invoicePrefix ?? "RE";
  const mPad = String(month).padStart(2, "0");
  const invoiceNumber = correctsInvoice
    ? `${correctsInvoice.invoiceNumber}-K${correctsInvoice.corrections.length + 1}`
    : `${prefix}-${year}-${mPad}`;

  return NextResponse.json({
    month, year, monthName,
    invoiceDate, dueDate, invoiceNumber, amountDueFormatted,
    ...(correctsInvoice ? {
      correction: {
        correctsInvoiceId: correctsInvoice.id,
        correctsInvoiceNumber: correctsInvoice.invoiceNumber,
        correctsInvoiceDate: correctsInvoice.invoiceDate.toLocaleDateString("de-DE"),
        typeCode: 384,
      },
    } : {}),
    owner: {
      name: settings?.ownerName ?? "",
      address: settings?.ownerAddress ?? "",
      city: settings?.ownerCity ?? "",
      email: settings?.ownerEmail ?? "",
      taxId: settings?.ownerTaxId ?? "",
    },
    bank: {
      name: settings?.bankName ?? "",
      iban: settings?.bankIban ?? "",
      bic: settings?.bankBic ?? "",
    },
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
    auslagen: { items: auslagenItems, net: auslagenNet, vat19: auslagenVat19, billingGross: auslagenBillingGross },
    cashTotal,
    amountDue,
    reviewTourIds,
    tours: toursWithFees,
  });
}
