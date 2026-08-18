"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface Settings {
  ownerName: string; ownerAddress: string; ownerCity: string;
  ownerEmail: string; ownerTaxId: string;
  bankName: string; bankIban: string; bankBic: string;
  clientName: string; clientAddress: string; clientCity: string; clientEmail: string;
  invoicePrefix: string; paymentDays: number;
  mvvSinglePrice: number; mvvGroupPrice: number;
  n8nWebhookUrl: string;
}

interface TourTypeRow {
  id: string; label: string; flatFee: number | null;
  tiers: { minPax: number; fee: number }[]; sortOrder: number;
}

interface TourTypeEdit {
  id?: string; label: string; pricingType: "flat" | "tiered";
  flatFee: string; tiers: { minPax: string; fee: string }[];
}

interface Country { id: number; name: string; }
interface CountryEdit { id?: number; name: string; }

const emptyTourTypeEdit = (): TourTypeEdit => ({
  label: "", pricingType: "tiered", flatFee: "", tiers: [{ minPax: "0", fee: "" }],
});

const defaults: Settings = {
  ownerName: "", ownerAddress: "", ownerCity: "", ownerEmail: "", ownerTaxId: "",
  bankName: "", bankIban: "", bankBic: "",
  clientName: "", clientAddress: "", clientCity: "", clientEmail: "",
  invoicePrefix: "RE", paymentDays: 14, mvvSinglePrice: 0, mvvGroupPrice: 0, n8nWebhookUrl: "",
};

type Tab = "allgemein" | "tourtypen" | "laender" | "passwort";

const TABS: { id: Tab; label: string }[] = [
  { id: "allgemein", label: "Allgemein" },
  { id: "tourtypen", label: "Tourtypen" },
  { id: "laender", label: "Länder" },
  { id: "passwort", label: "Passwort" },
];

