import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dbRowToConfig, TOUR_TYPES } from "@/lib/tour-types";

export async function GET() {
  const [tourGuests, dbTourTypes] = await Promise.all([
    prisma.tourGuest.findMany({
      include: {
        tour: { select: { tourType: true } },
        country: { select: { name: true } },
      },
    }),
    prisma.tourType.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const tourTypes = dbTourTypes.length > 0 ? dbTourTypes.map(dbRowToConfig) : TOUR_TYPES;

  // Aggregate: tourType → country → { totalGuests, totalTip }
  const agg: Record<string, Record<string, { totalGuests: number; totalTip: number }>> = {};

  for (const tg of tourGuests) {
    const typeId = tg.tour.tourType;
    const country = tg.country.name;
    if (!agg[typeId]) agg[typeId] = {};
    if (!agg[typeId][country]) agg[typeId][country] = { totalGuests: 0, totalTip: 0 };
    agg[typeId][country].totalGuests += tg.guestCount;
    agg[typeId][country].totalTip += tg.tip;
  }

  const stats: Record<string, { country: string; totalGuests: number; totalTip: number; avgTipPerGuest: number }[]> = {};
  for (const [typeId, countries] of Object.entries(agg)) {
    stats[typeId] = Object.entries(countries)
      .map(([country, { totalGuests, totalTip }]) => ({
        country,
        totalGuests,
        totalTip: Math.round(totalTip * 100) / 100,
        avgTipPerGuest: totalGuests > 0 ? Math.round((totalTip / totalGuests) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.totalGuests - a.totalGuests);
  }

  return NextResponse.json({ tourTypes, stats });
}
