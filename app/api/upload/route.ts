import { NextRequest, NextResponse } from "next/server";
import { saveFile } from "@/lib/files";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;
  const folderPath = (formData.get("folderPath") as string | null) ?? "receipts";
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  try {
    const url = await saveFile(`${folderPath}/${file.name}`, file);
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Upload error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
