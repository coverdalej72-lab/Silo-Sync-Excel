import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, shedGroupsTable, silosTable } from "@workspace/db";
import { ListShedGroupsResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { attachFarmScope } from "../middlewares/farmScope";

const router: IRouter = Router();

router.get("/shed-groups", requireAuth, attachFarmScope, async (req, res): Promise<void> => {
  const farmId = req.effectiveFarmId;

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

  const result = groups.map((g) => ({
    id: g.id,
    name: g.name,
    displayOrder: g.displayOrder,
    silos: silos
      .filter((s) => s.shedGroupId === g.id)
      .map((s) => ({
        id: s.id,
        letter: s.letter ?? "",
        name: s.name,
        defaultFeedType: s.defaultFeedType ?? null,
      })),
  }));

  res.json(ListShedGroupsResponse.parse(result));
});

export default router;
