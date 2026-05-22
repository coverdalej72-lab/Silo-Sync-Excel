import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, silosTable } from "@workspace/db";
import { CreateSiloBody, UpdateSiloBody, UpdateSiloParams, DeleteSiloParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { attachFarmScope } from "../middlewares/farmScope";

const router: IRouter = Router();

router.get("/silos", requireAuth, attachFarmScope, async (req, res): Promise<void> => {
  const farmId = req.effectiveFarmId;

  const q = db.select().from(silosTable).orderBy(asc(silosTable.name)).$dynamic();
  const silos = farmId !== null ? await q.where(eq(silosTable.farmId, farmId)) : await q;

  res.json(
    silos.map((s) => ({
      id: s.id,
      name: s.name,
      defaultFeedType: s.defaultFeedType ?? null,
    })),
  );
});

router.post("/silos", requireAuth, attachFarmScope, async (req, res): Promise<void> => {
  const farmId = req.effectiveFarmId;
  if (farmId === null) {
    res.status(400).json({ error: "farmId is required to create a silo" });
    return;
  }

  const body = CreateSiloBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [created] = await db
    .insert(silosTable)
    .values({
      farmId,
      name: body.data.name,
      defaultFeedType: body.data.defaultFeedType ?? null,
    })
    .returning();

  res.status(201).json({
    id: created.id,
    name: created.name,
    defaultFeedType: created.defaultFeedType ?? null,
  });
});

router.patch("/silos/:id", requireAuth, attachFarmScope, async (req, res): Promise<void> => {
  const params = UpdateSiloParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateSiloBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const farmId = req.effectiveFarmId;
  const updates: Partial<typeof silosTable.$inferInsert> = {};

  if (body.data.name !== undefined) {
    updates.name = body.data.name;
  }
  if (body.data.defaultFeedType !== undefined) {
    updates.defaultFeedType = body.data.defaultFeedType ?? null;
  }

  const baseWhere = farmId !== null
    ? and(eq(silosTable.id, params.data.id), eq(silosTable.farmId, farmId))
    : eq(silosTable.id, params.data.id);

  const [updated] = await db
    .update(silosTable)
    .set(updates)
    .where(baseWhere)
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Silo not found" });
    return;
  }

  res.json({
    id: updated.id,
    name: updated.name,
    defaultFeedType: updated.defaultFeedType ?? null,
  });
});

router.delete("/silos/:id", requireAuth, attachFarmScope, async (req, res): Promise<void> => {
  const params = DeleteSiloParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const farmId = req.effectiveFarmId;
  const whereClause = farmId !== null
    ? and(eq(silosTable.id, params.data.id), eq(silosTable.farmId, farmId))
    : eq(silosTable.id, params.data.id);

  const [deleted] = await db
    .delete(silosTable)
    .where(whereClause)
    .returning({ id: silosTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Silo not found" });
    return;
  }

  res.status(204).send();
});

export default router;
