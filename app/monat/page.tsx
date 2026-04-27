"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TOUR_TYPES, calculateFees, type TourKind } from "@/lib/tour-types";
import { ChevronLeft, ChevronRight, Send } from "lucide-react";

interface Tour {
  id: number;
  date: string;
  tourType: string;
  tourKind: string;
  paxCount: number | null;
  hotelPickup: boolean;
  fiveStarReviews: number;
  cancellationWithin48h: boolean;
}

export default function MonatPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tours, setTours] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/tours?year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((data) => { setTours(data); setLoading(false); });
  }, [year, month]);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  const toursWithFees = tours.map((t) => ({
    ...t,
    fees: calculateFees({
      tourType: t.tourType,
      tourKind: t.tourKind as TourKind,
      paxCount: t.paxCount,
      hotelPickup: t.hotelPickup,
      fiveStarReviews: t.fiveStarReviews,
      cancellationWithin48h: t.cancellationWithin48h,
    }),
  }));

  const totalHonorar = toursWithFees.reduce((s, t) => s + t.fees.baseFee + t.fees.hotelPickupFee, 0);
  const totalReviews = toursWithFees.reduce((s, t) => s + t.fees.reviewBonus, 0);
  const totalCancellation = toursWithFees.reduce((s, t) => s + t.fees.cancellationFee, 0);
  const total = toursWithFees.reduce((s, t) => s + t.fees.total, 0);

  const tourLabel = (id: string) => TOUR_TYPES.find((t) => t.id === id)?.label ?? id;
  const monthName = new Date(year, month - 1).toLocaleDateString("de-DE", {
    month: "long", year: "numeric",
  });

  async function handleSendToN8n() {
    setSending(true);
    try {
      const payload = {
        month, year, monthName, total,
        totalHonorar, totalReviews, totalCancellation,
        veranstalter: {
          name: settings.clientName ?? "",
          address: settings.clientAddress ?? "",
          city: settings.clientCity ?? "",
          email: settings.clientEmail ?? "",
        },
        rechnung: {
          prefix: settings.invoicePrefix ?? "RE",
          paymentDays: settings.paymentDays ?? 14,
        },
        tours: toursWithFees.map((t) => ({
          date: new Date(t.date).toLocaleDateString("de-DE"),
          tourLabel: tourLabel(t.tourType),
          tourKind: t.tourKind,
          paxCount: t.paxCount,
          hotelPickup: t.hotelPickup,
          fiveStarReviews: t.fiveStarReviews,
          ...t.fees,
        })),
      };
      const res = await fetch("/api/n8n", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      toast.success("Daten an n8n gesendet!");
    } catch {
      toast.error("Fehler beim Senden an n8n");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft /></Button>
        <h2 className="font-semibold text-base">{monthName}</h2>
        <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight /></Button>
      </div>

      {loading ? (
        <p className="text-center text-gray-400">Lädt…</p>
      ) : tours.length === 0 ? (
        <p className="text-center text-gray-400">Keine Touren in diesem Monat.</p>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">Zusammenfassung</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Anzahl Touren</span>
                <span>{tours.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Honorar</span>
                <span>{totalHonorar.toFixed(2)} €</span>
              </div>
              {totalReviews > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">5★-Prämien</span>
                  <span>+{totalReviews.toFixed(2)} €</span>
                </div>
              )}
              {totalCancellation > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Ausfallgelder</span>
                  <span>{totalCancellation.toFixed(2)} €</span>
                </div>
              )}
              <Separator className="my-1" />
              <div className="flex justify-between font-semibold text-base">
                <span>Gesamt</span>
                <span>{total.toFixed(2)} €</span>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {toursWithFees.map((tour) => (
              <Card key={tour.id} className="bg-white">
                <CardContent className="pt-3 pb-3 flex justify-between items-center gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{tourLabel(tour.tourType)}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(tour.date).toLocaleDateString("de-DE")}
                      {tour.paxCount ? ` · ${tour.paxCount} pax` : ""}
                      {tour.fiveStarReviews > 0 ? ` · ${tour.fiveStarReviews} ★` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-medium shrink-0">{tour.fees.total.toFixed(2)} €</span>
                </CardContent>
              </Card>
            ))}
          </div>

          <Button className="w-full" onClick={handleSendToN8n} disabled={sending}>
            <Send size={16} className="mr-2" />
            {sending ? "Wird gesendet…" : "Rechnung erstellen (n8n)"}
          </Button>
        </>
      )}
    </div>
  );
}
