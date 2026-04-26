import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
  return google.drive({ version: "v3", auth });
}

async function getOrCreateRechnungenFolder(
  drive: ReturnType<typeof google.drive>,
  rootId: string
): Promise<string> {
  const res = await drive.files.list({
    q: `name = 'Rechnungen' and '${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
  });
  if (res.data.files?.length) return res.data.files[0].id!;

  const folder = await drive.files.create({
    requestBody: {
      name: "Rechnungen",
      mimeType: "application/vnd.google-apps.folder",
      parents: [rootId],
    },
    fields: "id",
  });
  return folder.data.id!;
}

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: "No name" }, { status: 400 });

  try {
    const drive = getDriveClient();
    const rechnungenId = await getOrCreateRechnungenFolder(
      drive,
      process.env.GOOGLE_DRIVE_FOLDER_ID!
    );

    const shortId = Date.now().toString(36).slice(-4).toUpperCase();
    const folderName = `${name} · ${shortId}`;

    const folder = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [rechnungenId],
      },
      fields: "id",
    });

    return NextResponse.json({ folderId: folder.data.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Drive folder error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
