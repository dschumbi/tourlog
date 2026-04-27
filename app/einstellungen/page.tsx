"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Settings {
  clientName: string;
  clientAddress: string;
  clientCity: string;
  clientEmail: string;
  invoicePrefix: string;
  paymentDays: number;
  mvvSinglePrice: number;
  mvvGroupPrice: number;
  n8nWebhookUrl: string;
}

const defaults: Settings = {
  clientName: "", clientAddress: "", clientCity: "", clientEmail: "",
  invoicePrefix: "RE", paymentDays: 14,
  mvvSinglePrice: 0, mvvGroupPrice: 0,
  n8nWebhookUrl: "",
};

export default function EinstellungenPage() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [hasPassword, setHasPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/auth/password").then((r) => r.json()),
    ]).then(([data, pw]) => {
      setSettings({ ...defaults, ...data });
      setHasPassword(pw.hasPassword);
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
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error();
      toast.success("Einstellungen gespeichert");
    } catch {
      toast.error("Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPassword) {
      toast.error("Passwörter stimmen nicht überein");
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) throw new Error();
      setHasPassword(!!newPassword);
      setNewPassword("");
      setConfirmPassword("");
      toast.success(newPassword ? "Passwort gesetzt" : "Passwort entfernt");
    } catch {
      toast.error("Fehler beim Speichern");
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) return <p className="text-center text-gray-400 mt-10">Lädt…</p>;

  return (
    <>
    <form onSubmit={handleSave} className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Veranstalter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="clientName">Name / Firma</Label>
            <Input id="clientName" value={settings.clientName}
              onChange={(e) => set("clientName", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="clientAddress">Straße & Hausnummer</Label>
            <Input id="clientAddress" value={settings.clientAddress}
              onChange={(e) => set("clientAddress", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="clientCity">PLZ & Ort</Label>
            <Input id="clientCity" value={settings.clientCity}
              onChange={(e) => set("clientCity", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="clientEmail">E-Mail</Label>
            <Input id="clientEmail" type="email" value={settings.clientEmail}
              onChange={(e) => set("clientEmail", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Rechnung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="invoicePrefix">Rechnungs-Präfix</Label>
            <Input id="invoicePrefix" value={settings.invoicePrefix}
              onChange={(e) => set("invoicePrefix", e.target.value)}
              placeholder="z.B. RE" />
            <p className="text-xs text-gray-400">Format: RE-2026-04-001</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="paymentDays">Zahlungsziel (Tage)</Label>
            <Input id="paymentDays" type="number" min={1}
              value={settings.paymentDays}
              onChange={(e) => set("paymentDays", Number(e.target.value))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">MVV Tickets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="mvvSinglePrice">Einzelkarte (€)</Label>
            <Input id="mvvSinglePrice" type="number" min={0} step={0.01}
              value={settings.mvvSinglePrice}
              onChange={(e) => set("mvvSinglePrice", Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mvvGroupPrice">Gruppenkarte (€)</Label>
            <Input id="mvvGroupPrice" type="number" min={0} step={0.01}
              value={settings.mvvGroupPrice}
              onChange={(e) => set("mvvGroupPrice", Number(e.target.value))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">n8n Automation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="n8nWebhookUrl">Webhook URL</Label>
            <Input id="n8nWebhookUrl" type="url" value={settings.n8nWebhookUrl}
              onChange={(e) => set("n8nWebhookUrl", e.target.value)}
              placeholder="https://dein-server.de/webhook/…" />
            <p className="text-xs text-gray-400">
              n8n Webhook-URL für die monatliche Rechnungserstellung
            </p>
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? "Wird gespeichert…" : "Einstellungen speichern"}
      </Button>
    </form>

    <form onSubmit={handlePasswordSave} className="space-y-4 mt-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Passwort-Schutz</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {hasPassword && (
            <p className="text-sm text-green-600 dark:text-green-400">
              Passwort ist aktiv
            </p>
          )}
          <div className="space-y-1">
            <Label htmlFor="newPassword">
              {hasPassword ? "Neues Passwort" : "Passwort setzen"}
            </Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={hasPassword ? "Leer lassen = unverändert" : ""}
            />
          </div>
          {newPassword && (
            <div className="space-y-1">
              <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}
          {hasPassword && (
            <p className="text-xs text-gray-400">
              Passwort entfernen: Felder leer lassen und speichern.
            </p>
          )}
        </CardContent>
      </Card>
      <Button type="submit" className="w-full" disabled={savingPassword}>
        {savingPassword ? "Wird gespeichert…" : "Passwort speichern"}
      </Button>
    </form>
    </>
  );
}
