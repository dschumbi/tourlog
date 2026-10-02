import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { computeInvoiceAmounts, defaultInvoiceDates, formatEuro as fmt, round2, type InvoiceAmounts } from "@/lib/invoice";

// Erzeugt die komplette Rechnungs-PDF: Deckblatt + Rechnungsseite(n) + MVV-Belege.
// Alle Beträge kommen aus computeInvoiceAmounts() — Deckblatt und Rechnung können
// dadurch nicht mehr auseinanderlaufen. Ein evtl. mitgeschickter Request-Body
// (früher die in n8n gerenderte Rechnungs-PDF) wird ignoriert.

const mm = (n: number) => n * 2.8346; // mm → pt
const A4w = 595.28;
const A4h = 841.89;
const MARGIN_X = mm(20);
const CONTENT_W = A4w - 2 * MARGIN_X;
const FOOTER_TOP = mm(34); // Inhalt endet oberhalb des Footers

const BLACK = rgb(0, 0, 0);
const DARK = rgb(0.2, 0.2, 0.2);
const GREY = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.8, 0.8, 0.8);
const HEAD_BG = rgb(0.94, 0.94, 0.94);
const RED = rgb(0.75, 0, 0);

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key !== process.env.INVOICE_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const year = params.get("year") ? Number(params.get("year")) : new Date().getFullYear();
  const month = params.get("month") ? Number(params.get("month")) : new Date().getMonth() + 1;
  const correctsInvoiceNumber = params.get("correctsInvoiceNumber");
  const correctsInvoiceDate = params.get("correctsInvoiceDate");
  const mPad = String(month).padStart(2, "0");

  const correctsInvoice = correctsInvoiceNumber
    ? await prisma.invoice.findUnique({ where: { invoiceNumber: correctsInvoiceNumber } })
    : null;
  const a = await computeInvoiceAmounts(year, month, {
    correctsReviewTourIds: correctsInvoice?.reviewTourIds,
  });
  const settings = a.settings;

  const defaults = defaultInvoiceDates(settings?.paymentDays ?? 14);
  const prefix = settings?.invoicePrefix ?? "RE";
  const meta: InvoiceMeta = {
    invoiceNumber: params.get("invoiceNumber") ?? `${prefix}-${year}-${mPad}`,
    invoiceDate: params.get("invoiceDate") ?? defaults.invoiceDate,
    dueDate: params.get("dueDate") ?? defaults.dueDate,
    monthName: new Date(year, month - 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" }),
    correction: correctsInvoiceNumber
      ? `Korrektur zu Rechnung ${correctsInvoiceNumber} vom ${correctsInvoiceDate ?? ""}`
      : null,
  };

  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold, charset: new Set(regular.getCharacterSet()) };

  drawCover(doc, fonts, a, meta);
  drawInvoice(doc, fonts, a, meta);

  // ---- MVV-Belege anhängen ----
  const receiptUrls = a.tours.flatMap((t) => t.mvvReceiptUrls).filter(Boolean);
  for (const url of receiptUrls) {
    try {
      const res = await fetch(url);
      const bytes = await res.arrayBuffer();
      const mime = res.headers.get("content-type") ?? "";

      if (mime.includes("pdf")) {
        const srcDoc = await PDFDocument.load(bytes);
        const pages = await doc.copyPages(srcDoc, srcDoc.getPageIndices());
        pages.forEach((p) => doc.addPage(p));
      } else {
        const img = mime.includes("png") ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const imgPage = doc.addPage([img.width, img.height]);
        imgPage.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      }
    } catch {
      // Einzelner Beleg schlägt fehl → überspringen
    }
  }

  const bytes = await doc.save();

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Rechnung-${year}-${mPad}.pdf"`,
    },
  });
}

type Fonts = { regular: PDFFont; bold: PDFFont; charset: Set<number> };
type InvoiceMeta = {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  monthName: string;
  correction: string | null;
};

