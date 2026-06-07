import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const expenses = await prisma.expense.findMany({ orderBy: { date: "desc" } });
  return NextResponse.json(expenses);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const expense = await prisma.expense.create({
    data: {
      date: new Date(body.date),
      description: body.description,
      grossAmount: Number(body.grossAmount),
      vatRate: Number(body.vatRate),
      receiptUrl: body.receiptUrl ?? null,
      notes: body.notes ?? null,
    },
  });
  return NextResponse.json(expense, { status: 201 });
}
