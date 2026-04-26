"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { TOUR_TYPES, calculateFees, type TourKind } from "@/lib/tour-types";
import { Pencil, Trash2 } from "lucide-react";

interface Tour {
  id: number;
  date: string;
  tourType: string;
  tourKind: string;
  paxCount: number | null;
  hotelPickup: boolean;
  fiveStarReviews: number;
  cancellationWithin48h: boolean;
  cashCount: number | null;
  notes: string | null;
}

const KIND_LABELS: Record<string, string> = {
  public: "Öffentlich",
  private: "Privat",
  cancelled_public: "Ausgefallen (öff.)",
  cancelled_private: "Ausgefallen (priv.)",
};

const KIND_COLORS: Record<string, string> = {
  public: "bg-green-100 text-green-700",
  private: "bg-blue-100 text-blue-700",
  cancelled_public: "bg-red-100 text-red-700",
  cancelled_private: "bg-orange-100 text-orange-700",
};

export default function TourenPage() {
  const [tours, setTours] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTour, setEditTour] = useState<Tour | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/tours");
    setTours(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: number) {
    if (!confirm("Tour löschen?")) return;
    await fetch(`/api/tours/${id}`, { method: "DELETE" });
    toast.success("Tour gelöscht");
    load();
  }

  async function handleSave() {
    if (!editTour) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tours/${editTour.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editTour,
          date: editTour.date.split("T")[0],
          paxCount: editTour.paxCount ?? null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Gespeichert");
      setEditTour(null);
      load();
    } catch {
      toast.error("Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  const tourLabel = (id: string) =>
    TOUR_TYPES.find((t) => t.id === id)?.label ?? id;

  if (loading) return <p className="text-center text-gray-400 mt-10">Lädt…</p>;
  if (tours.length === 0)
    return <p className="text-center text-gray-400 mt-10">Noch keine Touren erfasst.</p>;

  return (
    <>
      <div className="space-y-3">
        {tours.map((tour) => {
          const fees = calculateFees({
            tourType: tour.tourType,
            tourKind: tour.tourKind as TourKind,
            paxCount: tour.paxCount,
            hotelPickup: tour.hotelPickup,
            fiveStarReviews: tour.fiveStarReviews,
            cancellationWithin48h: tour.cancellationWithin48h,
          });
          const dateStr = new Date(tour.date).toLocaleDateString("de-DE", {
            day: "2-digit", month: "2-digit", year: "numeric",
          });
          return (
            <Card key={tour.id}>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{tourLabel(tour.tourType)}</p>
                    <p className="text-xs text-gray-500">{dateStr}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${KIND_COLORS[tour.tourKind]}`}>
                        {KIND_LABELS[tour.tourKind]}
                      </span>
                      {tour.paxCount && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {tour.paxCount} pax
                        </span>
                      )}
                      {tour.fiveStarReviews > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                          {tour.fiveStarReviews} ★
                        </span>
                      )}
                      {tour.cashCount != null && tour.cashCount > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          {tour.cashCount} bar
                        </span>
                      )}
                    </div>
                    {tour.notes && (
                      <p className="text-xs text-gray-400 mt-1 truncate">{tour.notes}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="font-semibold text-sm">{fees.total.toFixed(2)} €</span>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => setEditTour({ ...tour, date: tour.date.split("T")[0] })}>
                        <Pencil size={14} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400"
                        onClick={() => handleDelete(tour.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editTour} onOpenChange={(o) => !o && setEditTour(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Tour bearbeiten</DialogTitle>
          </DialogHeader>
          {editTour && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Datum</Label>
                <Input type="date" value={editTour.date.split("T")[0]}
                  onChange={(e) => setEditTour({ ...editTour, date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>5★-Bewertungen</Label>
                <div className="flex gap-2">
                  {[0, 1, 2, 3].map((n) => (
                    <button key={n} type="button"
                      onClick={() => setEditTour({ ...editTour, fiveStarReviews: n })}
                      className={`flex-1 py-2 rounded-md border text-sm font-medium transition-colors ${
                        editTour.fiveStarReviews === n
                          ? "bg-yellow-400 border-yellow-400 text-white"
                          : "bg-white border-gray-200 text-gray-600"
                      }`}>
                      {n === 0 ? "—" : `${n} ★`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Teilnehmer</Label>
                <Input type="number" min={1}
                  value={editTour.paxCount ?? ""}
                  onChange={(e) => setEditTour({
                    ...editTour,
                    paxCount: e.target.value ? Number(e.target.value) : null,
                  })} />
              </div>
              <div className="space-y-1">
                <Label>Bargeld (Anzahl Gäste)</Label>
                <Input type="number" min={0}
                  value={editTour.cashCount ?? ""}
                  onChange={(e) => setEditTour({
                    ...editTour,
                    cashCount: e.target.value ? Number(e.target.value) : null,
                  })} />
              </div>
              <div className="space-y-1">
                <Label>Notiz</Label>
                <Input value={editTour.notes ?? ""}
                  onChange={(e) => setEditTour({ ...editTour, notes: e.target.value || null })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTour(null)}>Abbrechen</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Speichert…" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
