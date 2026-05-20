import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, farmsTable, shedGroupsTable, silosTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { clerkClient } from "@clerk/express";
const VALID_TIERS = new Set(["bronze", "silver", "gold", "platinum"]);

function parseCreateFarmBody(body: unknown): { name: string; planTier: string; managerEmail?: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || b.name.trim().length === 0) return null;
  const planTier = typeof b.planTier === "string" && VALID_TIERS.has(b.planTier) ? b.planTier : "bronze";
  const managerEmail = typeof b.managerEmail === "string" && b.managerEmail.includes("@") ? b.managerEmail : undefined;
  return { name: b.name.trim(), planTier, managerEmail };
}

function parseUpdateFarmBody(body: unknown): { name?: string; planTier?: string; clerkUserId?: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const result: { name?: string; planTier?: string; clerkUserId?: string } = {};
  if (typeof b.name === "string" && b.name.trim()) result.name = b.name.trim();
  if (typeof b.planTier === "string" && VALID_TIERS.has(b.planTier)) result.planTier = b.planTier;
  if (typeof b.clerkUserId === "string") result.clerkUserId = b.clerkUserId;
  return result;
}

const router: IRouter = Router();

// ── GET /api/farms ─────────────────────────────────────────────────────────
router.get("/farms", requireAuth, async (req, res): Promise<void> => {
  if (req.userRole !== "operator") {
    // Farm managers get their own farm only
    if (!req.userFarmId) {
      res.json([]);
      return;
    }
    const [farm] = await db
      .select()
      .from(farmsTable)
      .where(eq(farmsTable.id, req.userFarmId))
      .limit(1);
    res.json(farm ? [farm] : []);
    return;
  }

  const farms = await db.select().from(farmsTable).orderBy(asc(farmsTable.createdAt));
  res.json(farms);
});

// ── GET /api/farms/mine ────────────────────────────────────────────────────
router.get("/farms/mine", requireAuth, async (req, res): Promise<void> => {
  if (!req.userFarmId) {
    res.status(404).json({ error: "No farm assigned" });
    return;
  }
  const [farm] = await db
    .select()
    .from(farmsTable)
    .where(eq(farmsTable.id, req.userFarmId))
    .limit(1);
  if (!farm) {
    res.status(404).json({ error: "Farm not found" });
    return;
  }
  res.json(farm);
});

// ── POST /api/farms ────────────────────────────────────────────────────────
// Creates the farm row, provisions default shed group + silos, and
// optionally sends a Clerk invite to the farm manager.
router.post("/farms", requireAuth, async (req, res): Promise<void> => {
  if (req.userRole !== "operator") {
    res.status(403).json({ error: "Operator access required" });
    return;
  }

  const parsed = parseCreateFarmBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "Invalid body: name is required" });
    return;
  }

  const { name, planTier, managerEmail } = parsed;

  // 1. Create the farm
  const [farm] = await db
    .insert(farmsTable)
    .values({ name, planTier })
    .returning();

  // 2. Provision a default shed group for the new farm
  const [defaultGroup] = await db
    .insert(shedGroupsTable)
    .values({ farmId: farm.id, name: "Shed 1", displayOrder: 0 })
    .returning();

  // 3. Provision default silos (A and B) for the default shed group
  await db.insert(silosTable).values([
    { farmId: farm.id, shedGroupId: defaultGroup.id, letter: "A", name: "Silo A" },
    { farmId: farm.id, shedGroupId: defaultGroup.id, letter: "B", name: "Silo B" },
  ]);

  // 4. Send Clerk invitation to the farm manager if email provided
  if (managerEmail) {
    try {
      await clerkClient.invitations.createInvitation({
        emailAddress: managerEmail,
        publicMetadata: { role: "farm_manager", farmId: farm.id, farmName: name },
        notify: true,
      });
    } catch (err: unknown) {
      req.log.warn({ err: (err as Error)?.message }, "Failed to send Clerk invite");
    }
  }

  res.status(201).json(farm);
});

// ── PATCH /api/farms/:id ───────────────────────────────────────────────────
router.patch("/farms/:id", requireAuth, async (req, res): Promise<void> => {
  if (req.userRole !== "operator") {
    res.status(403).json({ error: "Operator access required" });
    return;
  }

  const farmId = parseInt(req.params["id"] as string, 10);
  if (isNaN(farmId)) {
    res.status(400).json({ error: "Invalid farm ID" });
    return;
  }

  const parsed = parseUpdateFarmBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const updates: Partial<{ name: string; planTier: string; clerkUserId: string }> = {};
  if (parsed.name !== undefined) updates.name = parsed.name;
  if (parsed.planTier !== undefined) updates.planTier = parsed.planTier;
  if (parsed.clerkUserId !== undefined) updates.clerkUserId = parsed.clerkUserId;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [farm] = await db
    .update(farmsTable)
    .set(updates)
    .where(eq(farmsTable.id, farmId))
    .returning();

  if (!farm) {
    res.status(404).json({ error: "Farm not found" });
    return;
  }

  res.json(farm);
});

// ── DELETE /api/farms/:id ──────────────────────────────────────────────────
router.delete("/farms/:id", requireAuth, async (req, res): Promise<void> => {
  if (req.userRole !== "operator") {
    res.status(403).json({ error: "Operator access required" });
    return;
  }

  const farmId = parseInt(req.params["id"] as string, 10);
  if (isNaN(farmId)) {
    res.status(400).json({ error: "Invalid farm ID" });
    return;
  }

  const [farm] = await db
    .delete(farmsTable)
    .where(eq(farmsTable.id, farmId))
    .returning();

  if (!farm) {
    res.status(404).json({ error: "Farm not found" });
    return;
  }

  res.sendStatus(204);
});

// ── POST /api/farms/set-operator ───────────────────────────────────────────
// Promote another Clerk user to operator role. Requires operator auth.
router.post("/farms/set-operator", requireAuth, async (req, res): Promise<void> => {
  if (req.userRole !== "operator") {
    res.status(403).json({ error: "Operator access required" });
    return;
  }

  const { userId } = req.body as { userId?: string };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }

  try {
    await clerkClient.users.updateUserMetadata(userId, {
      publicMetadata: { role: "operator" },
    });
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error)?.message ?? "Failed to update metadata" });
  }
});

export default router;
