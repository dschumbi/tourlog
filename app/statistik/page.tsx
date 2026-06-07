"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList,
} from "recharts";
import { type TourTypeConfig } from "@/lib/tour-types";

interface CountryStat {
  country: string;
  totalGuests: number;
  totalTip: number;
  avgTipPerGuest: number;
}

interface StatData {
  tourTypes: TourTypeConfig[];
  stats: Record<string, CountryStat[]>;
}

const fmt = (n: number) => n.toFixed(2).replace(".", ",") + " €";

export default function StatistikPage() {
  const [data, setData] = useState<StatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string>("");

  useEffect(() => {
    fetch("/api/statistik")
      .then((r) => r.json())
      .then((d: StatData) => {
        setData(d);
        const firstWithData = d.tourTypes.find((t) => d.stats[t.id]?.length > 0);
        setSelectedType(firstWithData?.id ?? d.tourTypes[0]?.id ?? "");
        setLoading(false);
      });
  }, []);

  if (loading) return <p className="text-center text-gray-400 mt-10">Lädt…</p>;
  if (!data) return null;

  const tourTypesWithData = data.tourTypes.filter((t) => data.stats[t.id]?.length > 0);

  if (tourTypesWithData.length === 0) {
    return (
      <div className="text-center text-gray-400 mt-10 space-y-2">
        <p>Noch keine Statistik-Daten vorhanden.</p>
        <p className="text-sm">Herkunftsländer und Trinkgeld beim Bearbeiten einer Tour erfassen.</p>
      </div>
    );
  }

  const chartData: CountryStat[] = (data.stats[selectedType] ?? [])
    .slice()
    .sort((a, b) => b.totalGuests - a.totalGuests);

  const tipData = chartData.slice().sort((a, b) => b.avgTipPerGuest - a.avgTipPerGuest);

  const barH = Math.max(chartData.length * 44 + 40, 120);

  return (
    <div className="space-y-4">
      {/* Tour-Typ Auswahl */}
      <div className="flex flex-wrap gap-2">
        {tourTypesWithData.map((t) => (
          <button key={t.id} type="button"
            onClick={() => setSelectedType(t.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              selectedType === t.id
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {chartData.length === 0 ? (
        <p className="text-center text-gray-400 mt-6">Keine Daten für diesen Tourtyp.</p>
      ) : (
        <>
          {/* Gäste nach Herkunft */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Gäste nach Herkunft</CardTitle>
            </CardHeader>
            <CardContent className="pr-2">
              <ResponsiveContainer width="100%" height={barH}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 40, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="country" width={90} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [`${v} Gäste`, "Anzahl"]} />
                  <Bar dataKey="totalGuests" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="totalGuests" position="right" style={{ fontSize: 11, fill: "#555" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Ø Trinkgeld */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Ø Trinkgeld pro Gast</CardTitle>
            </CardHeader>
            <CardContent className="pr-2">
              <ResponsiveContainer width="100%" height={barH}>
                <BarChart data={tipData} layout="vertical" margin={{ left: 0, right: 60, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} €`} />
                  <YAxis type="category" dataKey="country" width={90} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [fmt(Number(v)), "Ø Trinkgeld/Gast"]} />
                  <Bar dataKey="avgTipPerGuest" fill="#f97316" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="avgTipPerGuest" position="right"
                      formatter={(v: unknown) => fmt(Number(v))}
                      style={{ fontSize: 11, fill: "#555" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Detailtabelle */}
          {(() => {
            const totalGuests = chartData.reduce((s, r) => s + r.totalGuests, 0);
            const totalTip = chartData.reduce((s, r) => s + r.totalTip, 0);
            const avgTip = totalGuests > 0 ? totalTip / totalGuests : 0;
            return (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Details</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_2.5rem_5.5rem_4.5rem] text-xs font-medium text-gray-400 bg-gray-50 px-4 py-2 border-b">
                    <span>Land</span>
                    <span className="text-right">Gäste</span>
                    <span className="text-right">Trinkgeld</span>
                    <span className="text-right">Ø / Gast</span>
                  </div>
                  {/* Rows */}
                  {chartData.map((row, i) => (
                    <div key={row.country}
                      className={`grid grid-cols-[1fr_2.5rem_5.5rem_4.5rem] text-sm px-4 py-2.5 border-b ${i % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                      <span className="font-medium truncate pr-2">{row.country}</span>
                      <span className="text-right tabular-nums text-gray-600">{row.totalGuests}</span>
                      <span className="text-right tabular-nums text-gray-600">{fmt(row.totalTip)}</span>
                      <span className="text-right tabular-nums font-semibold">{fmt(row.avgTipPerGuest)}</span>
                    </div>
                  ))}
                  {/* Summenzeile */}
                  <div className="grid grid-cols-[1fr_2.5rem_5.5rem_4.5rem] text-sm px-4 py-2.5 border-t-2 bg-gray-50 font-semibold">
                    <span>Gesamt</span>
                    <span className="text-right tabular-nums">{totalGuests}</span>
                    <span className="text-right tabular-nums">{fmt(totalTip)}</span>
                    <span className="text-right tabular-nums">{fmt(avgTip)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </>
      )}
    </div>
  );
}
