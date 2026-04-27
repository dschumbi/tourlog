import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (!settings?.n8nWebhookUrl) {
    return NextResponse.json({ error: "Kein Webhook konfiguriert" }, { status: 400 });
  }

  const payload = await req.json();
  const res = await fetch(settings.n8nWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json({ error: `n8n Fehler: ${res.status}`, detail: text }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
