import { Router, type IRouter } from "express";
import { isGdriveConnected, getGdriveFileId } from "../lib/onedrive";

const router: IRouter = Router();

router.get("/onedrive/status", async (_req, res): Promise<void> => {
  const connected = isGdriveConnected();
  const fileId = getGdriveFileId();
  res.json({
    connected,
    fileId: fileId ?? null,
    fileName: fileId ? "Silo Feed Readings" : null,
  });
});

export default router;
