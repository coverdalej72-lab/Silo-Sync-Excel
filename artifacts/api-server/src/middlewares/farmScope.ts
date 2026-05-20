import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      effectiveFarmId: number | null;
    }
  }
}

export function attachFarmScope(req: Request, res: Response, next: NextFunction): void {
  if (req.userRole === "operator") {
    const q = req.query.farmId;
    const parsed = typeof q === "string" ? parseInt(q, 10) : NaN;
    req.effectiveFarmId = !isNaN(parsed) ? parsed : null;
    next();
  } else {
    // Farm managers must have a farmId in their Clerk metadata.
    // Deny access if not assigned to a farm — this prevents a misconfigured
    // account from accidentally seeing unscoped (global) data.
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
