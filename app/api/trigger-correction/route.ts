import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { year, month, correctsInvoiceId } = await req.json();

  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (!settings?.n8nWebhookUrl) {
    return NextResponse.json({ error: "n8n Webhook-URL nicht konfiguriert" }, { status: 400 });
  }

  try {
    const res = await fetch(settings.n8nWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, correctsInvoiceId }),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `n8n antwortete mit ${res.status}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Webhook nicht erreichbar" }, { status: 502 });
  }
}
