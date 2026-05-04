import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TOUR_TYPES } from "@/lib/tour-types";

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export async function GET() {
  let types = await prisma.tourType.findMany({ orderBy: { sortOrder: "asc" } });

  if (types.length === 0) {
    await prisma.tourType.createMany({
      data: TOUR_TYPES.map((t, i) => ({
        id: t.id,
        label: t.label,
        flatFee: t.flatFee ?? null,
        tiers: t.tiers,
        sortOrder: i,
      })),
      skipDuplicates: true,
    });
    types = await prisma.tourType.findMany({ orderBy: { sortOrder: "asc" } });
  }

  return NextResponse.json(types);
}

export async function POST(req: NextRequest) {
  const { label, flatFee, tiers } = await req.json();

  if (!label?.trim()) {
    return NextResponse.json({ error: "Label erforderlich" }, { status: 400 });
  }

  let slug = slugify(label);
  const existing = await prisma.tourType.findMany({
    where: { id: { startsWith: slug } },
    select: { id: true },
  });
  if (existing.some((e) => e.id === slug)) {
    slug = `${slug}_${existing.length}`;
  }

  const agg = await prisma.tourType.aggregate({ _max: { sortOrder: true } });

  const created = await prisma.tourType.create({
    data: {
      id: slug,
      label: label.trim(),
      flatFee: flatFee ?? null,
      tiers: tiers ?? [],
      sortOrder: (agg._max.sortOrder ?? -1) + 1,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
