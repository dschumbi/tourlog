import { prisma } from "@/lib/prisma";

// Belege liegen in der DB (StoredFile) und werden über diese Route ausgeliefert.
// Gespeichert wird nur der relative Pfad, z. B. "/api/files/<id>/beleg.pdf".
export const FILE_ROUTE = "/api/files/";

export function fileUrl(id: string, pathname: string) {
  const name = pathname.split("/").pop() || "datei";
  return `${FILE_ROUTE}${id}/${encodeURIComponent(name)}`;
}

export async function saveFile(pathname: string, file: File) {
  const data = new Uint8Array(await file.arrayBuffer());
  const stored = await prisma.storedFile.create({
    data: {
      pathname,
      contentType: file.type || "application/octet-stream",
      size: data.byteLength,
      data,
    },
    select: { id: true },
  });
  return fileUrl(stored.id, pathname);
}

// Lädt einen Beleg für die PDF-Erzeugung: eigene Dateien direkt aus der DB,
// alles andere (z. B. von Hand eingetragene externe Links) per fetch.
export async function loadFile(url: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (url.startsWith(FILE_ROUTE)) {
    const id = url.slice(FILE_ROUTE.length).split("/")[0];
    const file = await prisma.storedFile.findUnique({
      where: { id },
      select: { data: true, contentType: true },
    });
    return file ? { bytes: file.data, contentType: file.contentType } : null;
  }

  const res = await fetch(url);
  if (!res.ok) return null;
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") ?? "",
  };
}
