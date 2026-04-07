import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, sponsorsTable } from "@workspace/db";

const router: IRouter = Router();

function checkAdminPassword(req: import("express").Request, res: import("express").Response): boolean {
  const adminPw = process.env.ADMIN_PASSWORD;
  if (!adminPw) {
    res.status(503).json({ error: "Admin password not configured on server" });
    return false;
  }
  const provided = req.headers["x-admin-password"];
  if (provided !== adminPw) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

router.post("/admin/verify", (req, res): void => {
  const adminPw = process.env.ADMIN_PASSWORD;
  if (!adminPw) {
    res.status(503).json({ ok: false, error: "Admin password not configured on server" });
    return;
  }
  const { password } = req.body as { password?: string };
  if (password && password === adminPw) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false });
  }
});

router.get("/sponsors", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(sponsorsTable)
    .orderBy(sponsorsTable.createdAt);

  res.json(
    rows.map(r => ({
      id: String(r.id),
      name: r.name,
      tier: r.tier,
      website: r.website ?? undefined,
      logoUrl: r.logoUrl ?? undefined,
    })),
  );
});

router.post("/sponsors", async (req, res): Promise<void> => {
  if (!checkAdminPassword(req, res)) return;

  const { name, tier, website, logoUrl } = req.body as {
    name?: string;
    tier?: string;
    website?: string;
    logoUrl?: string;
  };

  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const validTiers = ["gold", "flock", "seedling"];
  const safeTier = validTiers.includes(tier ?? "") ? tier! : "flock";

  const [row] = await db
    .insert(sponsorsTable)
    .values({
      name: name.trim(),
      tier: safeTier,
      website: website?.trim() || null,
      logoUrl: logoUrl?.trim() || null,
    })
    .returning();

  res.status(201).json({
    id: String(row.id),
    name: row.name,
    tier: row.tier,
    website: row.website ?? undefined,
    logoUrl: row.logoUrl ?? undefined,
  });
});

router.delete("/sponsors/:id", async (req, res): Promise<void> => {
  if (!checkAdminPassword(req, res)) return;

  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [deleted] = await db
    .delete(sponsorsTable)
    .where(eq(sponsorsTable.id, id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Sponsor not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