export default function EinstellungenPage() {
  const [tab, setTab] = useState<Tab>("allgemein");
  const [settings, setSettings] = useState<Settings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [hasPassword, setHasPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [tourTypes, setTourTypes] = useState<TourTypeRow[]>([]);
  const [editDialog, setEditDialog] = useState<TourTypeEdit | null>(null);
  const [savingType, setSavingType] = useState(false);

  const [countries, setCountries] = useState<Country[]>([]);
  const [countryDialog, setCountryDialog] = useState<CountryEdit | null>(null);
  const [savingCountry, setSavingCountry] = useState(false);

  async function loadTourTypes() {
    const res = await fetch("/api/tour-types");
    setTourTypes(await res.json());
  }

  async function loadCountries() {
    const res = await fetch("/api/countries");
    const data: Country[] = await res.json();
    setCountries([...data].sort((a, b) => a.name.localeCompare(b.name, "de")));
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/auth/password").then((r) => r.json()),
      fetch("/api/tour-types").then((r) => r.json()),
      fetch("/api/countries").then((r) => r.json()),
    ]).then(([data, pw, types, ctrs]) => {
      setSettings({ ...defaults, ...data });
      setHasPassword(pw.hasPassword);
      setTourTypes(types);
      setCountries([...ctrs].sort((a: Country, b: Country) => a.name.localeCompare(b.name, "de")));
      setLoading(false);
    });
  }, []);

  function set(key: keyof Settings, value: string | number) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error();
      toast.success("Einstellungen gespeichert");
    } catch { toast.error("Fehler beim Speichern"); }
    finally { setSaving(false); }
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPassword) { toast.error("Passwörter stimmen nicht überein"); return; }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) throw new Error();
      setHasPassword(!!newPassword);
      setNewPassword(""); setConfirmPassword("");
      toast.success(newPassword ? "Passwort gesetzt" : "Passwort entfernt");
    } catch { toast.error("Fehler beim Speichern"); }
    finally { setSavingPassword(false); }
  }

  async function handleSaveTourType() {
    if (!editDialog) return;
    if (!editDialog.label.trim()) { toast.error("Name erforderlich"); return; }
    setSavingType(true);
    try {
      const payload = {
        label: editDialog.label.trim(),
        flatFee: editDialog.pricingType === "flat" && editDialog.flatFee ? Number(editDialog.flatFee) : null,
        tiers: editDialog.pricingType === "tiered"
          ? editDialog.tiers.filter((r) => r.fee !== "").map((r) => ({ minPax: Number(r.minPax) || 0, fee: Number(r.fee) }))
          : [],
      };
      const res = editDialog.id
        ? await fetch(`/api/tour-types/${editDialog.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/tour-types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error();
      toast.success(editDialog.id ? "Tourtyp gespeichert" : "Tourtyp erstellt");
      setEditDialog(null);
      loadTourTypes();
    } catch { toast.error("Fehler beim Speichern"); }
    finally { setSavingType(false); }
  }

  async function handleDeleteTourType(id: string) {
    if (!confirm("Tourtyp löschen?")) return;
    const res = await fetch(`/api/tour-types/${id}`, { method: "DELETE" });
    if (res.status === 409) { const { error } = await res.json(); toast.error(error); return; }
    if (!res.ok) { toast.error("Fehler beim Löschen"); return; }
    toast.success("Tourtyp gelöscht");
    loadTourTypes();
  }

  async function handleSaveCountry() {
    if (!countryDialog) return;
    if (!countryDialog.name.trim()) { toast.error("Name erforderlich"); return; }
    setSavingCountry(true);
    try {
      const payload = { name: countryDialog.name.trim() };
      const res = countryDialog.id
        ? await fetch(`/api/countries/${countryDialog.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/countries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error();
      toast.success(countryDialog.id ? "Land gespeichert" : "Land erstellt");
      setCountryDialog(null);
      loadCountries();
    } catch { toast.error("Fehler beim Speichern"); }
    finally { setSavingCountry(false); }
  }

  async function handleDeleteCountry(id: number) {
    if (!confirm("Land löschen?")) return;
    const res = await fetch(`/api/countries/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Fehler beim Löschen"); return; }
    toast.success("Land gelöscht");
    loadCountries();
  }

  function tiersSummary(t: TourTypeRow): string {
    if (t.flatFee != null) return `${t.flatFee} € pauschal`;
    if (t.tiers.length === 0) return "–";
    return t.tiers.map((r) => `ab ${r.minPax} pax: ${r.fee} €`).join(" · ");
  }

  if (loading) return <p className="text-center text-gray-400 mt-10">Lädt…</p>;

  return (
    <>
      {/* Tab bar */}
      <div className="flex border-b mb-5 -mx-1 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Allgemein */}
      {tab === "allgemein" && (
        <form onSubmit={handleSave} className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Meine Daten</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {([
                ["ownerName", "Name / Firma"],
                ["ownerAddress", "Straße & Hausnummer"],
                ["ownerCity", "PLZ & Ort"],
                ["ownerEmail", "E-Mail"],
                ["ownerTaxId", "Steuernummer"],
              ] as [keyof Settings, string][]).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={key}>{label}</Label>
                  <Input id={key} value={String(settings[key])}
                    onChange={(e) => set(key, e.target.value)} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Bankverbindung</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {([
                ["bankName", "Bank"],
                ["bankIban", "IBAN"],
                ["bankBic", "BIC"],
              ] as [keyof Settings, string][]).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={key}>{label}</Label>
                  <Input id={key} value={String(settings[key])}
                    onChange={(e) => set(key, e.target.value)} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Veranstalter</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {([
                ["clientName", "Name / Firma"],
                ["clientAddress", "Straße & Hausnummer"],
                ["clientCity", "PLZ & Ort"],
                ["clientEmail", "E-Mail"],
              ] as [keyof Settings, string][]).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={key}>{label}</Label>
                  <Input id={key} value={String(settings[key])}
                    onChange={(e) => set(key, e.target.value)} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Rechnung</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="invoicePrefix">Rechnungs-Präfix</Label>
                <Input id="invoicePrefix" value={settings.invoicePrefix}
                  onChange={(e) => set("invoicePrefix", e.target.value)} placeholder="z.B. RE" />
                <p className="text-xs text-gray-400">Format: RE-2026-04-001</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="paymentDays">Zahlungsziel (Tage)</Label>
                <Input id="paymentDays" type="number" min={1} value={settings.paymentDays}
                  onChange={(e) => set("paymentDays", Number(e.target.value))} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">MVV Tickets</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="mvvSinglePrice">Einzelkarte (€)</Label>
                <Input id="mvvSinglePrice" type="number" min={0} step={0.01} value={settings.mvvSinglePrice}
                  onChange={(e) => set("mvvSinglePrice", Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mvvGroupPrice">Gruppenkarte (€)</Label>
                <Input id="mvvGroupPrice" type="number" min={0} step={0.01} value={settings.mvvGroupPrice}
                  onChange={(e) => set("mvvGroupPrice", Number(e.target.value))} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">n8n Automation</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1">
                <Label htmlFor="n8nWebhookUrl">Webhook URL</Label>
                <Input id="n8nWebhookUrl" type="url" value={settings.n8nWebhookUrl}
                  onChange={(e) => set("n8nWebhookUrl", e.target.value)}
                  placeholder="https://dein-server.de/webhook/…" />
                <p className="text-xs text-gray-400">n8n Webhook-URL für die monatliche Rechnungserstellung</p>
              </div>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Wird gespeichert…" : "Einstellungen speichern"}
          </Button>
        </form>
      )}

      {/* Tourtypen */}
      {tab === "tourtypen" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setEditDialog(emptyTourTypeEdit())}>
              <Plus size={14} className="mr-1" /> Neuer Typ
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {tourTypes.map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-2 px-4 py-3 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="text-xs text-gray-400 truncate">{tiersSummary(t)}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7"
                      onClick={() => setEditDialog({
                        id: t.id, label: t.label,
                        pricingType: t.flatFee != null ? "flat" : "tiered",
                        flatFee: t.flatFee != null ? String(t.flatFee) : "",
                        tiers: t.tiers.length > 0
                          ? t.tiers.map((r) => ({ minPax: String(r.minPax), fee: String(r.fee) }))
                          : [{ minPax: "0", fee: "" }],
                      })}>
                      <Pencil size={13} />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400"
                      onClick={() => handleDeleteTourType(t.id)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              ))}
              {tourTypes.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Noch keine Tourtypen</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Länder */}
      {tab === "laender" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" variant="outline"
              onClick={() => setCountryDialog({ name: "" })}>
              <Plus size={14} className="mr-1" /> Neues Land
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {countries.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 px-4 py-3 border-b last:border-0">
                  <p className="text-sm font-medium">{c.name}</p>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7"
                      onClick={() => setCountryDialog({ id: c.id, name: c.name })}>
                      <Pencil size={13} />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400"
                      onClick={() => handleDeleteCountry(c.id)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              ))}
              {countries.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Noch keine Länder gepflegt</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Passwort */}
      {tab === "passwort" && (
        <form onSubmit={handlePasswordSave} className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Passwort-Schutz</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {hasPassword && <p className="text-sm text-green-600">Passwort ist aktiv</p>}
              <div className="space-y-1">
                <Label htmlFor="newPassword">{hasPassword ? "Neues Passwort" : "Passwort setzen"}</Label>
                <Input id="newPassword" type="password" value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={hasPassword ? "Leer lassen = unverändert" : ""} />
              </div>
              {newPassword && (
                <div className="space-y-1">
                  <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
                  <Input id="confirmPassword" type="password" value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)} />
                </div>
              )}
              {hasPassword && <p className="text-xs text-gray-400">Felder leer lassen und speichern = Passwort entfernen</p>}
            </CardContent>
          </Card>
          <Button type="submit" className="w-full" disabled={savingPassword}>
            {savingPassword ? "Wird gespeichert…" : "Passwort speichern"}
          </Button>
        </form>
      )}

      {/* Tourtyp Dialog */}
      <Dialog open={!!editDialog} onOpenChange={(o) => !o && setEditDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editDialog?.id ? "Tourtyp bearbeiten" : "Neuer Tourtyp"}</DialogTitle>
          </DialogHeader>
          {editDialog && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={editDialog.label}
                  onChange={(e) => setEditDialog({ ...editDialog, label: e.target.value })}
                  placeholder="z.B. Altstadt (1,5 Std.)" />
              </div>
              <div className="space-y-1">
                <Label>Preismodell</Label>
                <div className="flex rounded-md border overflow-hidden">
                  {(["tiered", "flat"] as const).map((type) => (
                    <button key={type} type="button"
                      onClick={() => setEditDialog({ ...editDialog, pricingType: type })}
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${
                        editDialog.pricingType === type ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                      }`}>
                      {type === "tiered" ? "Staffelpreise" : "Pauschalpreis"}
                    </button>
                  ))}
                </div>
              </div>
              {editDialog.pricingType === "flat" ? (
                <div className="space-y-1">
                  <Label>Pauschalpreis (€)</Label>
                  <Input type="number" min={0} step={0.01} value={editDialog.flatFee}
                    onChange={(e) => setEditDialog({ ...editDialog, flatFee: e.target.value })}
                    placeholder="z.B. 120" />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Preisstufen</Label>
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-1 text-xs text-gray-500 px-1">
                    <span>ab Pax</span><span>Honorar €</span><span />
                  </div>
                  {editDialog.tiers.map((tier, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1 items-center">
                      <Input type="number" min={0} value={tier.minPax}
                        onChange={(e) => {
                          const tiers = [...editDialog.tiers];
                          tiers[i] = { ...tiers[i], minPax: e.target.value };
                          setEditDialog({ ...editDialog, tiers });
                        }} />
                      <Input type="number" min={0} step={0.01} value={tier.fee} placeholder="€"
                        onChange={(e) => {
                          const tiers = [...editDialog.tiers];
                          tiers[i] = { ...tiers[i], fee: e.target.value };
                          setEditDialog({ ...editDialog, tiers });
                        }} />
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400" type="button"
                        onClick={() => {
                          const tiers = editDialog.tiers.filter((_, j) => j !== i);
                          setEditDialog({ ...editDialog, tiers: tiers.length > 0 ? tiers : [{ minPax: "0", fee: "" }] });
                        }}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" className="w-full"
                    onClick={() => setEditDialog({ ...editDialog, tiers: [...editDialog.tiers, { minPax: "", fee: "" }] })}>
                    <Plus size={13} className="mr-1" /> Stufe hinzufügen
                  </Button>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>Abbrechen</Button>
            <Button onClick={handleSaveTourType} disabled={savingType}>
              {savingType ? "Speichert…" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Land Dialog */}
      <Dialog open={!!countryDialog} onOpenChange={(o) => !o && setCountryDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{countryDialog?.id ? "Land bearbeiten" : "Neues Land"}</DialogTitle>
          </DialogHeader>
          {countryDialog && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={countryDialog.name}
                  onChange={(e) => setCountryDialog({ ...countryDialog, name: e.target.value })}
                  placeholder="z.B. Deutschland" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCountryDialog(null)}>Abbrechen</Button>
            <Button onClick={handleSaveCountry} disabled={savingCountry}>
              {savingCountry ? "Speichert…" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