// Standard-Fonts können nur WinAnsi — alles andere (Emoji, ★ …) würde pdf-lib crashen lassen
function clean(fonts: Fonts, s: string | null | undefined) {
  return Array.from(s ?? "")
    .map((ch) => (fonts.charset.has(ch.codePointAt(0)!) ? ch : "?"))
    .join("");
}

function text(
  page: PDFPage, fonts: Fonts, s: string, x: number, y: number,
  opts: { size?: number; bold?: boolean; color?: RGB; align?: "left" | "right"; maxWidth?: number } = {},
) {
  const font = opts.bold ? fonts.bold : fonts.regular;
  const size = opts.size ?? 9;
  let str = clean(fonts, s);
  if (opts.maxWidth && font.widthOfTextAtSize(str, size) > opts.maxWidth) {
    while (str.length > 1 && font.widthOfTextAtSize(str + "…", size) > opts.maxWidth) str = str.slice(0, -1);
    str += "…";
  }
  const w = font.widthOfTextAtSize(str, size);
  page.drawText(str, { x: opts.align === "right" ? x - w : x, y, size, font, color: opts.color ?? BLACK });
}

function hline(page: PDFPage, x1: number, x2: number, y: number, thickness = 0.5, color = LINE) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
}

// ---- Deckblatt (DIN 5008 Sichtfensterposition) ----
function drawCover(doc: PDFDocument, fonts: Fonts, a: InvoiceAmounts, meta: InvoiceMeta) {
  const s = a.settings;
  const page = doc.addPage([A4w, A4h]);

  drawAddressBlock(page, fonts, a);

  // Betreff (ab 100 mm)
  let y = A4h - mm(100);
  text(page, fonts, `Rechnung ${meta.invoiceNumber}`, mm(25), y, { size: 14, bold: true });
  y -= mm(5);
  if (meta.correction) {
    text(page, fonts, meta.correction, mm(25), y, { size: 10, color: rgb(0.3, 0.3, 0.3) });
    y -= mm(6);
  }

  hline(page, mm(25), A4w - mm(25), y, 0.5, rgb(0.3, 0.3, 0.3));
  y -= mm(10);

  // Überweisungsbox (Rahmen)
  const boxTop = y + mm(4);
  const boxRows: [string, string][] = [
    ["Rechnungsdatum:", meta.invoiceDate],
    ["Betrag:", fmt(a.amountDue)],
    ["Zahlungsziel:", meta.dueDate],
    ["", ""],
    ["Empfänger:", s?.bankName ?? ""],
    ["IBAN:", s?.bankIban ?? ""],
    ["BIC:", s?.bankBic ?? ""],
    ["Verwendungszweck:", meta.invoiceNumber],
  ];
  const lineH = mm(7);
  const boxH = boxRows.length * lineH + mm(10);

  page.drawRectangle({
    x: mm(25), y: boxTop - boxH,
    width: A4w - mm(50), height: boxH,
    borderColor: LINE, borderWidth: 0.5, color: rgb(0.97, 0.97, 0.97),
  });

  y -= mm(2);
  for (const [label, value] of boxRows) {
    if (!label && !value) { y -= mm(3); continue; }
    text(page, fonts, label, mm(30), y, { size: 10, bold: true, color: DARK });
    text(page, fonts, value, mm(30) + mm(55), y, { size: 10 });
    y -= lineH;
  }
}

// Absenderzeile + Empfänger im Sichtfenster — identisch auf Deckblatt und Rechnung
function drawAddressBlock(page: PDFPage, fonts: Fonts, a: InvoiceAmounts) {
  const s = a.settings;
  const senderLine = [s?.ownerName, s?.ownerAddress, s?.ownerCity].filter(Boolean).join(" · ");
  text(page, fonts, senderLine, MARGIN_X, A4h - mm(27), { size: 7, color: GREY, maxWidth: mm(85) });
  hline(page, MARGIN_X, MARGIN_X + mm(85), A4h - mm(30), 0.3, rgb(0.7, 0.7, 0.7));

  [s?.clientName, s?.clientAddress, s?.clientCity].filter(Boolean).forEach((line, i) => {
    text(page, fonts, line!, MARGIN_X, A4h - mm(40) - i * mm(6.5), { size: 11, bold: i === 0 });
  });
}

