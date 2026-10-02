import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeInvoiceAmounts, defaultInvoiceDates, formatEuro, round2, VAT_RATE } from "@/lib/invoice";

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

  const a = await computeInvoiceAmounts(year, month, {
    correctsReviewTourIds: correctsInvoice?.reviewTourIds,
  });
  const settings = a.settings;

  const monthName = new Date(year, month - 1).toLocaleDateString("de-DE", {
    month: "long", year: "numeric",
  });

  const { invoiceDate, dueDate } = defaultInvoiceDates(settings?.paymentDays ?? 14);
  const prefix = settings?.invoicePrefix ?? "RE";
  const mPad = String(month).padStart(2, "0");
  const invoiceNumber = correctsInvoice
    ? `${correctsInvoice.invoiceNumber}-K${correctsInvoice.corrections.length + 1}`
    : `${prefix}-${year}-${mPad}`;

  // Block-MwSt. nur informativ — maßgeblich ist vatTotal (einmal auf die Netto-Summe gerundet)
  const block = (net: number) => ({ vat19: round2(net * VAT_RATE), gross: round2(net * (1 + VAT_RATE)) });

  return NextResponse.json({
    month, year, monthName,
    invoiceDate, dueDate, invoiceNumber,
    amountDueFormatted: formatEuro(a.amountDue),
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
      prefix,
      paymentDays: settings?.paymentDays ?? 14,
    },
    honorar: { net: a.honorarNet, ...block(a.honorarNet) },
    reviews: { items: a.reviewItems, total: a.reviewTotal, ...block(a.reviewTotal) },
    mvv: { purchaseGross: a.mvvPurchaseGross, net: a.mvvNet, vat19: block(a.mvvNet).vat19, billingGross: block(a.mvvNet).gross },
    auslagen: { items: a.auslagenItems, net: a.auslagenNet, vat19: block(a.auslagenNet).vat19, billingGross: block(a.auslagenNet).gross },
    netTotal: a.netTotal,
    vatTotal: a.vatTotal,
    grossTotal: a.grossTotal,
    cashTotal: a.cashTotal,
    amountDue: a.amountDue,
    reviewTourIds: a.reviewTourIds,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tours: a.tours.map(({ mvvReceiptUrls, ...t }) => t),
  });
}
