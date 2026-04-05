import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, silosTable } from "@workspace/db";
import {
  ListSilosResponse,
  CreateSiloBody,
  UpdateSiloParams,
  UpdateSiloBody,
  UpdateSiloResponse,
  DeleteSiloParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/silos", async (_req, res): Promise<void> => {
  const silos = await db.select().from(silosTable).orderBy(silosTable.name);
  res.json(ListSilosResponse.parse(silos));
});

router.post("/silos", async (req, res): Promise<void> => {
  const parsed = CreateSiloBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [silo] = await db.insert(silosTable).values(parsed.data).returning();
  res.status(201).json(silo);
});

router.put("/silos/:id", async (req, res): Promise<void> => {
  const params = UpdateSiloParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateSiloBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [silo] = await db
    .update(silosTable)
    .set(parsed.data)
    .where(eq(silosTable.id, params.data.id))
    .returning();
  if (!silo) {
    res.status(404).json({ error: "Silo not found" });
    return;
  }
  res.json(UpdateSiloResponse.parse(silo));
});

router.delete("/silos/:id", async (req, res): Promise<void> => {
  const params = DeleteSiloParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [silo] = await db
    .delete(silosTable)
    .where(eq(silosTable.id, params.data.id))
    .returning();
  if (!silo) {
    res.status(404).json({ error: "Silo not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
