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

  const mvvSinglePrice = settings?.mvvSinglePrice ?? 0;
  const mvvGroupPrice = settings?.mvvGroupPrice ?? 0;

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
    const honorarNet = t.feeOverride ?? fees.total;
    const mvvGross = t.mvvSingleTickets * mvvSinglePrice + t.mvvGroupTickets * mvvGroupPrice;
    return {
      date: t.date.toLocaleDateString("de-DE"),
      tourLabel: tourLabel(t.tourType),
      tourKind: t.tourKind,
      paxCount: t.paxCount,
      hotelPickup: t.hotelPickup,
      fiveStarReviews: t.fiveStarReviews,
      baseFee: fees.baseFee,
      hotelPickupFee: fees.hotelPickupFee,
      reviewBonus: fees.reviewBonus,
      cancellationFee: fees.cancellationFee,
      honorarNet,
      mvvSingleTickets: t.mvvSingleTickets,
      mvvGroupTickets: t.mvvGroupTickets,
      mvvGross,
      cashCount: t.cashCount ?? 0,
      mvvReceiptUrls: t.mvvReceiptUrls,
      notes: t.notes,
    };
  });

  // Honorar (netto, 19% MwSt.)
  const honorarNet = toursWithFees.reduce((s, t) => s + t.honorarNet, 0);
  const honorarVat19 = honorarNet * 0.19;
  const honorarGross = honorarNet + honorarVat19;

  // MVV Auslagen: Einkauf brutto mit 7%, Abrechnung netto + 19%
  const mvvPurchaseGross = toursWithFees.reduce((s, t) => s + t.mvvGross, 0);
  const mvvNet = mvvPurchaseGross / 1.07;
  const mvvVat19 = mvvNet * 0.19;
  const mvvBillingGross = mvvNet + mvvVat19;

  // Bargeld-Verrechnung
  const cashTotal = toursWithFees.reduce((s, t) => s + t.cashCount, 0);

  const amountDue = honorarGross + mvvBillingGross - cashTotal;

  // Belege als base64 einbetten damit html2pdf keine externen URLs laden muss
  async function toBase64Img(url: string): Promise<string> {
    try {
      const res = await fetch(url);
      const buffer = await res.arrayBuffer();
      const mime = res.headers.get("content-type") ?? "image/jpeg";
      return `<img src="data:${mime};base64,${Buffer.from(buffer).toString("base64")}" style="max-width:100%;margin-bottom:12px;display:block;border:1px solid #eee;">`;
    } catch {
      return "";
    }
  }

  const allReceiptUrls = toursWithFees.flatMap(t => t.mvvReceiptUrls).filter(Boolean);
  const receiptImgTags = (await Promise.all(allReceiptUrls.map(toBase64Img))).join("");

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
    mvv: {
      purchaseGross: mvvPurchaseGross,
      net: mvvNet,
      vat19: mvvVat19,
      billingGross: mvvBillingGross,
    },
    cashTotal,
    amountDue,
    receiptImgTags,
    tours: toursWithFees,
  });
}
