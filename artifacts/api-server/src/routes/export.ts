import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, readingsTable, silosTable } from "@workspace/db";

const router: IRouter = Router();

// Format a UTC Date as DD/MM/YYYY in Australian Eastern Time (UTC+10).
// Using a fixed +10 offset (AEST) is safe: readings are saved at local noon,
// so the stored UTC time is 02:00 (AEST) or 01:00 (AEDT) — either way the
// date part in +10 always matches the intended Australian calendar date.
function toAESTDateStr(d: Date): string {
  const AEST_MS = 10 * 3600_000;
  const local = new Date(d.getTime() + AEST_MS);
  const dd = String(local.getUTCDate()).padStart(2, "0");
  const mm = String(local.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = local.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

router.get("/readings/export.csv", async (req, res): Promise<void> => {
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
    .orderBy(desc(readingsTable.readingDate));

  const header = "ID,Silo,Feed Type,Amount Remaining,Unit,Notes,Reading Date";
  const csvRows = rows.map((r) =>
    [
      r.id,
      `"${r.siloName.replace(/"/g, '""')}"`,
      `"${r.feedType.replace(/"/g, '""')}"`,
      Number(r.amountRemaining),
      `"${r.unit}"`,
      r.notes ? `"${r.notes.replace(/"/g, '""')}"` : "",
      toAESTDateStr(r.readingDate),
    ].join(",")
  );

  const csv = [header, ...csvRows].join("\n");
  const date = new Date().toISOString().slice(0, 10);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="silo-readings-${date}.csv"`);
  res.send(csv);
});

export default router;
