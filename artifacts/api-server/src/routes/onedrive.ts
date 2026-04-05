import { Router, type IRouter } from "express";
import { isOnedriveConnected, getOnedriveFileId } from "../lib/onedrive";

const router: IRouter = Router();

router.get("/onedrive/status", async (_req, res): Promise<void> => {
  const connected = isOnedriveConnected();
  const fileId = getOnedriveFileId();
  res.json({
    connected,
    fileId: fileId ?? null,
    fileName: fileId ? "SiloReadings.csv" : null,
  });
});

export default router;
