import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { label, flatFee, tiers, sortOrder } = await req.json();

  const updated = await prisma.tourType.update({
    where: { id },
    data: {
      label,
      flatFee: flatFee ?? null,
      tiers: tiers ?? [],
      ...(sortOrder != null ? { sortOrder } : {}),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const count = await prisma.tour.count({ where: { tourType: id } });
  if (count > 0) {
    return NextResponse.json(
      { error: `Tourtyp wird in ${count} Tour(en) verwendet und kann nicht gelöscht werden.` },
      { status: 409 },
    );
  }

  await prisma.tourType.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
