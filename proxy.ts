import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const PUBLIC = ["/login", "/api/auth", "/api/invoice-data", "/api/merge-pdf"];

export async function proxy(req: NextRequest) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = req.cookies.get("session")?.value;
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret));
      return NextResponse.next();
    } catch {}
  }

  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.svg).*)"],
};
