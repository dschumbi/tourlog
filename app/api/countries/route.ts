import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const countries = await prisma.country.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return NextResponse.json(countries);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const country = await prisma.country.create({
    data: {
      name: body.name.trim(),
      sortOrder: body.sortOrder ?? 0,
    },
  });
  return NextResponse.json(country, { status: 201 });
}
