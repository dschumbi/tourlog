import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  const blob = await put(`receipts/${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
  });
  return NextResponse.json({ url: blob.url });
}
