import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key !== process.env.INVOICE_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const yearParam = req.nextUrl.searchParams.get("year");
  const monthParam = req.nextUrl.searchParams.get("month");
  const year = yearParam ? Number(yearParam) : new Date().getFullYear();
  const month = monthParam ? Number(monthParam) : new Date().getMonth() + 1;

  // Rechnungs-PDF aus dem Request Body
  const invoicePdfBytes = await req.arrayBuffer();

  // Belege-URLs aus der DB holen
  const tours = await prisma.tour.findMany({
    where: {
      date: {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1),
      },
    },
    select: { mvvReceiptUrls: true },
  });

  const receiptUrls = tours.flatMap(t => t.mvvReceiptUrls).filter(Boolean);

  // Merge starten
  const mergedPdf = await PDFDocument.load(invoicePdfBytes);

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
        const page = mergedPdf.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      } else {
        // JPEG als Fallback
        const img = await mergedPdf.embedJpg(bytes);
        const page = mergedPdf.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      }
    } catch {
      // Einzelner Beleg schlägt fehl → überspringen
    }
  }

  const mergedBytes = await mergedPdf.save();

  return new NextResponse(Buffer.from(mergedBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Rechnung-${year}-${String(month).padStart(2, "0")}.pdf"`,
    },
  });
}
