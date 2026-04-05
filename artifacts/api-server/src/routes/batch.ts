import { Router, type IRouter } from "express";
import { db, deliveriesTable, readingsTable } from "@workspace/db";

const router: IRouter = Router();

router.delete("/batch/reset", async (_req, res): Promise<void> => {
  await db.delete(deliveriesTable);
  await db.delete(readingsTable);
  res.sendStatus(204);
});

export default router;
