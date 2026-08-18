import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const country = await prisma.country.update({
    where: { id: Number(id) },
    data: { name: body.name.trim() },
  });
  return NextResponse.json(country);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.country.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
