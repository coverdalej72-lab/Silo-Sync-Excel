import { db, readingsTable, silosTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "./logger";

const FILE_ID_KEY = "GDRIVE_SPREADSHEET_FILE_ID";

export function getGdriveToken(): string | null {
  return process.env.GDRIVE_ACCESS_TOKEN ?? null;
}

export function isGdriveConnected(): boolean {
  return !!getGdriveToken();
}

export function getGdriveFileId(): string | null {
  return process.env[FILE_ID_KEY] ?? null;
}

export async function pushReadingsToGdrive(): Promise<void> {
  const token = getGdriveToken();
  if (!token) {
    logger.debug("Google Drive not connected, skipping sync");
    return;
  }

  const rows = await db
    .select({
      id: readingsTable.id,
      siloName: silosTable.name,
      feedType: readingsTable.feedType,
      amountRemaining: readingsTable.amountRemaining,
      unit: readingsTable.unit,
      notes: readingsTable.notes,
      readingDate: readingsTable.readingDate,
    })
    .from(readingsTable)
    .innerJoin(silosTable, eq(readingsTable.siloId, silosTable.id))
    .orderBy(desc(readingsTable.readingDate))
    .limit(500);

  const header = "ID,Silo,Feed Type,Amount Remaining,Unit,Notes,Reading Date";
  const csvRows = rows.map((r) =>
    [
      r.id,
      `"${r.siloName.replace(/"/g, '""')}"`,
      `"${r.feedType.replace(/"/g, '""')}"`,
      Number(r.amountRemaining),
      `"${r.unit}"`,
      r.notes ? `"${r.notes.replace(/"/g, '""')}"` : "",
      r.readingDate.toISOString(),
    ].join(",")
  );
  const csvContent = [header, ...csvRows].join("\n");

  const fileId = getGdriveFileId();

  if (fileId) {
    // Update existing file content
    const resp = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "text/csv",
        },
        body: csvContent,
      }
    );
    if (!resp.ok) {
      const text = await resp.text();
      logger.error({ status: resp.status, body: text }, "Failed to update Google Drive file");
    } else {
      logger.info({ fileId }, "Google Drive file updated");
    }
  } else {
    // Create new file as a Google Sheet (convert CSV on import)
    const metadata = {
      name: "Silo Feed Readings",
      mimeType: "application/vnd.google-apps.spreadsheet",
    };

    const boundary = "silo_boundary_42";
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: text/csv",
      "",
      csvContent,
      `--${boundary}--`,
    ].join("\r\n");

    const resp = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&convert=true",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );

    if (resp.ok) {
      const data = (await resp.json()) as { id?: string };
      if (data.id) {
        process.env[FILE_ID_KEY] = data.id;
        logger.info({ fileId: data.id }, "Google Drive spreadsheet created");
      }
    } else {
      const text = await resp.text();
      logger.error({ status: resp.status, body: text }, "Failed to create Google Drive file");
    }
  }
}
