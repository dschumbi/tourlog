"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface TourRow {
  id: number;
  date: string;
  tourLabel: string;
  paxCount: number | null;
  honorarNet: number;
  mvvSingleTickets: number;
  mvvGroupTickets: number;
  mvvGross: number;
  cashCount: number;
  fiveStarReviews: number;
}

interface ReviewItem {
  date: string;
  tourLabel: string;
  fiveStarReviews: number;
  reviewBonus: number;
  fromPrevMonth: boolean;
}

interface MonatData {
  tours: TourRow[];
  reviewItems: ReviewItem[];
  honorar: { net: number; vat: number; gross: number };
  reviews: { items: ReviewItem[]; total: number; vat: number; gross: number };
  mvv: { purchaseGross: number; net: number; vat: number; billingGross: number };
  cashTotal: number;
  amountDue: number;
}

const fmt = (n: number) => n.toFixed(2).replace(".", ",") + " €";

export default function MonatPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<MonatData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/monat-data?year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, [year, month]);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  const monthName = new Date(year, month - 1).toLocaleDateString("de-DE", {
    month: "long", year: "numeric",
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft /></Button>
        <h2 className="font-semibold text-base">{monthName}</h2>
        <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight /></Button>
      </div>

      {loading ? (
        <p className="text-center text-gray-400">Lädt…</p>
      ) : !data || data.tours.length === 0 ? (
        <p className="text-center text-gray-400">Keine Touren in diesem Monat.</p>
      ) : (
        <>
          {/* Touren */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Touren</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.tours.map((t) => (
                <div key={t.id} className="flex justify-between items-start px-4 py-2 border-b last:border-0 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{t.tourLabel}</p>
                    <p className="text-xs text-gray-400">
                      {t.date}
                      {t.paxCount ? ` · ${t.paxCount} Pax` : ""}
                      {t.fiveStarReviews > 0 ? ` · ${t.fiveStarReviews} ★` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 ml-2 text-right">{fmt(t.honorarNet)}</span>
                </div>
              ))}
              <div className="flex justify-between px-4 py-2 text-sm font-semibold border-t">
                <span>Summe Honorar (netto)</span>
                <span>{fmt(data.honorar.net)}</span>
              </div>
            </CardContent>
          </Card>

          {/* 5★ Prämien */}
          {data.reviews.items.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">5★ Prämien</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.reviews.items.map((r, i) => (
                  <div key={i} className="flex justify-between items-start px-4 py-2 border-b last:border-0 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.tourLabel}</p>
                      <p className="text-xs text-gray-400">
                        {r.date} · {r.fiveStarReviews} ★
                        {r.fromPrevMonth && <span className="text-amber-500"> · Vormonat</span>}
                      </p>
                    </div>
                    <span className="shrink-0 ml-2">{fmt(r.reviewBonus)}</span>
                  </div>
                ))}
                <div className="flex justify-between px-4 py-2 text-sm font-semibold border-t">
                  <span>Summe 5★ Prämien (netto)</span>
                  <span>{fmt(data.reviews.total)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Auslagen MVV */}
          {data.mvv.purchaseGross > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Auslagen MVV</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.tours.filter(t => t.mvvGross > 0).map((t) => {
                  const pos = [];
                  if (t.mvvSingleTickets > 0) pos.push(`${t.mvvSingleTickets}× Einzelkarte`);
                  if (t.mvvGroupTickets > 0) pos.push(`${t.mvvGroupTickets}× Gruppenkarte`);
                  return (
                    <div key={t.id} className="flex justify-between items-start px-4 py-2 border-b last:border-0 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{t.tourLabel}</p>
                        <p className="text-xs text-gray-400">{t.date} · {pos.join(", ")}</p>
                      </div>
                      <div className="shrink-0 ml-2 text-right text-xs">
                        <p>{fmt(t.mvvGross)} brutto</p>
                        <p className="text-gray-400">{fmt(t.mvvGross / 1.07)} netto</p>
                      </div>
                    </div>
                  );
                })}
                <div className="flex justify-between px-4 py-2 text-sm font-semibold border-t">
                  <span>Summe Auslagen (netto)</span>
                  <span>{fmt(data.mvv.net)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bargeld */}
          {data.cashTotal > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Bargeldeinnahmen</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.tours.filter(t => t.cashCount > 0).map((t) => (
                  <div key={t.id} className="flex justify-between items-start px-4 py-2 border-b last:border-0 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{t.tourLabel}</p>
                      <p className="text-xs text-gray-400">{t.date}</p>
                    </div>
                    <span className="shrink-0 ml-2">{fmt(t.cashCount)}</span>
                  </div>
                ))}
                <div className="flex justify-between px-4 py-2 text-sm font-semibold border-t">
                  <span>Summe Bargeld</span>
                  <span>{fmt(data.cashTotal)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Gesamtübersicht */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Gesamtübersicht</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Honorar (netto)</span>
                <span>{fmt(data.honorar.net)}</span>
              </div>
              <div className="flex justify-between text-gray-400 text-xs">
                <span>zzgl. MwSt. 19%</span>
                <span>{fmt(data.honorar.vat)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Honorar (brutto)</span>
                <span>{fmt(data.honorar.gross)}</span>
              </div>

              {data.reviews.gross > 0 && (
                <>
                  <Separator className="my-1" />
                  <div className="flex justify-between">
                    <span className="text-gray-500">5★ Prämien (netto)</span>
                    <span>{fmt(data.reviews.total)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400 text-xs">
                    <span>zzgl. MwSt. 19%</span>
                    <span>{fmt(data.reviews.vat)}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>5★ Prämien (brutto)</span>
                    <span>{fmt(data.reviews.gross)}</span>
                  </div>
                </>
              )}

              {data.mvv.billingGross > 0 && (
                <>
                  <Separator className="my-1" />
                  <div className="flex justify-between">
                    <span className="text-gray-500">Auslagen MVV (netto)</span>
                    <span>{fmt(data.mvv.net)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400 text-xs">
                    <span>zzgl. MwSt. 19%</span>
                    <span>{fmt(data.mvv.vat)}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Auslagen MVV (brutto)</span>
                    <span>{fmt(data.mvv.billingGross)}</span>
                  </div>
                </>
              )}

              {data.cashTotal > 0 && (
                <>
                  <Separator className="my-1" />
                  <div className="flex justify-between text-red-600">
                    <span>Abzgl. Bargeld</span>
                    <span>– {fmt(data.cashTotal)}</span>
                  </div>
                </>
              )}

              <Separator className="my-1" />
              <div className="flex justify-between font-bold text-base">
                <span>Gesamtbetrag</span>
                <span>{fmt(data.amountDue)}</span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
