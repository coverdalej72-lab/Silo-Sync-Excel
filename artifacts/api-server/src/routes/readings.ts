import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, readingsTable, silosTable } from "@workspace/db";
import {
  ListReadingsQueryParams,
  ListReadingsResponse,
  CreateReadingBody,
  GetReadingsSummaryResponse,
  DeleteReadingParams,
} from "@workspace/api-zod";
import { pushReadingsToCloud } from "../lib/onedrive";

const router: IRouter = Router();

router.get("/readings", async (req, res): Promise<void> => {
  const parsed = ListReadingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { siloId, limit } = parsed.data;

  let query = db
    .select({
      id: readingsTable.id,
      siloId: readingsTable.siloId,
      siloName: silosTable.name,
      feedType: readingsTable.feedType,
      amountRemaining: readingsTable.amountRemaining,
      unit: readingsTable.unit,
      notes: readingsTable.notes,
      readingDate: readingsTable.readingDate,
      createdAt: readingsTable.createdAt,
    })
    .from(readingsTable)
    .innerJoin(silosTable, eq(readingsTable.siloId, silosTable.id))
    .orderBy(desc(readingsTable.readingDate))
    .$dynamic();

  if (siloId != null) {
    query = query.where(eq(readingsTable.siloId, siloId));
  }

  if (limit != null) {
    query = query.limit(limit);
  }

  const rows = await query;
  const mapped = rows.map((r) => ({
    ...r,
    amountRemaining: Number(r.amountRemaining),
    readingDate: r.readingDate.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));
  res.json(ListReadingsResponse.parse(mapped));
});

router.post("/readings", async (req, res): Promise<void> => {
  const parsed = CreateReadingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const silo = await db.select().from(silosTable).where(eq(silosTable.id, parsed.data.siloId)).limit(1);
  if (!silo[0]) {
    res.status(400).json({ error: "Silo not found" });
    return;
  }

  const insertData = {
    siloId: parsed.data.siloId,
    feedType: parsed.data.feedType,
    amountRemaining: String(parsed.data.amountRemaining),
    unit: parsed.data.unit,
    notes: parsed.data.notes ?? null,
    readingDate: parsed.data.readingDate ? new Date(parsed.data.readingDate) : new Date(),
  };

  const [reading] = await db.insert(readingsTable).values(insertData).returning();

  // Fire and forget — sync to any connected cloud services
  pushReadingsToCloud().catch((err) => {
    req.log.warn({ err }, "Failed to sync to cloud");
  });

  res.status(201).json({
    ...reading,
    siloName: silo[0].name,
    amountRemaining: Number(reading.amountRemaining),
    readingDate: reading.readingDate.toISOString(),
    createdAt: reading.createdAt.toISOString(),
  });
});

router.get("/readings/summary", async (_req, res): Promise<void> => {
  const subquery = db
    .select({
      siloId: readingsTable.siloId,
      maxId: sql<number>`max(${readingsTable.id})`.as("max_id"),
    })
    .from(readingsTable)
    .groupBy(readingsTable.siloId)
    .as("latest");

  const rows = await db
    .select({
      siloId: readingsTable.siloId,
      siloName: silosTable.name,
      feedType: readingsTable.feedType,
      amountRemaining: readingsTable.amountRemaining,
      unit: readingsTable.unit,
      readingDate: readingsTable.readingDate,
      lastReadingId: readingsTable.id,
    })
    .from(readingsTable)
    .innerJoin(silosTable, eq(readingsTable.siloId, silosTable.id))
    .innerJoin(subquery, eq(readingsTable.id, subquery.maxId));

  const mapped = rows.map((r) => ({
    ...r,
    amountRemaining: Number(r.amountRemaining),
    readingDate: r.readingDate.toISOString(),
  }));

  res.json(GetReadingsSummaryResponse.parse(mapped));
});

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
