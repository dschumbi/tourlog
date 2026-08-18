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
import { calculateFees, type TourKind, type TourTypeConfig } from "@/lib/tour-types";
import { Pencil, Trash2, Plus, ChevronLeft, ChevronRight } from "lucide-react";

interface TourGuestItem {
  id: number;
  countryId: number;
  country: { id: number; name: string };
  guestCount: number;
  tip: number;
}

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
  mvvSingleTickets: number;
  mvvGroupTickets: number;
  mvvReceiptUrls: string[];
  feeOverride: number | null;
  notes: string | null;
  tourGuests: TourGuestItem[];
}

interface Country { id: number; name: string; }

interface SimpleExpense {
  id: number;
  description: string;
  grossAmount: number;
  vatRate: number;
  tourId: number | null;
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

const fmtE = (n: number) => n.toFixed(2).replace(".", ",") + " €";

export default function TourenPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tours, setTours] = useState<Tour[]>([]);
  const [tourTypes, setTourTypes] = useState<TourTypeConfig[]>([]);
  const [expenses, setExpenses] = useState<SimpleExpense[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTour, setEditTour] = useState<Tour | null>(null);
  const [editGuests, setEditGuests] = useState<{ countryId: number; guestCount: number; tip: number }[]>([]);
  const [guestForm, setGuestForm] = useState<{ countryId: string; guestCount: string; tip: string }>({ countryId: "", guestCount: "", tip: "" });
  const [editReceiptUrls, setEditReceiptUrls] = useState<string[]>([]);
  const [editNewFiles, setEditNewFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [toursRes, typesRes, expRes, ctrRes] = await Promise.all([
      fetch(`/api/tours?year=${year}&month=${month}`),
      fetch("/api/tour-types"),
      fetch("/api/auslagen"),
      fetch("/api/countries"),
    ]);
    setTours(await toursRes.json());
    setTourTypes(await typesRes.json());
    setExpenses(await expRes.json());
    const countriesData: Country[] = await ctrRes.json();
    setCountries([...countriesData].sort((a, b) => a.name.localeCompare(b.name, "de")));
    setLoading(false);
  }

  useEffect(() => { load(); }, [year, month]);

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }

  const monthName = new Date(year, month - 1).toLocaleDateString("de-DE", {
    month: "long", year: "numeric",
  });

  async function handleDelete(id: number) {
    if (!confirm("Tour löschen?")) return;
    await fetch(`/api/tours/${id}`, { method: "DELETE" });
    toast.success("Tour gelöscht");
    load();
  }

  function openEdit(tour: Tour) {
    setEditTour({ ...tour, date: tour.date.split("T")[0] });
    setEditGuests(tour.tourGuests.map((g) => ({ countryId: g.countryId, guestCount: g.guestCount, tip: g.tip })));
    setGuestForm({ countryId: "", guestCount: "", tip: "" });
    setEditReceiptUrls(tour.mvvReceiptUrls ?? []);
    setEditNewFiles([]);
  }

  function addGuest() {
    if (!guestForm.countryId || !guestForm.guestCount) return;
    const countryId = Number(guestForm.countryId);
    if (editGuests.some((g) => g.countryId === countryId)) {
      toast.error("Dieses Land ist bereits eingetragen");
      return;
    }
    setEditGuests([...editGuests, { countryId, guestCount: Number(guestForm.guestCount), tip: Number(guestForm.tip) || 0 }]);
    setGuestForm({ countryId: "", guestCount: "", tip: "" });
  }

  async function handleSave() {
    if (!editTour) return;
    setSaving(true);
    try {
      let mvvReceiptUrls = editReceiptUrls;
      if (editNewFiles.length > 0) {
        const tourLabel = tourTypes.find((t) => t.id === editTour.tourType)?.label ?? editTour.tourType;
        const folderPath = `receipts/${editTour.date.split("T")[0]} ${tourLabel} · ${editTour.id}`;
        const uploads = await Promise.all(
          editNewFiles.map(async (file) => {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("folderPath", folderPath);
            const up = await fetch("/api/upload", { method: "POST", body: fd });
            if (!up.ok) throw new Error("upload");
            return (await up.json()).url as string;
          })
        );
        mvvReceiptUrls = [...editReceiptUrls, ...uploads];
      }
      const res = await fetch(`/api/tours/${editTour.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editTour,
          date: editTour.date.split("T")[0],
          paxCount: editTour.paxCount ?? null,
          mvvReceiptUrls,
          tourGuests: editGuests,
        }),
      });
      if (!res.ok) throw new Error("save");
      toast.success("Gespeichert");
      setEditTour(null);
      load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(msg === "upload" ? "Beleg-Upload fehlgeschlagen" : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  const tourLabel = (id: string) =>
    tourTypes.find((t) => t.id === id)?.label ?? id;

  const editIsFlatFee = editTour
    ? tourTypes.find((t) => t.id === editTour.tourType)?.flatFee != null
    : false;
  const editIsCancelled = editTour
    ? editTour.tourKind === "cancelled_public" || editTour.tourKind === "cancelled_private"
    : false;
  const editIsPrivate = editTour?.tourKind === "private";
  const editFees = editTour
    ? calculateFees({
        tourType: editTour.tourType,
        tourKind: editTour.tourKind as TourKind,
        paxCount: editTour.paxCount,
        hotelPickup: editTour.hotelPickup,
        fiveStarReviews: editTour.fiveStarReviews,
        cancellationWithin48h: editTour.cancellationWithin48h,
      }, tourTypes)
    : null;

  const monthTotal = tours.reduce((sum, tour) => {
    const fees = calculateFees({
      tourType: tour.tourType,
      tourKind: tour.tourKind as TourKind,
      paxCount: tour.paxCount,
      hotelPickup: tour.hotelPickup,
      fiveStarReviews: tour.fiveStarReviews,
      cancellationWithin48h: tour.cancellationWithin48h,
    }, tourTypes);
    return sum + (tour.feeOverride ?? fees.total);
  }, 0);

  return (
    <>
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft /></Button>
        <h2 className="font-semibold text-base">{monthName}</h2>
        <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight /></Button>
      </div>

      {!loading && tours.length > 0 && (
        <div className="flex justify-between items-center text-sm text-gray-500 px-1 mb-3">
          <span>{tours.length} {tours.length === 1 ? "Tour" : "Touren"}</span>
          <span className="font-medium text-gray-700">{fmtE(monthTotal)}</span>
        </div>
      )}

      {loading ? (
        <p className="text-center text-gray-400 mt-10">Lädt…</p>
      ) : tours.length === 0 ? (
        <p className="text-center text-gray-400 mt-10">Keine Touren in diesem Monat.</p>
      ) : (
      <div className="space-y-3">
        {tours.map((tour) => {
          const fees = calculateFees({
            tourType: tour.tourType,
            tourKind: tour.tourKind as TourKind,
            paxCount: tour.paxCount,
            hotelPickup: tour.hotelPickup,
            fiveStarReviews: tour.fiveStarReviews,
            cancellationWithin48h: tour.cancellationWithin48h,
          }, tourTypes);
          const dateStr = new Date(tour.date).toLocaleDateString("de-DE", {
            day: "2-digit", month: "2-digit", year: "numeric",
          });
          const linkedExpenses = expenses.filter((e) => e.tourId === tour.id);
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
                      {tour.mvvSingleTickets > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                          {tour.mvvSingleTickets}× Einzel
                        </span>
                      )}
                      {tour.mvvGroupTickets > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                          {tour.mvvGroupTickets}× Gruppe
                        </span>
                      )}
                      {tour.mvvReceiptUrls?.map((url, i) => (
                        <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                          className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 underline">
                          Beleg {tour.mvvReceiptUrls.length > 1 ? i + 1 : ""}
                        </a>
                      ))}
                    </div>
                    {tour.notes && (
                      <p className="text-xs text-gray-400 mt-1 truncate">{tour.notes}</p>
                    )}
                    {linkedExpenses.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {linkedExpenses.map((ex) => (
                          <p key={ex.id} className="text-xs text-gray-500">
                            💳 {ex.description} · {fmtE(ex.grossAmount)} brutto ({ex.vatRate}%)
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="font-semibold text-sm">
                      {(tour.feeOverride ?? fees.total).toFixed(2)} €
                      {tour.feeOverride != null && (
                        <span className="ml-1 text-xs font-normal text-orange-500" title={`Berechnet: ${fees.total.toFixed(2)} €`}>✱</span>
                      )}
                    </span>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => openEdit(tour)}>
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
      )}

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
                <Label>Tour-Typ</Label>
                <Select value={editTour.tourType}
                  onValueChange={(v) => setEditTour({ ...editTour, tourType: v ?? editTour.tourType })}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {tourTypes.find((t) => t.id === editTour.tourType)?.label ?? editTour.tourType}
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
                <Label>Art</Label>
                <Select value={editTour.tourKind}
                  onValueChange={(v) => setEditTour({ ...editTour, tourKind: v ?? editTour.tourKind })}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{KIND_LABELS[editTour.tourKind]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Öffentlich</SelectItem>
                    <SelectItem value="private">Privat</SelectItem>
                    <SelectItem value="cancelled_public">Ausgefallen (öffentlich)</SelectItem>
                    <SelectItem value="cancelled_private">Ausgefallen (privat)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editIsPrivate && (
                <div className="flex items-center justify-between">
                  <Label>Hotel-Abholung (+10 €)</Label>
                  <Switch checked={editTour.hotelPickup}
                    onCheckedChange={(v) => setEditTour({ ...editTour, hotelPickup: v })} />
                </div>
              )}
              {editTour.tourKind === "cancelled_private" && (
                <div className="flex items-center justify-between">
                  <Label>Storniert innerhalb 48h (+20 €)</Label>
                  <Switch checked={editTour.cancellationWithin48h}
                    onCheckedChange={(v) => setEditTour({ ...editTour, cancellationWithin48h: v })} />
                </div>
              )}
              {!editIsCancelled && (
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
              )}
              {!editIsFlatFee && !editIsCancelled && (
                <div className="space-y-1">
                  <Label>Teilnehmer</Label>
                  <Input type="number" min={1}
                    value={editTour.paxCount ?? ""}
                    onChange={(e) => setEditTour({
                      ...editTour,
                      paxCount: e.target.value ? Number(e.target.value) : null,
                    })} />
                </div>
              )}
              {!editIsCancelled && (
                <div className="space-y-1">
                  <Label>Bargeld (Anzahl Gäste)</Label>
                  <Input type="number" min={0}
                    value={editTour.cashCount ?? ""}
                    onChange={(e) => setEditTour({
                      ...editTour,
                      cashCount: e.target.value ? Number(e.target.value) : null,
                    })} />
                </div>
              )}
              {!editIsCancelled && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>MVV Einzelkarten</Label>
                    <Input type="number" min={0}
                      value={editTour.mvvSingleTickets || ""}
                      onChange={(e) => setEditTour({
                        ...editTour,
                        mvvSingleTickets: Number(e.target.value) || 0,
                      })} />
                  </div>
                  <div className="space-y-1">
                    <Label>MVV Gruppenkarten</Label>
                    <Input type="number" min={0}
                      value={editTour.mvvGroupTickets || ""}
                      onChange={(e) => setEditTour({
                        ...editTour,
                        mvvGroupTickets: Number(e.target.value) || 0,
                      })} />
                  </div>
                </div>
              )}
              {!editIsCancelled && (editTour.mvvSingleTickets > 0 || editTour.mvvGroupTickets > 0 || editReceiptUrls.length > 0 || editNewFiles.length > 0) && (
                <div className="space-y-1">
                  <Label>Belege</Label>
                  {editReceiptUrls.length > 0 && (
                    <div className="space-y-1">
                      {editReceiptUrls.map((url, i) => (
                        <div key={url} className="flex items-center justify-between text-sm bg-gray-50 rounded-md px-2 py-1">
                          <a href={url} target="_blank" rel="noopener noreferrer"
                            className="flex-1 truncate underline text-gray-600">
                            Beleg {editReceiptUrls.length > 1 ? i + 1 : ""}
                          </a>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400 shrink-0"
                            type="button"
                            onClick={() => setEditReceiptUrls(editReceiptUrls.filter((u) => u !== url))}>
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Input type="file" accept="image/*,application/pdf" multiple
                    onChange={(e) => setEditNewFiles(Array.from(e.target.files ?? []))} />
                  {editNewFiles.length > 0 && (
                    <p className="text-xs text-gray-500">{editNewFiles.length} neue Datei(en) ausgewählt</p>
                  )}
                </div>
              )}
              {editFees && (
                <div className="rounded-md bg-blue-50 border border-blue-200 p-3 space-y-1 text-sm">
                  {editFees.baseFee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Honorar</span>
                      <span>{editFees.baseFee.toFixed(2)} €</span>
                    </div>
                  )}
                  {editFees.hotelPickupFee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Hotel-Abholung</span>
                      <span>+{editFees.hotelPickupFee.toFixed(2)} €</span>
                    </div>
                  )}
                  {editFees.reviewBonus > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">5★-Prämie</span>
                      <span>+{editFees.reviewBonus.toFixed(2)} €</span>
                    </div>
                  )}
                  {editFees.cancellationFee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Ausfallgeld</span>
                      <span>{editFees.cancellationFee.toFixed(2)} €</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t border-blue-200 pt-1 mt-1">
                    <span>Gesamt</span>
                    <span>{editFees.total.toFixed(2)} €</span>
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label>Honorar überschreiben (optional)</Label>
                <Input type="number" min={0} step={0.01}
                  value={editTour.feeOverride ?? ""}
                  placeholder="Leer = automatisch"
                  onChange={(e) => setEditTour({
                    ...editTour,
                    feeOverride: e.target.value ? Number(e.target.value) : null,
                  })} />
              </div>
              <div className="space-y-1">
                <Label>Notiz</Label>
                <Input value={editTour.notes ?? ""}
                  onChange={(e) => setEditTour({ ...editTour, notes: e.target.value || null })} />
              </div>

              {/* Herkunft & Trinkgeld */}
              {countries.length > 0 && (
                <div className="space-y-2 pt-1">
                  <Label>Herkunft & Trinkgeld</Label>
                  {editGuests.length > 0 && (
                    <div className="space-y-1">
                      {editGuests.map((g) => {
                        const name = countries.find((c) => c.id === g.countryId)?.name ?? "?";
                        return (
                          <div key={g.countryId} className="flex items-center justify-between text-sm bg-gray-50 rounded-md px-2 py-1">
                            <span className="flex-1 truncate">{name}</span>
                            <span className="text-gray-500 text-xs mx-2">{g.guestCount} Gäste · {g.tip.toFixed(2)} €</span>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400 shrink-0"
                              type="button"
                              onClick={() => setEditGuests(editGuests.filter((x) => x.countryId !== g.countryId))}>
                              <Trash2 size={12} />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-1 items-end">
                    <div className="min-w-0">
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
