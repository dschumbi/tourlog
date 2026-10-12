import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Nur diese Typen werden im Browser angezeigt, alles andere als Download
// (verhindert, dass hochgeladenes HTML/SVG unter unserer Domain ausgeführt wird).
const INLINE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/gif"];

// Liefert einen gespeicherten Beleg aus. Nicht in der PUBLIC-Liste von proxy.ts,
// d. h. nur mit gültiger Session abrufbar. Der [name]-Teil der URL ist nur kosmetisch.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; name: string }> }
) {
  const { id } = await params;
  const file = await prisma.storedFile.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const inline = INLINE_TYPES.includes(file.contentType);
  const filename = encodeURIComponent(file.pathname.split("/").pop() || "datei");

  return new NextResponse(Buffer.from(file.data), {
    headers: {
      "Content-Type": inline ? file.contentType : "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
