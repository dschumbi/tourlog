import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { calculateFees, dbRowToConfig, TOUR_TYPES, type TourKind } from "@/lib/tour-types";

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key !== process.env.INVOICE_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const year = req.nextUrl.searchParams.get("year")
    ? Number(req.nextUrl.searchParams.get("year"))
    : new Date().getFullYear();
  const month = req.nextUrl.searchParams.get("month")
    ? Number(req.nextUrl.searchParams.get("month"))
    : new Date().getMonth() + 1;

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const mPad = String(month).padStart(2, "0");

  const invoicePdfBytes = await req.arrayBuffer();

  const [tours, unbilledReviews, settings, dbTourTypes] = await Promise.all([
    prisma.tour.findMany({
      where: { date: { gte: monthStart, lt: monthEnd } },
      orderBy: { date: "asc" },
    }),
    prisma.tour.findMany({
      where: { date: { lt: monthStart }, fiveStarReviews: { gt: 0 }, reviewBilled: false },
    }),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
    prisma.tourType.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const tourTypes = dbTourTypes.length > 0 ? dbTourTypes.map(dbRowToConfig) : TOUR_TYPES;

  // Beträge für Deckblatt berechnen
  const mvvSinglePrice = settings?.mvvSinglePrice ?? 0;
  const mvvGroupPrice = settings?.mvvGroupPrice ?? 0;
  let honorarNet = 0;
  let mvvPurchaseGross = 0;
  let cashTotal = 0;

  for (const t of tours) {
    const fees = calculateFees({
      tourType: t.tourType,
      tourKind: t.tourKind as TourKind,
      paxCount: t.paxCount,
      hotelPickup: t.hotelPickup,
      fiveStarReviews: t.fiveStarReviews,
      cancellationWithin48h: t.cancellationWithin48h,
    }, tourTypes);
    honorarNet += t.feeOverride ?? (fees.baseFee + fees.hotelPickupFee + fees.cancellationFee);
    mvvPurchaseGross += t.mvvSingleTickets * mvvSinglePrice + t.mvvGroupTickets * mvvGroupPrice;
    cashTotal += t.cashCount ?? 0;
  }

  const reviewTotal = [
    ...tours.filter(t => t.fiveStarReviews > 0),
    ...unbilledReviews,
  ].reduce((s, t) => s + t.fiveStarReviews * 10, 0);

  const amountDue =
    honorarNet * 1.19 +
    reviewTotal * 1.19 +
    (mvvPurchaseGross / 1.07) * 1.19 -
    cashTotal;

  const paymentDays = settings?.paymentDays ?? 14;
  const dueD = new Date();
  dueD.setDate(dueD.getDate() + paymentDays);
  const dueDate = dueD.toLocaleDateString("de-DE");

  const prefix = settings?.invoicePrefix ?? "RE";
  const invoiceNumber = `${prefix}-${year}-${mPad}-001`;
  const fmt = (n: number) => n.toFixed(2).replace(".", ",") + " €";

  // ---- Deckblatt (DIN 5008 Sichtfensterposition) ----
  const mm = (n: number) => n * 2.8346; // mm → pt
  const A4w = 595.28;
  const A4h = 841.89;

  const coverDoc = await PDFDocument.create();
  const page = coverDoc.addPage([A4w, A4h]);
  const regular = await coverDoc.embedFont(StandardFonts.Helvetica);
  const bold = await coverDoc.embedFont(StandardFonts.HelveticaBold);

  // Absenderzeile (DIN 5008: 27 mm vom oberen Rand, über dem Sichtfenster)
  const senderLine = [settings?.ownerName, settings?.ownerAddress, settings?.ownerCity]
    .filter(Boolean)
    .join(" · ");
  page.drawText(senderLine, {
    x: mm(20), y: A4h - mm(27),
    size: 7, font: regular, color: rgb(0.45, 0.45, 0.45),
  });

  // Trennlinie unter Absenderzeile
  page.drawLine({
    start: { x: mm(20), y: A4h - mm(30) },
    end:   { x: mm(20) + mm(85), y: A4h - mm(30) },
    thickness: 0.3, color: rgb(0.7, 0.7, 0.7),
  });

  // Empfängeradresse (Sichtfenster: 40–67 mm vom oberen Rand, 20 mm vom linken Rand)
  const addrLines = [
    settings?.clientName ?? "",
    settings?.clientAddress ?? "",
    settings?.clientCity ?? "",
  ].filter(Boolean);

  addrLines.forEach((line, i) => {
    page.drawText(line, {
      x: mm(20),
      y: A4h - mm(40) - i * mm(6.5),
      size: 11,
      font: i === 0 ? bold : regular,
      color: rgb(0, 0, 0),
    });
  });

  // Betreff (ab 100 mm)
  let y = A4h - mm(100);
  page.drawText(`Rechnung ${invoiceNumber}`, {
    x: mm(25), y,
    size: 14, font: bold, color: rgb(0, 0, 0),
  });
  y -= mm(5);

  // Trennlinie
  page.drawLine({
    start: { x: mm(25), y },
    end:   { x: A4w - mm(25), y },
    thickness: 0.5, color: rgb(0.3, 0.3, 0.3),
  });
  y -= mm(10);

  // Überweisungsbox (Rahmen)
  const boxTop = y + mm(4);
  const boxRows: [string, string][] = [
    ["Betrag:",          fmt(amountDue)],
    ["Zahlungsziel:",    dueDate],
    ["",                 ""],
    ["Empfänger:",       settings?.bankName ?? ""],
    ["IBAN:",            settings?.bankIban ?? ""],
    ["BIC:",             settings?.bankBic ?? ""],
    ["Verwendungszweck:", invoiceNumber],
  ];
  const lineH = mm(7);
  const boxH = boxRows.length * lineH + mm(10);

  page.drawRectangle({
    x: mm(25), y: boxTop - boxH,
    width: A4w - mm(50), height: boxH,
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 0.5,
    color: rgb(0.97, 0.97, 0.97),
  });

  y -= mm(2);
  for (const [label, value] of boxRows) {
    if (!label && !value) { y -= mm(3); continue; }
    page.drawText(label, {
      x: mm(30), y,
      size: 10, font: bold, color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(value, {
      x: mm(30) + mm(55), y,
      size: 10, font: regular, color: rgb(0, 0, 0),
    });
    y -= lineH;
  }

  // ---- Zusammenführen: Deckblatt + Rechnung + Belege ----
  const mergedPdf = await PDFDocument.create();

  const [coverP] = await mergedPdf.copyPages(coverDoc, [0]);
  mergedPdf.addPage(coverP);

  const invoicePdf = await PDFDocument.load(invoicePdfBytes);
  const invPages = await mergedPdf.copyPages(invoicePdf, invoicePdf.getPageIndices());
  invPages.forEach(p => mergedPdf.addPage(p));

  const receiptUrls = tours.flatMap(t => t.mvvReceiptUrls).filter(Boolean);
  for (const url of receiptUrls) {
    try {
      const res = await fetch(url);
      const bytes = await res.arrayBuffer();
      const mime = res.headers.get("content-type") ?? "";

      if (mime.includes("pdf")) {
        const srcDoc = await PDFDocument.load(bytes);
        const pages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
        pages.forEach(p => mergedPdf.addPage(p));
      } else if (mime.includes("png")) {
        const img = await mergedPdf.embedPng(bytes);
        const imgPage = mergedPdf.addPage([img.width, img.height]);
        imgPage.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      } else {
        const img = await mergedPdf.embedJpg(bytes);
        const imgPage = mergedPdf.addPage([img.width, img.height]);
        imgPage.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      }
    } catch {
      // Einzelner Beleg schlägt fehl → überspringen
    }
  }

  const mergedBytes = await mergedPdf.save();

  return new NextResponse(Buffer.from(mergedBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Rechnung-${year}-${mPad}.pdf"`,
    },
  });
}
