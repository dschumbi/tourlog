"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TOUR_TYPES, calculateFees, type TourKind } from "@/lib/tour-types";

const today = () => new Date().toISOString().split("T")[0];

export default function ErfassenPage() {
  const [date, setDate] = useState(today());
  const [tourType, setTourType] = useState("");
  const [tourKind, setTourKind] = useState<TourKind>("public");
  const [paxCount, setPaxCount] = useState("");
  const [hotelPickup, setHotelPickup] = useState(false);
  const [fiveStarReviews, setFiveStarReviews] = useState(0);
  const [cancellationWithin48h, setCancellationWithin48h] = useState(false);
  const [cashCount, setCashCount] = useState("");
  const [mvvSingle, setMvvSingle] = useState("");
  const [mvvGroup, setMvvGroup] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const isCancelled = tourKind === "cancelled_public" || tourKind === "cancelled_private";
  const isPrivate = tourKind === "private";
  const isStreetArt = tourType === "street_art";

  const fees = tourType
    ? calculateFees({
        tourType,
        tourKind,
        paxCount: paxCount ? Number(paxCount) : null,
        hotelPickup,
        fiveStarReviews,
        cancellationWithin48h,
      })
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tourType) { toast.error("Bitte Tour-Typ auswählen"); return; }
    setSaving(true);
    try {
      let mvvReceiptUrl: string | null = null;
      if (receiptFile) {
        const fd = new FormData();
        fd.append("file", receiptFile);
        const up = await fetch("/api/upload", { method: "POST", body: fd });
        if (!up.ok) throw new Error("Upload fehlgeschlagen");
        mvvReceiptUrl = (await up.json()).url;
      }
      const res = await fetch("/api/tours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date, tourType, tourKind,
          paxCount: paxCount ? Number(paxCount) : null,
          hotelPickup, fiveStarReviews, cancellationWithin48h,
          cashCount: cashCount ? Number(cashCount) : null,
          mvvSingleTickets: mvvSingle ? Number(mvvSingle) : 0,
          mvvGroupTickets: mvvGroup ? Number(mvvGroup) : 0,
          mvvReceiptUrl,
          notes: notes || null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Tour gespeichert!");
      setTourType(""); setTourKind("public"); setPaxCount("");
      setHotelPickup(false); setFiveStarReviews(0);
      setCancellationWithin48h(false); setCashCount("");
      setMvvSingle(""); setMvvGroup(""); setReceiptFile(null);
      setNotes(""); setDate(today());
    } catch {
      toast.error("Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tour erfassen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="date">Datum</Label>
            <Input id="date" type="date" value={date}
              onChange={(e) => setDate(e.target.value)} required />
          </div>

          <div className="space-y-1">
            <Label htmlFor="tourType">Tour-Typ</Label>
            <Select value={tourType} onValueChange={(v) => setTourType(v ?? "")}>
              <SelectTrigger id="tourType">
                <SelectValue placeholder="Tour auswählen…" />
              </SelectTrigger>
              <SelectContent>
                {TOUR_TYPES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="tourKind">Art</Label>
            <Select value={tourKind} onValueChange={(v) => setTourKind(v as TourKind)}>
              <SelectTrigger id="tourKind"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Öffentlich</SelectItem>
                <SelectItem value="private">Privat</SelectItem>
                <SelectItem value="cancelled_public">Ausgefallen (öffentlich)</SelectItem>
                <SelectItem value="cancelled_private">Ausgefallen (privat)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!isCancelled && !isStreetArt && (
            <div className="space-y-1">
              <Label htmlFor="pax">Teilnehmer (pax)</Label>
              <Input id="pax" type="number" min={1} value={paxCount}
                onChange={(e) => setPaxCount(e.target.value)} placeholder="z.B. 15" />
            </div>
          )}

          {!isCancelled && (
            <div className="space-y-1">
              <Label htmlFor="cash">Bargeld (Anzahl Gäste)</Label>
              <Input id="cash" type="number" min={0} value={cashCount}
                onChange={(e) => setCashCount(e.target.value)} placeholder="0" />
            </div>
          )}

          {isPrivate && (
            <div className="flex items-center justify-between">
              <Label htmlFor="hotel">Hotel-Abholung (+10 €)</Label>
              <Switch id="hotel" checked={hotelPickup} onCheckedChange={setHotelPickup} />
            </div>
          )}

          {tourKind === "cancelled_private" && (
            <div className="flex items-center justify-between">
              <Label htmlFor="within48h">Storniert innerhalb 48h (+20 €)</Label>
              <Switch id="within48h" checked={cancellationWithin48h}
                onCheckedChange={setCancellationWithin48h} />
            </div>
          )}

          {!isCancelled && (
            <div className="space-y-2">
              <Label>5★-Bewertungen (max. 3)</Label>
              <div className="flex gap-2">
                {[0, 1, 2, 3].map((n) => (
                  <button key={n} type="button" onClick={() => setFiveStarReviews(n)}
                    className={`flex-1 py-2 rounded-md border text-sm font-medium transition-colors ${
                      fiveStarReviews === n
                        ? "bg-yellow-400 border-yellow-400 text-white"
                        : "bg-white border-gray-200 text-gray-600"
                    }`}>
                    {n === 0 ? "—" : `${n} ★`}
                  </button>
                ))}
              </div>
              {fiveStarReviews > 0 && (
                <p className="text-xs text-gray-500">+{fiveStarReviews * 10} € Prämie</p>
              )}
            </div>
          )}

          {!isCancelled && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="mvvSingle">MVV Einzelkarten</Label>
                  <Input id="mvvSingle" type="number" min={0} value={mvvSingle}
                    onChange={(e) => setMvvSingle(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mvvGroup">MVV Gruppenkarten</Label>
                  <Input id="mvvGroup" type="number" min={0} value={mvvGroup}
                    onChange={(e) => setMvvGroup(e.target.value)} placeholder="0" />
                </div>
              </div>
              {(mvvSingle || mvvGroup) && (
                <div className="space-y-1">
                  <Label htmlFor="receipt">Beleg hochladen</Label>
                  <Input id="receipt" type="file" accept="image/*,application/pdf"
                    onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="notes">Notiz (optional)</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="z.B. Besondere Gruppe…" />
          </div>
        </CardContent>
      </Card>

      {fees && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4 space-y-1 text-sm">
            {fees.baseFee > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Honorar</span>
                <span>{fees.baseFee.toFixed(2)} €</span>
              </div>
            )}
            {fees.hotelPickupFee > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Hotel-Abholung</span>
                <span>+{fees.hotelPickupFee.toFixed(2)} €</span>
              </div>
            )}
            {fees.reviewBonus > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">5★-Prämie</span>
                <span>+{fees.reviewBonus.toFixed(2)} €</span>
              </div>
            )}
            {fees.cancellationFee > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Ausfallgeld</span>
                <span>{fees.cancellationFee.toFixed(2)} €</span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t border-blue-200 pt-1 mt-1">
              <span>Gesamt</span>
              <span>{fees.total.toFixed(2)} €</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? "Wird gespeichert…" : "Tour speichern"}
      </Button>
    </form>
  );
}
