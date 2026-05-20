import { eq } from "drizzle-orm";
import { db, farmsTable } from "@workspace/db";
import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      effectiveFarmId: number | null;
    }
  }
}

export async function attachFarmScope(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.userRole === "operator") {
    const q = req.query.farmId;
    const parsed = typeof q === "string" ? parseInt(q, 10) : NaN;

    if (!isNaN(parsed)) {
      // Verify the requested farm belongs to this operator's org.
      // We use clerk_org_id = operator's clerkUserId as the org key.
      const [farm] = await db
        .select({ id: farmsTable.id, clerkOrgId: farmsTable.clerkOrgId })
        .from(farmsTable)
        .where(eq(farmsTable.id, parsed))
        .limit(1);

      if (!farm) {
        res.status(404).json({ error: "Farm not found" });
        return;
      }

      // If clerk_org_id is set, enforce that it matches the operator's userId.
      // Farms without clerk_org_id (legacy / unprovisioned) are accessible by any operator.
      if (farm.clerkOrgId && farm.clerkOrgId !== req.clerkUserId) {
        res.status(403).json({ error: "Access denied: farm belongs to a different operations group" });
        return;
      }

      req.effectiveFarmId = parsed;
    } else {
      // Operator without ?farmId → cross-farm / list context; routes decide if this is allowed
      req.effectiveFarmId = null;
    }

    next();
  } else {
    // Farm managers must be assigned to a farm in their Clerk metadata.
    if (!req.userFarmId) {
      res.status(403).json({
        error: "Account not linked to a farm — contact your operator to assign a farm",
      });
      return;
    }
    req.effectiveFarmId = req.userFarmId;
    next();
  }
}
