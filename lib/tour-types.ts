export type TourKind = "public" | "private" | "cancelled_public" | "cancelled_private";

export interface Tier {
  minPax: number;
  fee: number;
}

export interface TourTypeConfig {
  id: string;
  label: string;
  tiers: Tier[];
  flatFee?: number | null;
}

// Seed-Daten — werden beim ersten Start in die DB geschrieben
export const TOUR_TYPES: TourTypeConfig[] = [
  {
    id: "altstadt",
    label: "Altstadt (1,5 Std.)",
    tiers: [
      { minPax: 0, fee: 60 },
      { minPax: 10, fee: 70 },
      { minPax: 20, fee: 80 },
    ],
  },
  {
    id: "city_walk",
    label: "City Walk (2 Std.)",
    tiers: [
      { minPax: 0, fee: 70 },
      { minPax: 10, fee: 80 },
      { minPax: 20, fee: 85 },
    ],
  },
  {
    id: "3rd_reich",
    label: "3rd Reich (2,5–3 Std.)",
    tiers: [
      { minPax: 0, fee: 100 },
      { minPax: 20, fee: 110 },
      { minPax: 30, fee: 120 },
    ],
  },
  {
    id: "viktualienmarkt",
    label: "Viktualienmarkt (2–2,5 Std.)",
    tiers: [
      { minPax: 0, fee: 90 },
      { minPax: 20, fee: 100 },
    ],
  },
  {
    id: "bav_food",
    label: "Bav. Food (2–2,5 Std.)",
    tiers: [
      { minPax: 0, fee: 90 },
      { minPax: 20, fee: 100 },
    ],
  },
  {
    id: "radltour",
    label: "Radltour / Bike Tour (3,5 Std.)",
    tiers: [
      { minPax: 0, fee: 100 },
      { minPax: 15, fee: 120 },
    ],
  },
  {
    id: "street_art",
    label: "Street Art (EN + DE)",
    tiers: [],
    flatFee: 120,
  },
  {
    id: "biertour",
    label: "Biertour / Brewery Tour (3,5 Std.)",
    tiers: [
      { minPax: 0, fee: 120 },
      { minPax: 15, fee: 130 },
    ],
  },
  {
    id: "dachau",
    label: "Dachau (5 Std.)",
    tiers: [
      { minPax: 0, fee: 150 },
      { minPax: 11, fee: 160 },
      { minPax: 20, fee: 170 },
      { minPax: 25, fee: 180 },
      { minPax: 30, fee: 200 },
    ],
  },
];

export function getBaseFee(
  tourTypeId: string,
  paxCount: number | null,
  tourTypes: TourTypeConfig[] = TOUR_TYPES,
): number {
  const type = tourTypes.find((t) => t.id === tourTypeId);
  if (!type) return 0;
  if (type.flatFee != null) return type.flatFee;
  if (paxCount === null) return type.tiers[0]?.fee ?? 0;
  const sorted = [...type.tiers].sort((a, b) => b.minPax - a.minPax);
  const tier = sorted.find((t) => paxCount >= t.minPax);
  return tier?.fee ?? type.tiers[0]?.fee ?? 0;
}

export interface TourFees {
  baseFee: number;
  hotelPickupFee: number;
  reviewBonus: number;
  cancellationFee: number;
  total: number;
}

export function calculateFees(
  tour: {
    tourType: string;
    tourKind: TourKind;
    paxCount: number | null;
    hotelPickup: boolean;
    fiveStarReviews: number;
    cancellationWithin48h: boolean;
  },
  tourTypes: TourTypeConfig[] = TOUR_TYPES,
): TourFees {
  const isCancelled =
    tour.tourKind === "cancelled_public" || tour.tourKind === "cancelled_private";

  const baseFee = isCancelled ? 0 : getBaseFee(tour.tourType, tour.paxCount, tourTypes);
  const hotelPickupFee =
    !isCancelled && tour.tourKind === "private" && tour.hotelPickup ? 10 : 0;
  const reviewBonus = isCancelled ? 0 : tour.fiveStarReviews * 10;
  const cancellationFee = isCancelled
    ? tour.tourKind === "cancelled_public"
      ? 20
      : tour.cancellationWithin48h
      ? 20
      : 0
    : 0;

  return {
    baseFee,
    hotelPickupFee,
    reviewBonus,
    cancellationFee,
    total: baseFee + hotelPickupFee + reviewBonus + cancellationFee,
  };
}

export function dbRowToConfig(row: {
  id: string;
  label: string;
  flatFee: number | null;
  tiers: unknown;
}): TourTypeConfig {
  return {
    id: row.id,
    label: row.label,
    flatFee: row.flatFee,
    tiers: (row.tiers as Tier[]) ?? [],
  };
}
