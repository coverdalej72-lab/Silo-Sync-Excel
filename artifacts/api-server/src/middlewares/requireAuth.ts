import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      clerkUserId: string;
      userRole: "operator" | "farm_manager";
      userFarmId: number | null;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const meta = (auth.sessionClaims?.publicMetadata ?? {}) as Record<string, unknown>;
  const role = (meta.role as string) === "operator" ? "operator" : "farm_manager";
  const farmId = typeof meta.farmId === "number" ? meta.farmId : null;

  req.clerkUserId = userId;
  req.userRole = role;
  req.userFarmId = farmId;

  next();
}
