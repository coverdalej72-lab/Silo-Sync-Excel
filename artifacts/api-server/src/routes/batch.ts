import { Router, type IRouter } from "express";
import { db, deliveriesTable, readingsTable, batchMetaTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.delete("/batch/reset", async (_req, res): Promise<void> => {
  await db.delete(deliveriesTable);
  await db.delete(readingsTable);

  const existing = await db.select().from(batchMetaTable).limit(1);
  const now = new Date();
  if (existing.length > 0) {
    await db.update(batchMetaTable).set({ lastResetAt: now }).where(eq(batchMetaTable.id, existing[0].id));
  } else {
    await db.insert(batchMetaTable).values({ lastResetAt: now });
  }

  res.sendStatus(204);
});

router.get("/batch/version", async (_req, res): Promise<void> => {
  const rows = await db.select().from(batchMetaTable).limit(1);
  if (rows.length === 0) {
    res.json({ version: null });
  } else {
    res.json({ version: rows[0].lastResetAt.toISOString() });
  }
});

export default router;
