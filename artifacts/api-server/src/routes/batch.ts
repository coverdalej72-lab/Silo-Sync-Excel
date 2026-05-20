import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, deliveriesTable, readingsTable, batchMetaTable } from "@workspace/db";

const router: IRouter = Router();

router.delete("/batch/reset", async (req, res): Promise<void> => {
  const farmId = req.effectiveFarmId;
  if (farmId === null) {
    res.status(400).json({ error: "farmId is required — pass ?farmId= to scope the reset" });
    return;
  }

  await db.delete(deliveriesTable).where(eq(deliveriesTable.farmId, farmId));
  await db.delete(readingsTable).where(eq(readingsTable.farmId, farmId));

  const existing = await db
    .select()
    .from(batchMetaTable)
    .where(eq(batchMetaTable.farmId, farmId))
    .limit(1);

  const now = new Date();
  if (existing.length > 0) {
    await db
      .update(batchMetaTable)
      .set({ lastResetAt: now })
      .where(and(eq(batchMetaTable.id, existing[0].id), eq(batchMetaTable.farmId, farmId)));
  } else {
    await db.insert(batchMetaTable).values({ farmId, lastResetAt: now });
  }

  res.sendStatus(204);
});

router.get("/batch/version", async (req, res): Promise<void> => {
  const farmId = req.effectiveFarmId;
  const q = db.select().from(batchMetaTable).$dynamic();
  const rows = farmId !== null
    ? await q.where(eq(batchMetaTable.farmId, farmId)).limit(1)
    : await q.limit(1);

  if (rows.length === 0) {
    res.json({ version: null });
  } else {
    res.json({ version: rows[0].lastResetAt.toISOString() });
  }
});

export default router;
