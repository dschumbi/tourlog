import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const invoices = await prisma.invoice.findMany({
    orderBy: { issuedAt: "desc" },
    include: { correctsInvoice: { select: { id: true, invoiceNumber: true } } },
  });
  return NextResponse.json(invoices);
}
