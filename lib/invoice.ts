import { prisma } from "@/lib/prisma";
import { calculateFees, dbRowToConfig, TOUR_TYPES, type TourKind } from "@/lib/tour-types";

// Einzige Quelle für alle Rechnungsbeträge. Deckblatt, Rechnungsseite (merge-pdf),
// invoice-data (→ n8n → E-Rechnung) und mark-invoice-issued lesen dieselben Zahlen.
//
// Rundung wie in EN 16931 / render-erechnung: jede Zeile wird auf Cent gerundet,
// Blocksummen sind die Summe der gerundeten Zeilen, die MwSt. wird einmal auf die
// gesamte Netto-Summe berechnet und gerundet.

export const VAT_RATE = 0.19;
export const REVIEW_BONUS = 10;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + x, 0));

// Bei einer Korrektur: Vormonats-Prämien der Originalrechnung sind dort schon als
// reviewBilled markiert und müssen über deren reviewTourIds wieder einbezogen werden.
export async function computeInvoiceAmounts(
  year: number,
  month: number,
  opts: { correctsReviewTourIds?: number[] } = {},
) {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  const [tours, unbilledReviews, expenses, settings, dbTourTypes] = await Promise.all([
    prisma.tour.findMany({
      where: { date: { gte: monthStart, lt: monthEnd } },
      orderBy: { date: "asc" },
    }),
    // Noch nicht verrechnete Sterne-Prämien aus Vormonaten (+ die der korrigierten Rechnung)
    prisma.tour.findMany({
      where: {
        date: { lt: monthStart },
        fiveStarReviews: { gt: 0 },
        OR: [{ reviewBilled: false }, { id: { in: opts.correctsReviewTourIds ?? [] } }],
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
    const mvvGross = round2(t.mvvSingleTickets * mvvSinglePrice + t.mvvGroupTickets * mvvGroupPrice);
    return {
      id: t.id,
      date: t.date.toLocaleDateString("de-DE"),
      tourLabel: tourLabel(t.tourType),
      paxCount: t.paxCount,
      fiveStarReviews: t.fiveStarReviews,
      honorarNet: round2(t.feeOverride ?? (fees.baseFee + fees.hotelPickupFee + fees.cancellationFee)),
      mvvSingleTickets: t.mvvSingleTickets,
      mvvGroupTickets: t.mvvGroupTickets,
      // MVV: Einkauf brutto mit 7 %, Abrechnung netto + 19 %
      mvvGross,
      mvvNet: round2(mvvGross / 1.07),
      cashCount: round2(t.cashCount ?? 0),
      mvvReceiptUrls: t.mvvReceiptUrls,
    };
  });

  // 5★ Prämien: aktueller Monat + unbezahlte Vormonatsprämien
  const reviewItems = [...tours.filter((t) => t.fiveStarReviews > 0), ...unbilledReviews].map((t) => ({
    id: t.id,
    date: t.date.toLocaleDateString("de-DE"),
    tourLabel: tourLabel(t.tourType),
    fiveStarReviews: t.fiveStarReviews,
    reviewBonus: round2(t.fiveStarReviews * REVIEW_BONUS),
  }));

  // Sonstige Auslagen: Einkauf brutto mit 7 % oder 19 %, Abrechnung netto + 19 %
  const auslagenItems = expenses.map((e) => ({
    id: e.id,
    date: e.date.toLocaleDateString("de-DE"),
    description: e.description,
    grossAmount: round2(e.grossAmount),
    vatRate: e.vatRate,
    net: round2(e.grossAmount / (1 + e.vatRate / 100)),
  }));

  const honorarNet = sum(toursWithFees.map((t) => t.honorarNet));
  const reviewTotal = sum(reviewItems.map((r) => r.reviewBonus));
  const mvvPurchaseGross = sum(toursWithFees.map((t) => t.mvvGross));
  const mvvNet = sum(toursWithFees.map((t) => t.mvvNet));
  const auslagenNet = sum(auslagenItems.map((e) => e.net));
  const cashTotal = sum(toursWithFees.map((t) => t.cashCount));

  const netTotal = sum([honorarNet, reviewTotal, mvvNet, auslagenNet]);
  const vatTotal = round2(netTotal * VAT_RATE);
  const grossTotal = sum([netTotal, vatTotal]);
  const amountDue = round2(grossTotal - cashTotal);

  return {
    settings,
    tours: toursWithFees,
    reviewItems,
    reviewTourIds: reviewItems.map((r) => r.id),
    auslagenItems,
    honorarNet,
    reviewTotal,
    mvvPurchaseGross,
    mvvNet,
    auslagenNet,
    cashTotal,
    netTotal,
    vatTotal,
    grossTotal,
    amountDue,
  };
}

export type InvoiceAmounts = Awaited<ReturnType<typeof computeInvoiceAmounts>>;

export const formatEuro = (n: number) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

export function defaultInvoiceDates(paymentDays: number) {
  const today = new Date();
  const due = new Date(today);
  due.setDate(due.getDate() + paymentDays);
  return { invoiceDate: today.toLocaleDateString("de-DE"), dueDate: due.toLocaleDateString("de-DE") };
}
