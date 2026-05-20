import { Router, type IRouter } from "express";
import { eq, desc, and, gte, lte, asc, inArray } from "drizzle-orm";
import { db, readingsTable, silosTable, shedGroupsTable } from "@workspace/db";
import {
  BatchCreateReadingsBody,
  ListReadingsQueryParams,
  ListReadingsResponse,
  DeleteReadingParams,
} from "@workspace/api-zod";
import { pushReadingsToCloud } from "../lib/onedrive";
import { requireAuth } from "../middlewares/requireAuth";
import { attachFarmScope } from "../middlewares/farmScope";

const router: IRouter = Router();

// ─── Today's progress ────────────────────────────────────────────────────────

router.get("/readings/today", requireAuth, attachFarmScope, async (req, res): Promise<void> => {
  const localDateParam = typeof req.query.localDate === "string" ? req.query.localDate : null;
  const farmId = req.effectiveFarmId;

  let todayStart: Date;
  let todayEnd: Date;

  if (localDateParam && /^\d{4}-\d{2}-\d{2}$/.test(localDateParam)) {
    todayStart = new Date(localDateParam + "T00:00:00.000Z");
    todayStart.setTime(todayStart.getTime() - 14 * 3600_000);
    todayEnd = new Date(localDateParam + "T23:59:59.999Z");
    todayEnd.setTime(todayEnd.getTime() + 14 * 3600_000);
  } else {
    const AEST_MS = 10 * 3600_000;
    const nowAEST = new Date(Date.now() + AEST_MS);
    const aestDate = nowAEST.toISOString().slice(0, 10);
    todayStart = new Date(aestDate + "T00:00:00.000Z");
    todayStart.setTime(todayStart.getTime() - AEST_MS);
    todayEnd = new Date(aestDate + "T23:59:59.999Z");
    todayEnd.setTime(todayEnd.getTime() - AEST_MS);
  }

  const groupsQ = db
    .select()
    .from(shedGroupsTable)
    .orderBy(asc(shedGroupsTable.displayOrder))
    .$dynamic();

  const groups = farmId !== null
    ? await groupsQ.where(eq(shedGroupsTable.farmId, farmId))
    : await groupsQ;

  const silos = await db
    .select()
    .from(silosTable)
    .orderBy(asc(silosTable.letter));

  const readingsQ = db
    .select()
    .from(readingsTable)
    .where(
      and(
        gte(readingsTable.readingDate, todayStart),
        lte(readingsTable.readingDate, todayEnd)
      )
    )
    .$dynamic();

  const todayReadings = farmId !== null
    ? await readingsQ.where(
        and(
          eq(readingsTable.farmId, farmId),
          gte(readingsTable.readingDate, todayStart),
          lte(readingsTable.readingDate, todayEnd)
        )
      )
    : await db
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
  const AEST_MS = 10 * 3600_000;
  const date = localDateParam ?? new Date(Date.now() + AEST_MS).toISOString().slice(0, 10);

  res.json({
    date,
    savedCount,
    totalCount: groups.length,
    sheds,
  });
});

// ─── Batch create readings ────────────────────────────────────────────────────

router.post("/readings/batch", requireAuth, attachFarmScope, async (req, res): Promise<void> => {
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

  const farmId = req.effectiveFarmId;
  if (farmId === null) {
    res.status(400).json({ error: "farmId is required — operators must pass ?farmId= to scope the readings" });
    return;
  }

  // ── Ownership check: all referenced silos must belong to effectiveFarmId ──
  const siloIds = [...new Set(readings.map((r) => r.siloId))];
  const ownedSilos = await db
    .select({ id: silosTable.id })
    .from(silosTable)
    .where(and(inArray(silosTable.id, siloIds), eq(silosTable.farmId, farmId)));
  if (ownedSilos.length !== siloIds.length) {
    res.status(403).json({ error: "One or more silos do not belong to this farm" });
    return;
  }

  const date = readingDate ? new Date(readingDate) : new Date();

  const inserted = await db
    .insert(readingsTable)
    .values(
      readings.map((r) => ({
        farmId,
        siloId: r.siloId,
        feedType: r.feedType,
        amountRemaining: String(r.amountRemaining),
        unit: r.unit,
        notes: r.notes ?? null,
        readingDate: date,
      }))
    )
    .returning();

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

router.get("/readings", requireAuth, attachFarmScope, async (req, res): Promise<void> => {
  const parsed = ListReadingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { limit } = parsed.data;
  const farmId = req.effectiveFarmId;

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

  if (farmId !== null) {
    query = query.where(eq(readingsTable.farmId, farmId));
  }

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

router.delete("/readings/:id", requireAuth, attachFarmScope, async (req, res): Promise<void> => {
  const params = DeleteReadingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const farmId = req.effectiveFarmId;
  const whereClause = farmId !== null
    ? and(eq(readingsTable.id, params.data.id), eq(readingsTable.farmId, farmId))
    : eq(readingsTable.id, params.data.id);

  const [reading] = await db
    .delete(readingsTable)
    .where(whereClause)
    .returning();

  if (!reading) {
    res.status(404).json({ error: "Reading not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
