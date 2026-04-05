import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, shedGroupsTable, silosTable } from "@workspace/db";
import { ListShedGroupsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/shed-groups", async (_req, res): Promise<void> => {
  const groups = await db
    .select()
    .from(shedGroupsTable)
    .orderBy(asc(shedGroupsTable.displayOrder));

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
