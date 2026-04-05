import { Router, type IRouter } from "express";
import { eq, desc, and, gte, lte, asc } from "drizzle-orm";
import { db, readingsTable, silosTable, shedGroupsTable } from "@workspace/db";
import {
  BatchCreateReadingsBody,
  ListReadingsQueryParams,
  ListReadingsResponse,
  DeleteReadingParams,
} from "@workspace/api-zod";
import { pushReadingsToCloud } from "../lib/onedrive";

const router: IRouter = Router();

// ─── Today's progress ────────────────────────────────────────────────────────

router.get("/readings/today", async (req, res): Promise<void> => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const groups = await db
    .select()
    .from(shedGroupsTable)
    .orderBy(asc(shedGroupsTable.displayOrder));

  const silos = await db
    .select()
    .from(silosTable)
    .orderBy(asc(silosTable.letter));

  const todayReadings = await db
    .select()
    .from(readingsTable)
    .where(
      and(
        gte(readingsTable.readingDate, todayStart),
        lte(readingsTable.readingDate, todayEnd)
      )
    );

  const sheds = groups.map((g) => {
    const groupSilos = silos.filter((s) => s.shedGroupId === g.id);
    const siloStatuses = groupSilos.map((s) => {
      const reading = todayReadings.find((r) => r.siloId === s.id);
      return {
        siloId: s.id,
        letter: s.letter ?? "",
        name: s.name,
        saved: !!reading,
        readingId: reading?.id ?? null,
        amountRemaining: reading ? Number(reading.amountRemaining) : null,
        feedType: reading?.feedType ?? null,
        unit: reading?.unit ?? null,
      };
    });

    return {
      shedGroupId: g.id,
      shedGroupName: g.name,
      allSaved: siloStatuses.length > 0 && siloStatuses.every((s) => s.saved),
      silos: siloStatuses,
    };
  });

  const savedCount = sheds.filter((s) => s.allSaved).length;
  const date = new Date().toISOString().slice(0, 10);

  res.json({
    date,
    savedCount,
    totalCount: groups.length,
    sheds,
  });
});

// ─── Batch create readings ────────────────────────────────────────────────────

router.post("/readings/batch", async (req, res): Promise<void> => {
  const parsed = BatchCreateReadingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { readings, readingDate } = parsed.data;
  if (!readings || readings.length === 0) {
    res.status(400).json({ error: "No readings provided" });
    return;
  }

  const date = readingDate ? new Date(readingDate) : new Date();

  const inserted = await db
    .insert(readingsTable)
    .values(
      readings.map((r) => ({
        siloId: r.siloId,
        feedType: r.feedType,
        amountRemaining: String(r.amountRemaining),
        unit: r.unit,
        notes: r.notes ?? null,
        readingDate: date,
      }))
    )
    .returning();

  // Enrich with silo/shed info
  const siloIds = inserted.map((r) => r.siloId);
  const silosData = await db
    .select({
      id: silosTable.id,
      name: silosTable.name,
      letter: silosTable.letter,
      shedGroupId: silosTable.shedGroupId,
    })
    .from(silosTable)
    .where(eq(silosTable.id, siloIds[0]));

  // Get all silos for the batch
  const allSilos = await db.select({
    id: silosTable.id,
    name: silosTable.name,
    letter: silosTable.letter,
    shedGroupId: silosTable.shedGroupId,
  }).from(silosTable);

  const allGroups = await db.select().from(shedGroupsTable);

  const enriched = inserted.map((r) => {
    const silo = allSilos.find((s) => s.id === r.siloId);
    const group = allGroups.find((g) => g.id === silo?.shedGroupId);
    return {
      id: r.id,
      siloId: r.siloId,
      siloName: silo?.name ?? "",
      siloLetter: silo?.letter ?? "",
      shedGroupName: group?.name ?? "",
      feedType: r.feedType,
      amountRemaining: Number(r.amountRemaining),
      unit: r.unit,
      notes: r.notes ?? null,
      readingDate: r.readingDate.toISOString(),
      createdAt: r.createdAt.toISOString(),
    };
  });

  pushReadingsToCloud().catch((err) => {
    req.log.warn({ err }, "Failed to sync to cloud");
  });

  res.status(201).json(enriched);
});

// ─── List readings ────────────────────────────────────────────────────────────

router.get("/readings", async (req, res): Promise<void> => {
  const parsed = ListReadingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { limit } = parsed.data;

  let query = db
    .select({
      id: readingsTable.id,
      siloId: readingsTable.siloId,
      siloName: silosTable.name,
      siloLetter: silosTable.letter,
      shedGroupName: shedGroupsTable.name,
      feedType: readingsTable.feedType,
      amountRemaining: readingsTable.amountRemaining,
      unit: readingsTable.unit,
      notes: readingsTable.notes,
      readingDate: readingsTable.readingDate,
      createdAt: readingsTable.createdAt,
    })
    .from(readingsTable)
    .innerJoin(silosTable, eq(readingsTable.siloId, silosTable.id))
    .leftJoin(shedGroupsTable, eq(silosTable.shedGroupId, shedGroupsTable.id))
    .orderBy(desc(readingsTable.readingDate))
    .$dynamic();

  if (limit != null) {
    query = query.limit(limit);
  }

  const rows = await query;
  const mapped = rows.map((r) => ({
    ...r,
    siloLetter: r.siloLetter ?? "",
    shedGroupName: r.shedGroupName ?? "",
    amountRemaining: Number(r.amountRemaining),
    readingDate: r.readingDate.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));

  res.json(ListReadingsResponse.parse(mapped));
});

// ─── Delete reading ───────────────────────────────────────────────────────────

router.delete("/readings/:id", async (req, res): Promise<void> => {
  const params = DeleteReadingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [reading] = await db
    .delete(readingsTable)
    .where(eq(readingsTable.id, params.data.id))
    .returning();
  if (!reading) {
    res.status(404).json({ error: "Reading not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
