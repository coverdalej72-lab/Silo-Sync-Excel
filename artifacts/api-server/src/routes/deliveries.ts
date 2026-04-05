import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, deliveriesTable, shedGroupsTable, silosTable } from "@workspace/db";
import {
  CreateDeliveryBody,
  DeleteDeliveryParams,
  ListDeliveriesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/deliveries", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: deliveriesTable.id,
      shedGroupId: deliveriesTable.shedGroupId,
      shedGroupName: shedGroupsTable.name,
      siloId: deliveriesTable.siloId,
      siloLetter: silosTable.letter,
      feedType: deliveriesTable.feedType,
      amount: deliveriesTable.amount,
      unit: deliveriesTable.unit,
      notes: deliveriesTable.notes,
      deliveryDate: deliveriesTable.deliveryDate,
      createdAt: deliveriesTable.createdAt,
    })
    .from(deliveriesTable)
    .leftJoin(shedGroupsTable, eq(deliveriesTable.shedGroupId, shedGroupsTable.id))
    .leftJoin(silosTable, eq(deliveriesTable.siloId, silosTable.id))
    .orderBy(desc(deliveriesTable.deliveryDate));

  const mapped = rows.map((r) => ({
    ...r,
    shedGroupId: r.shedGroupId ?? null,
    shedGroupName: r.shedGroupName ?? null,
    siloId: r.siloId ?? null,
    siloLetter: r.siloLetter ?? null,
    amount: Number(r.amount),
    deliveryDate: r.deliveryDate.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));

  res.json(ListDeliveriesResponse.parse(mapped));
});

router.post("/deliveries", async (req, res): Promise<void> => {
  const parsed = CreateDeliveryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [delivery] = await db
    .insert(deliveriesTable)
    .values({
      shedGroupId: parsed.data.shedGroupId ?? null,
      siloId: parsed.data.siloId ?? null,
      feedType: parsed.data.feedType,
      amount: String(parsed.data.amount),
      unit: parsed.data.unit,
      notes: parsed.data.notes ?? null,
      deliveryDate: parsed.data.deliveryDate ? new Date(parsed.data.deliveryDate) : new Date(),
    })
    .returning();

  const shedGroup = delivery.shedGroupId
    ? await db.select().from(shedGroupsTable).where(eq(shedGroupsTable.id, delivery.shedGroupId)).limit(1)
    : [];
  const silo = delivery.siloId
    ? await db.select().from(silosTable).where(eq(silosTable.id, delivery.siloId)).limit(1)
    : [];

  res.status(201).json({
    ...delivery,
    shedGroupName: shedGroup[0]?.name ?? null,
    siloLetter: silo[0]?.letter ?? null,
    amount: Number(delivery.amount),
    deliveryDate: delivery.deliveryDate.toISOString(),
    createdAt: delivery.createdAt.toISOString(),
  });
});

router.delete("/deliveries/:id", async (req, res): Promise<void> => {
  const params = DeleteDeliveryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [delivery] = await db
    .delete(deliveriesTable)
    .where(eq(deliveriesTable.id, params.data.id))
    .returning();
  if (!delivery) {
    res.status(404).json({ error: "Delivery not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
