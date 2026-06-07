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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Pencil, Trash2, PlusCircle } from "lucide-react";

interface Expense {
  id: number;
  date: string;
  description: string;
  grossAmount: number;
  vatRate: number;
  receiptUrl: string | null;
  notes: string | null;
}

const today = () => new Date().toISOString().split("T")[0];

const emptyForm = (): Omit<Expense, "id"> => ({
  date: today(),
  description: "",
  grossAmount: 0,
  vatRate: 19,
  receiptUrl: null,
  notes: null,
});

const fmt = (n: number) => n.toFixed(2).replace(".", ",") + " €";

export default function AuslagenPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{ mode: "new" | "edit"; data: Omit<Expense, "id"> & { id?: number } } | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/auslagen");
    setExpenses(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setDialog({ mode: "new", data: emptyForm() });
  }

  function openEdit(e: Expense) {
    setDialog({ mode: "edit", data: { ...e, date: e.date.split("T")[0] } });
  }

  async function handleDelete(id: number) {
    if (!confirm("Auslage löschen?")) return;
    await fetch(`/api/auslagen/${id}`, { method: "DELETE" });
    toast.success("Auslage gelöscht");
    load();
  }

  async function handleSave() {
    if (!dialog) return;
    const { data } = dialog;
    if (!data.description.trim()) { toast.error("Bitte Beschreibung eingeben"); return; }
    if (!data.grossAmount || data.grossAmount <= 0) { toast.error("Bitte gültigen Betrag eingeben"); return; }

    setSaving(true);
    try {
      const isEdit = dialog.mode === "edit" && data.id != null;
      const res = await fetch(isEdit ? `/api/auslagen/${data.id}` : "/api/auslagen", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      toast.success(isEdit ? "Gespeichert" : "Auslage erfasst");
      setDialog(null);
      load();
    } catch {
      toast.error("Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  function update(patch: Partial<Omit<Expense, "id"> & { id?: number }>) {
    if (!dialog) return;
    setDialog({ ...dialog, data: { ...dialog.data, ...patch } });
  }

  const net = (e: Pick<Expense, "grossAmount" | "vatRate">) =>
    e.grossAmount / (1 + e.vatRate / 100);

  if (loading) return <p className="text-center text-gray-400 mt-10">Lädt…</p>;

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-semibold text-gray-700">Barauslagen</h2>
        <Button size="sm" onClick={openNew}>
          <PlusCircle size={16} className="mr-1" /> Neue Auslage
        </Button>
      </div>

      {expenses.length === 0 ? (
        <p className="text-center text-gray-400 mt-10">Noch keine Auslagen erfasst.</p>
      ) : (
        <div className="space-y-3">
          {expenses.map((e) => {
            const netVal = net(e);
            const billedGross = netVal * 1.19;
            const dateStr = new Date(e.date).toLocaleDateString("de-DE", {
              day: "2-digit", month: "2-digit", year: "numeric",
            });
            return (
              <Card key={e.id}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{e.description}</p>
                      <p className="text-xs text-gray-500">{dateStr}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                          Einkauf {fmt(e.grossAmount)} (brutto {e.vatRate}%)
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          Abrechnung {fmt(billedGross)} (netto {fmt(netVal)} + 19%)
                        </span>
                      </div>
                      {e.notes && (
                        <p className="text-xs text-gray-400 mt-1 truncate">{e.notes}</p>
                      )}
                      {e.receiptUrl && (
                        <a href={e.receiptUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-500 underline mt-1 block">
                          Beleg ansehen
                        </a>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0 mt-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => openEdit(e)}>
                        <Pencil size={14} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400"
                        onClick={() => handleDelete(e.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit" ? "Auslage bearbeiten" : "Neue Auslage"}
            </DialogTitle>
          </DialogHeader>
          {dialog && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Datum</Label>
                <Input type="date" value={dialog.data.date.split("T")[0]}
                  onChange={(e) => update({ date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Beschreibung</Label>
                <Input placeholder="z.B. Restaurant Augustiner"
                  value={dialog.data.description}
                  onChange={(e) => update({ description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Betrag (brutto)</Label>
                  <Input type="number" min={0} step={0.01}
                    value={dialog.data.grossAmount || ""}
                    onChange={(e) => update({ grossAmount: Number(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1">
                  <Label>MwSt. (Einkauf)</Label>
                  <Select
                    value={String(dialog.data.vatRate)}
                    onValueChange={(v) => v && update({ vatRate: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7%</SelectItem>
                      <SelectItem value="19">19%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {dialog.data.grossAmount > 0 && (
                <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600 space-y-0.5">
                  <div>Netto: <strong>{fmt(net(dialog.data))}</strong></div>
                  <div>Abrechnung brutto (19%): <strong>{fmt(net(dialog.data) * 1.19)}</strong></div>
                </div>
              )}
              <div className="space-y-1">
                <Label>Notiz (optional)</Label>
                <Input value={dialog.data.notes ?? ""}
                  onChange={(e) => update({ notes: e.target.value || null })} />
              </div>
              <div className="space-y-1">
                <Label>Beleg-URL (optional)</Label>
                <Input placeholder="https://…"
                  value={dialog.data.receiptUrl ?? ""}
                  onChange={(e) => update({ receiptUrl: e.target.value || null })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Abbrechen</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Speichert…" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