// ---- Rechnungsseite(n) ----
type Col = { header: string; width: number; align?: "left" | "right" };

function drawInvoice(doc: PDFDocument, fonts: Fonts, a: InvoiceAmounts, meta: InvoiceMeta) {
  const s = a.settings;
  const pages: PDFPage[] = [];
  let page = doc.addPage([A4w, A4h]);
  pages.push(page);

  drawAddressBlock(page, fonts, a);

  // Rechnungskopf rechts
  const rx = A4w - MARGIN_X;
  text(page, fonts, "Rechnung", rx, A4h - mm(30), { size: 18, bold: true, align: "right" });
  const headRows: [string, string][] = [
    ["Rechnungsnr.:", meta.invoiceNumber],
    ["Rechnungsdatum:", meta.invoiceDate],
    ["Fällig am:", meta.dueDate],
    ["Leistungszeitraum:", meta.monthName],
  ];
  if (s?.ownerTaxId) headRows.push(["Steuernummer:", s.ownerTaxId]);
  headRows.forEach(([label, value], i) => {
    const y = A4h - mm(40) - i * mm(5);
    text(page, fonts, label, rx - mm(40), y, { size: 9, color: GREY, align: "right" });
    text(page, fonts, value, rx, y, { size: 9, align: "right" });
  });

  let y = A4h - mm(78);
  if (meta.correction) {
    text(page, fonts, meta.correction, MARGIN_X, y, { size: 10, bold: true });
    y -= mm(8);
  }

  const newPage = () => {
    page = doc.addPage([A4w, A4h]);
    pages.push(page);
    text(page, fonts, `Rechnung ${meta.invoiceNumber} (Fortsetzung)`, MARGIN_X, A4h - mm(20), { size: 9, color: GREY });
    y = A4h - mm(30);
  };
  const ensure = (h: number) => { if (y - h < FOOTER_TOP) newPage(); };

  const ROW_H = mm(6);
  function table(title: string, cols: Col[], rows: string[][], sumRow: string[]) {
    const drawHeader = () => {
      page.drawRectangle({ x: MARGIN_X, y: y - mm(1.8), width: CONTENT_W, height: ROW_H, color: HEAD_BG });
      let x = MARGIN_X;
      for (const c of cols) {
        const tx = c.align === "right" ? x + c.width - mm(2) : x + mm(2);
        text(page, fonts, c.header, tx, y, { size: 8, bold: true, align: c.align, maxWidth: c.width - mm(4) });
        x += c.width;
      }
      y -= ROW_H;
    };
    const drawRow = (cells: string[], isSum = false) => {
      if (isSum) hline(page, MARGIN_X, MARGIN_X + CONTENT_W, y + mm(4), 1, rgb(0.6, 0.6, 0.6));
      let x = MARGIN_X;
      cols.forEach((c, i) => {
        const tx = c.align === "right" ? x + c.width - mm(2) : x + mm(2);
        // Leere Folgezellen darf der Text überspannen (z. B. "Summe …" in der Summenzeile)
        let span = c.width;
        for (let j = i + 1; j < cols.length && !cells[j]; j++) span += cols[j].width;
        text(page, fonts, cells[i] ?? "", tx, y, { size: 9, bold: isSum, align: c.align, maxWidth: (c.align === "right" ? c.width : span) - mm(4) });
        x += c.width;
      });
      if (!isSum) hline(page, MARGIN_X, MARGIN_X + CONTENT_W, y - mm(2), 0.3, rgb(0.9, 0.9, 0.9));
      y -= ROW_H;
    };

    // Titel + Kopf + mindestens eine Zeile zusammenhalten
    ensure(mm(10) + 2 * ROW_H);
    y -= mm(2);
    text(page, fonts, title, MARGIN_X, y, { size: 11, bold: true });
    hline(page, MARGIN_X, MARGIN_X + CONTENT_W, y - mm(2), 1, rgb(0.2, 0.2, 0.2));
    y -= mm(8);
    drawHeader();
    for (const r of rows) {
      if (y - ROW_H < FOOTER_TOP) { newPage(); drawHeader(); }
      drawRow(r);
    }
    ensure(ROW_H);
    drawRow(sumRow, true);
    y -= mm(4);
  }

  const W = CONTENT_W;
  // 5-Sterne-Prämien werden direkt in die Tourzeile eingerechnet. Prämien für Touren
  // aus Vormonaten (Bewertung kam erst später) erscheinen als eigene Zeile mit Tourdatum.
  const reviewById = new Map(a.reviewItems.map((r) => [r.id, r]));
  const tourRows = [
    ...a.tours.map((t) => ({
      date: t.date,
      label: t.tourLabel,
      pax: t.paxCount != null ? String(t.paxCount) : "–",
      stars: t.fiveStarReviews,
      net: round2(t.honorarNet + (reviewById.get(t.id)?.reviewBonus ?? 0)),
    })),
    ...a.reviewItems.filter((r) => !a.tours.some((t) => t.id === r.id)).map((r) => ({
      date: r.date,
      label: `${r.tourLabel} (Prämie nachträglich)`,
      pax: "–",
      stars: r.fiveStarReviews,
      net: r.reviewBonus,
    })),
  ];
  const toursNet = round2(a.honorarNet + a.reviewTotal);
  if (tourRows.length > 0) {
    table("Touren", [
      { header: "Datum", width: mm(25) },
      { header: "Tour", width: W - mm(25) - mm(15) - mm(22) - mm(35) },
      { header: "Pax", width: mm(15), align: "right" },
      { header: "5 Sterne", width: mm(22), align: "right" },
      { header: "Betrag (netto)", width: mm(35), align: "right" },
    ], tourRows.map((r) => [r.date, r.label, r.pax, r.stars > 0 ? String(r.stars) : "–", fmt(r.net)]),
    ["Summe Touren (netto)", "", "", "", fmt(toursNet)]);
  }

  const mvvTours = a.tours.filter((t) => t.mvvGross > 0);
  if (mvvTours.length > 0) {
    table("Auslagen MVV", [
      { header: "Datum", width: mm(22) },
      { header: "Tour", width: mm(40) },
      { header: "Position", width: W - mm(22) - mm(40) - mm(32) - mm(32) },
      { header: "Einkauf (brutto 7 %)", width: mm(32), align: "right" },
      { header: "Netto", width: mm(32), align: "right" },
    ], mvvTours.map((t) => {
      const pos = [];
      if (t.mvvSingleTickets > 0) pos.push(`${t.mvvSingleTickets}x Einzelkarte`);
      if (t.mvvGroupTickets > 0) pos.push(`${t.mvvGroupTickets}x Gruppenkarte`);
      return [t.date, t.tourLabel, pos.join(", "), fmt(t.mvvGross), fmt(t.mvvNet)];
    }),
    ["Summe MVV", "", "", fmt(a.mvvPurchaseGross), fmt(a.mvvNet)]);
  }

  if (a.auslagenItems.length > 0) {
    table("Sonstige Auslagen", [
      { header: "Datum", width: mm(22) },
      { header: "Beschreibung", width: W - mm(22) - mm(18) - mm(32) - mm(32) },
      { header: "MwSt.", width: mm(18), align: "right" },
      { header: "Einkauf (brutto)", width: mm(32), align: "right" },
      { header: "Netto", width: mm(32), align: "right" },
    ], a.auslagenItems.map((e) => [e.date, e.description, `${e.vatRate} %`, fmt(e.grossAmount), fmt(e.net)]),
    ["Summe sonstige Auslagen", "", "", "", fmt(a.auslagenNet)]);
  }

  const cashTours = a.tours.filter((t) => t.cashCount > 0);
  if (cashTours.length > 0) {
    table("Bargeldeinnahmen", [
      { header: "Datum", width: mm(25) },
      { header: "Tour", width: W - mm(25) - mm(35) },
      { header: "Betrag", width: mm(35), align: "right" },
    ], cashTours.map((t) => [t.date, t.tourLabel, fmt(t.cashCount)]),
    ["Summe Bargeld", "", fmt(a.cashTotal)]);
  }

  // ---- Summenblock ----
  type TotalRow = { label: string; value: string; bold?: boolean; color?: RGB; lineAbove?: number; size?: number };
  const totals: TotalRow[] = [
    { label: "Touren (netto)", value: fmt(toursNet) },
    ...(a.mvvNet > 0 ? [{ label: "Auslagen MVV (netto)", value: fmt(a.mvvNet) }] : []),
    ...(a.auslagenNet > 0 ? [{ label: "Sonstige Auslagen (netto)", value: fmt(a.auslagenNet) }] : []),
    { label: "Summe netto", value: fmt(a.netTotal), bold: true, lineAbove: 0.5 },
    { label: "zzgl. MwSt. 19 %", value: fmt(a.vatTotal) },
    { label: "Gesamtbetrag (brutto)", value: fmt(a.grossTotal), bold: true, lineAbove: 0.5 },
    ...(a.cashTotal > 0 ? [
      { label: "abzgl. Bargeld", value: `– ${fmt(a.cashTotal)}`, color: RED },
    ] : []),
    { label: "Zahlbetrag", value: fmt(a.amountDue), bold: true, lineAbove: 1.2, size: 12 },
  ];

  const TOTAL_ROW_H = mm(6);
  // Summenblock + Zahlungshinweis nicht trennen
  ensure(totals.length * TOTAL_ROW_H + mm(16));
  y -= mm(4);
  const labelX = A4w - MARGIN_X - mm(85);
  for (const r of totals) {
    if (r.lineAbove) {
      y -= mm(1);
      hline(page, labelX, A4w - MARGIN_X, y + mm(4.2), r.lineAbove, r.lineAbove > 1 ? rgb(0.2, 0.2, 0.2) : LINE);
    }
    text(page, fonts, r.label, labelX, y, { size: r.size ?? 9, bold: r.bold, color: r.color ?? DARK });
    text(page, fonts, r.value, A4w - MARGIN_X, y, { size: r.size ?? 9, bold: r.bold, color: r.color, align: "right" });
    y -= TOTAL_ROW_H;
  }

  y -= mm(2);
  text(page, fonts,
    `Bitte überweisen Sie den Zahlbetrag bis zum ${meta.dueDate} unter Angabe der Rechnungsnummer ${meta.invoiceNumber}.`,
    MARGIN_X, y, { size: 9, maxWidth: CONTENT_W });

  // ---- Footer auf jeder Rechnungsseite ----
  const footerCols = [
    [s?.ownerName ?? "", s?.ownerAddress ?? "", s?.ownerCity ?? "", s?.ownerEmail ?? ""],
    ["Bankverbindung", s?.bankName ?? "", s?.bankIban ? `IBAN: ${s.bankIban}` : "", s?.bankBic ? `BIC: ${s.bankBic}` : ""],
    [s?.ownerTaxId ? `Steuernummer: ${s.ownerTaxId}` : ""],
  ];
  const colW = CONTENT_W / 3;
  pages.forEach((p, i) => {
    hline(p, MARGIN_X, A4w - MARGIN_X, mm(30), 0.5, LINE);
    footerCols.forEach((lines, c) => {
      lines.filter(Boolean).forEach((line, l) => {
        text(p, fonts, line, MARGIN_X + c * colW, mm(25) - l * mm(4), {
          size: 7.5, bold: l === 0 && c < 2, color: GREY, maxWidth: colW - mm(4),
        });
      });
    });
    if (pages.length > 1) {
      text(p, fonts, `Seite ${i + 1} von ${pages.length}`, A4w - MARGIN_X, mm(10), { size: 7.5, color: GREY, align: "right" });
    }
  });
}
