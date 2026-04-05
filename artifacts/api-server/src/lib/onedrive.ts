import { db, readingsTable, silosTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "./logger";

// ─── Google Drive ─────────────────────────────────────────────────────────────

export function getGdriveToken(): string | null {
  return process.env.GDRIVE_ACCESS_TOKEN ?? null;
}

export function isGdriveConnected(): boolean {
  return !!getGdriveToken();
}

export function getGdriveFileId(): string | null {
  return process.env.GDRIVE_SPREADSHEET_FILE_ID ?? null;
}

// ─── OneDrive ─────────────────────────────────────────────────────────────────

export function getOnedriveToken(): string | null {
  return process.env.ONEDRIVE_ACCESS_TOKEN ?? null;
}

export function isOnedriveConnected(): boolean {
  return !!getOnedriveToken();
}

export function getOnedriveFileId(): string | null {
  return process.env.ONEDRIVE_EXCEL_FILE_ID ?? null;
}

// ─── Shared CSV builder ───────────────────────────────────────────────────────

async function buildCsv(): Promise<string> {
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
  return [header, ...csvRows].join("\n");
}

// ─── Google Drive sync ────────────────────────────────────────────────────────

async function syncToGdrive(csvContent: string): Promise<void> {
  const token = getGdriveToken();
  if (!token) return;

  const fileId = getGdriveFileId();

  if (fileId) {
    const resp = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/csv" },
        body: csvContent,
      }
    );
    if (!resp.ok) {
      logger.error({ status: resp.status, body: await resp.text() }, "Google Drive update failed");
    } else {
      logger.info({ fileId }, "Google Drive file updated");
    }
  } else {
    const metadata = { name: "Silo Feed Readings", mimeType: "application/vnd.google-apps.spreadsheet" };
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
        process.env.GDRIVE_SPREADSHEET_FILE_ID = data.id;
        logger.info({ fileId: data.id }, "Google Drive spreadsheet created");
      }
    } else {
      logger.error({ status: resp.status, body: await resp.text() }, "Google Drive create failed");
    }
  }
}

// ─── OneDrive sync ────────────────────────────────────────────────────────────

async function syncToOneDrive(csvContent: string): Promise<void> {
  const token = getOnedriveToken();
  if (!token) return;

  const fileId = getOnedriveFileId();

  if (fileId) {
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/csv" },
        body: csvContent,
      }
    );
    if (!resp.ok) {
      logger.error({ status: resp.status, body: await resp.text() }, "OneDrive update failed");
    } else {
      logger.info({ fileId }, "OneDrive file updated");
    }
  } else {
    const resp = await fetch(
      "https://graph.microsoft.com/v1.0/me/drive/root:/SiloReadings.csv:/content",
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/csv" },
        body: csvContent,
      }
    );
    if (resp.ok) {
      const data = (await resp.json()) as { id?: string };
      if (data.id) {
        process.env.ONEDRIVE_EXCEL_FILE_ID = data.id;
        logger.info({ fileId: data.id }, "OneDrive file created");
      }
    } else {
      logger.error({ status: resp.status, body: await resp.text() }, "OneDrive create failed");
    }
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function pushReadingsToCloud(): Promise<void> {
  const gdriveConnected = isGdriveConnected();
  const onedriveConnected = isOnedriveConnected();

  if (!gdriveConnected && !onedriveConnected) {
    logger.debug("No cloud storage connected, skipping sync");
    return;
  }

  const csvContent = await buildCsv();

  await Promise.allSettled([
    gdriveConnected ? syncToGdrive(csvContent) : Promise.resolve(),
    onedriveConnected ? syncToOneDrive(csvContent) : Promise.resolve(),
  ]);
}
