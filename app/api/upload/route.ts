import { google } from "googleapis";
import { Readable } from "stream";
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

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const drive = getDriveClient();
  const buffer = Buffer.from(await file.arrayBuffer());

  const uploaded = await drive.files.create({
    requestBody: {
      name: file.name,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID!],
    },
    media: {
      mimeType: file.type || "application/octet-stream",
      body: Readable.from(buffer),
    },
    fields: "id",
  });

  const fileId = uploaded.data.id!;

  await drive.permissions.create({
    fileId,
    requestBody: { type: "anyone", role: "reader" },
  });

  return NextResponse.json({
    url: `https://drive.google.com/file/d/${fileId}/view`,
  });
}
