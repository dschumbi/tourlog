import { compare } from "bcryptjs";
import { SignJWT } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const secret = process.env.SESSION_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (!settings?.passwordHash) {
    return NextResponse.json({ error: "No password set" }, { status: 401 });
  }

  const valid = await compare(password, settings.passwordHash);
  if (!valid) return NextResponse.json({ error: "Invalid password" }, { status: 401 });

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(new TextEncoder().encode(secret));

  const res = NextResponse.json({ ok: true });
  res.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
