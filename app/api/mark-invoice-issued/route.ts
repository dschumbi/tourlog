import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Akzeptiert deutsches Format (TT.MM.JJJJ, wie von invoice-data geliefert) oder ISO
function parseDate(s: string): Date {
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
    const [day, month, year] = s.split(".").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(s);
}

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key !== process.env.INVOICE_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    year, month, invoiceNumber, invoiceDate, dueDate, amountDue,
    typeCode, correctsInvoiceId, reviewTourIds, dataSnapshot,
  } = body;

  const resolvedTypeCode = typeCode ?? (correctsInvoiceId ? 384 : 380);

  if (resolvedTypeCode === 380 && !correctsInvoiceId) {
    const existing = await prisma.invoice.findFirst({
      where: { year, month, status: "active", typeCode: 380 },
    });
    if (existing) {
      return NextResponse.json(
        { error: "already-issued", existingInvoiceId: existing.id, existingInvoiceNumber: existing.invoiceNumber },
        { status: 409 }
      );
    }
  }

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          year, month, invoiceNumber,
          typeCode: resolvedTypeCode,
          invoiceDate: parseDate(invoiceDate),
          dueDate: parseDate(dueDate),
          amountDue,
          correctsInvoiceId: correctsInvoiceId ?? null,
          reviewTourIds: reviewTourIds ?? [],
          dataSnapshot: dataSnapshot ?? {},
        },
      });
      if (correctsInvoiceId) {
        await tx.invoice.update({
          where: { id: correctsInvoiceId },
          data: { status: "superseded" },
        });
      }
      return created;
    });

    return NextResponse.json({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, status: "created" });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "duplicate-invoice-number" }, { status: 409 });
    }
    throw e;
  }
}
