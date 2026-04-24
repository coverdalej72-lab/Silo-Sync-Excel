import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  let dbOk = false;
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const status = dbOk ? "ok" : "degraded";
  res.status(dbOk ? 200 : 503).json({
    status,
    db: dbOk ? "connected" : "unavailable",
    uptime: Math.floor(process.uptime()),
    ts: new Date().toISOString(),
  });
});

export default router;
