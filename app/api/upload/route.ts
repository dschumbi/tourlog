import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;
  const folderPath = (formData.get("folderPath") as string | null) ?? "receipts";
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  try {
    const blob = await put(`${folderPath}/${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Blob upload error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
