"use client";
import { useState, useEffect } from "react";
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
import { calculateFees, type TourKind, type TourTypeConfig } from "@/lib/tour-types";
import { Trash2, Plus } from "lucide-react";

const today = () => new Date().toISOString().split("T")[0];

const KIND_LABELS: Record<string, string> = {
  public: "Öffentlich",
  private: "Privat",
  cancelled_public: "Ausgefallen (öffentlich)",
  cancelled_private: "Ausgefallen (privat)",
};

interface Country { id: number; name: string; }

export default function ErfassenPage() {
  const [tourTypes, setTourTypes] = useState<TourTypeConfig[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
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
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [feeOverride, setFeeOverride] = useState("");
  const [notes, setNotes] = useState("");
  const [guests, setGuests] = useState<{ countryId: number; guestCount: number; tip: number }[]>([]);
  const [guestForm, setGuestForm] = useState<{ countryId: string; guestCount: string; tip: string }>({ countryId: "", guestCount: "", tip: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/tour-types").then((r) => r.json()).then(setTourTypes);
    fetch("/api/countries").then((r) => r.json()).then(setCountries);
  }, []);

  function addGuest() {
    if (!guestForm.countryId || !guestForm.guestCount) return;
    const countryId = Number(guestForm.countryId);
    if (guests.some((g) => g.countryId === countryId)) {
      toast.error("Dieses Land ist bereits eingetragen");
      return;
    }
    setGuests([...guests, { countryId, guestCount: Number(guestForm.guestCount), tip: Number(guestForm.tip) || 0 }]);
    setGuestForm({ countryId: "", guestCount: "", tip: "" });
  }

  const isCancelled = tourKind === "cancelled_public" || tourKind === "cancelled_private";
  const isPrivate = tourKind === "private";
  const selectedType = tourTypes.find((t) => t.id === tourType);
  const isFlatFee = selectedType?.flatFee != null;

  const fees = tourType && tourTypes.length > 0
    ? calculateFees({
        tourType,
        tourKind,
        paxCount: paxCount ? Number(paxCount) : null,
        hotelPickup,
        fiveStarReviews,
        cancellationWithin48h,
      }, tourTypes)
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tourType) { toast.error("Bitte Tour-Typ auswählen"); return; }
    setSaving(true);
    try {
      let mvvReceiptUrls: string[] = [];
      if (receiptFiles.length > 0) {
        const tourLabel = selectedType?.label ?? tourType;
        const shortId = Date.now().toString(36).slice(-4).toUpperCase();
        const folderPath = `receipts/${date} ${tourLabel} · ${shortId}`;

        const uploads = await Promise.all(
          receiptFiles.map(async (file) => {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("folderPath", folderPath);
            const up = await fetch("/api/upload", { method: "POST", body: fd });
            if (!up.ok) throw new Error("upload");
            return (await up.json()).url as string;
          })
        );
        mvvReceiptUrls = uploads;
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
          mvvReceiptUrls,
          feeOverride: feeOverride ? Number(feeOverride) : null,
          notes: notes || null,
          tourGuests: guests,
        }),
      });
      if (!res.ok) throw new Error("save");
      toast.success("Tour gespeichert!");
      setTourType(""); setTourKind("public"); setPaxCount("");
      setHotelPickup(false); setFiveStarReviews(0);
      setCancellationWithin48h(false); setCashCount("");
      setMvvSingle(""); setMvvGroup(""); setReceiptFiles([]);
      setFeeOverride(""); setNotes(""); setDate(today());
      setGuests([]); setGuestForm({ countryId: "", guestCount: "", tip: "" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(msg === "upload" ? "Beleg-Upload fehlgeschlagen" : "Fehler beim Speichern");
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
              <SelectTrigger id="tourType" className="w-full">
                <SelectValue>
                  {tourTypes.find((t) => t.id === tourType)?.label ?? "Tour auswählen…"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {tourTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="tourKind">Art</Label>
            <Select value={tourKind} onValueChange={(v) => { if (v) setTourKind(v as TourKind); }}>
              <SelectTrigger id="tourKind" className="w-full">
                <SelectValue>{KIND_LABELS[tourKind]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Öffentlich</SelectItem>
                <SelectItem value="private">Privat</SelectItem>
                <SelectItem value="cancelled_public">Ausgefallen (öffentlich)</SelectItem>
                <SelectItem value="cancelled_private">Ausgefallen (privat)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!isCancelled && !isFlatFee && (
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
                  <Label htmlFor="receipt">Belege hochladen</Label>
                  <Input id="receipt" type="file" accept="image/*,application/pdf" multiple
                    onChange={(e) => setReceiptFiles(Array.from(e.target.files ?? []))} />
                  {receiptFiles.length > 0 && (
                    <p className="text-xs text-gray-500">{receiptFiles.length} Datei(en) ausgewählt</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="notes">Notiz (optional)</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="z.B. Besondere Gruppe…" />
          </div>

          {countries.length > 0 && (
            <div className="space-y-2 pt-1">
              <Label>Herkunft & Trinkgeld</Label>
              {guests.length > 0 && (
                <div className="space-y-1">
                  {guests.map((g) => {
                    const name = countries.find((c) => c.id === g.countryId)?.name ?? "?";
                    return (
                      <div key={g.countryId} className="flex items-center justify-between text-sm bg-gray-50 rounded-md px-2 py-1">
                        <span className="flex-1 truncate">{name}</span>
                        <span className="text-gray-500 text-xs mx-2">{g.guestCount} Gäste · {g.tip.toFixed(2)} €</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400 shrink-0"
                          type="button"
                          onClick={() => setGuests(guests.filter((x) => x.countryId !== g.countryId))}>
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1 items-end">
                <div>
                  <Select value={guestForm.countryId}
                    onValueChange={(v) => v && setGuestForm({ ...guestForm, countryId: v })}>
                    <SelectTrigger className="w-full h-8">
                      <SelectValue>
                        {guestForm.countryId
                          ? countries.find((c) => c.id === Number(guestForm.countryId))?.name ?? "Land"
                          : "Land"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {countries.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input className="h-8 w-16" type="number" min={1} placeholder="Pax"
                  value={guestForm.guestCount}
                  onChange={(e) => setGuestForm({ ...guestForm, guestCount: e.target.value })} />
                <Input className="h-8 w-20" type="number" min={0} step={0.01} placeholder="Tip €"
                  value={guestForm.tip}
                  onChange={(e) => setGuestForm({ ...guestForm, tip: e.target.value })} />
                <Button type="button" size="icon" className="h-8 w-8" onClick={addGuest}
                  disabled={!guestForm.countryId || !guestForm.guestCount}>
                  <Plus size={14} />
                </Button>
              </div>
            </div>
          )}
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

      {fees && (
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-1">
              <Label htmlFor="feeOverride">Honorar überschreiben (optional)</Label>
              <Input
                id="feeOverride"
                type="number"
                min={0}
                step={0.01}
                value={feeOverride}
                onChange={(e) => setFeeOverride(e.target.value)}
                placeholder={fees.total.toFixed(2)}
              />
              <p className="text-xs text-gray-400">Leer lassen = berechnetes Honorar ({fees.total.toFixed(2)} €)</p>
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
