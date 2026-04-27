import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest) {
  const { password } = await req.json();

  if (password === "" || password == null) {
    await prisma.settings.upsert({
      where: { id: "singleton" },
      update: { passwordHash: "" },
      create: { id: "singleton", passwordHash: "" },
    });
    return NextResponse.json({ ok: true });
  }

  const passwordHash = await hash(password, 12);
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: { passwordHash },
    create: { id: "singleton", passwordHash },
  });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  return NextResponse.json({ hasPassword: !!settings?.passwordHash });
}
