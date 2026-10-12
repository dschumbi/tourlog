// Einmaliger Umzug: Vercel Blob → Tabelle "StoredFile", URLs in Tour/Expense umschreiben.
// Probelauf:  node --env-file=.env.local scripts/migrate-blob-to-db.mjs
// Ausführen:  node --env-file=.env.local scripts/migrate-blob-to-db.mjs --apply
import { list } from "@vercel/blob";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const APPLY = process.argv.includes("--apply");
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const fileUrl = (id, pathname) =>
  `/api/files/${id}/${encodeURIComponent(pathname.split("/").pop() || "datei")}`;

// 1. Alle Blobs auflisten
const blobs = [];
let cursor;
do {
  const r = await list({ cursor, limit: 1000 });
  blobs.push(...r.blobs);
  cursor = r.cursor;
} while (cursor);
console.log(`Blobs im Store: ${blobs.length}`);

// 2. Welche Blob-URLs stehen in der DB?
const { rows: tours } = await db.query(`select id, "mvvReceiptUrls" from "Tour" where cardinality("mvvReceiptUrls") > 0`);
const { rows: expenses } = await db.query(`select id, "receiptUrl" from "Expense" where "receiptUrl" is not null`);
const isBlob = (u) => u.includes(".blob.vercel-storage.com/");
const referenced = new Set([
  ...tours.flatMap((t) => t.mvvReceiptUrls).filter(isBlob),
  ...expenses.map((e) => e.receiptUrl).filter(isBlob),
]);
const blobByUrl = new Map(blobs.map((b) => [b.url, b]));
const missing = [...referenced].filter((u) => !blobByUrl.has(u));
const unreferenced = blobs.filter((b) => !referenced.has(b.url));
console.log(`In DB referenziert: ${referenced.size} | fehlen im Store: ${missing.length} | nicht referenziert: ${unreferenced.length}`);
for (const u of missing) console.log("  FEHLT:", u);
for (const b of unreferenced) console.log("  ungenutzt:", b.pathname);

// Schon umgezogene Dateien nicht doppelt anlegen (Skript ist wiederholbar)
const { rows: existing } = await db.query(`select id, pathname from "StoredFile"`).catch(() => ({ rows: [] }));
const existingByPath = new Map(existing.map((f) => [f.pathname, f.id]));

// 3. Alle Blobs kopieren (auch ungenutzte, zur Sicherheit)
const urlMap = new Map();
for (const b of blobs) {
  let id = existingByPath.get(b.pathname);
  if (!id) {
    id = randomUUID();
    if (APPLY) {
      const res = await fetch(b.url);
      if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status}): ${b.pathname}`);
      const data = Buffer.from(await res.arrayBuffer());
      const type = res.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
      await db.query(
        `insert into "StoredFile" (id, pathname, "contentType", size, data, "createdAt") values ($1,$2,$3,$4,$5,$6)`,
        [id, b.pathname, type, data.length, data, b.uploadedAt],
      );
    }
  }
  urlMap.set(b.url, fileUrl(id, b.pathname));
}
console.log(`${APPLY ? "Kopiert" : "Würde kopieren"}: ${blobs.length - existing.length} neue Dateien (${existing.length} schon vorhanden)`);

// 4. URLs umschreiben
let tourUpdates = 0, expenseUpdates = 0;
for (const t of tours) {
  const next = t.mvvReceiptUrls.map((u) => urlMap.get(u) ?? u);
  if (next.some((u, i) => u !== t.mvvReceiptUrls[i])) {
    tourUpdates++;
    if (APPLY) await db.query(`update "Tour" set "mvvReceiptUrls" = $1 where id = $2`, [next, t.id]);
  }
}
for (const e of expenses) {
  const next = urlMap.get(e.receiptUrl);
  if (next) {
    expenseUpdates++;
    if (APPLY) await db.query(`update "Expense" set "receiptUrl" = $1 where id = $2`, [next, e.id]);
  }
}
console.log(`${APPLY ? "Umgeschrieben" : "Würde umschreiben"}: ${tourUpdates} Touren, ${expenseUpdates} Auslagen`);
if (!APPLY) console.log("\nProbelauf – nichts geändert. Mit --apply ausführen.");
await db.end();
