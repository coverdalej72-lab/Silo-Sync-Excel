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
  } else {
    req.effectiveFarmId = req.userFarmId ?? null;
  }
  next();
}
