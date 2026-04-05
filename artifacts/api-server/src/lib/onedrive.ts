import { db, readingsTable, silosTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "./logger";

// OneDrive file info stored in environment (set after first upload)
const ONEDRIVE_FILE_ID_KEY = "ONEDRIVE_EXCEL_FILE_ID";

function getOnedriveToken(): string | null {
  return process.env.ONEDRIVE_ACCESS_TOKEN ?? null;
}

export function isOnedriveConnected(): boolean {
  return !!getOnedriveToken();
}

export function getOnedriveFileId(): string | null {
  return process.env[ONEDRIVE_FILE_ID_KEY] ?? null;
}

export async function pushReadingsToOneDrive(): Promise<void> {
  const token = getOnedriveToken();
  if (!token) {
    logger.debug("OneDrive not connected, skipping sync");
    return;
  }

  // Fetch all readings
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

  // Build CSV content
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

  const fileId = getOnedriveFileId();

  if (fileId) {
    // Update existing file
    await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/csv",
      },
      body: csvContent,
    });
    logger.info({ fileId }, "OneDrive file updated");
  } else {
    // Create new file
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root:/SiloReadings.csv:/content`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "text/csv",
        },
        body: csvContent,
      }
    );
    if (response.ok) {
      const data = (await response.json()) as { id?: string };
      if (data.id) {
        // Store the file ID for future updates
        process.env[ONEDRIVE_FILE_ID_KEY] = data.id;
        logger.info({ fileId: data.id }, "OneDrive file created");
      }
    } else {
      const text = await response.text();
      logger.error({ status: response.status, body: text }, "Failed to create OneDrive file");
    }
  }
}
